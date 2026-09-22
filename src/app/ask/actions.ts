"use server";

import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { answerQuestion, type Source } from "@/lib/ai/service";

type AskResult =
  | { ok: true; answer: string; sources: Source[]; grounded: boolean }
  | { ok: false; error: string; retryAt?: string };

const DAILY_LIMIT = Number(process.env.AI_QA_DAILY_LIMIT_PER_STAFF ?? "30");

export async function askQuestion(question: string): Promise<AskResult> {
  const profile = await requireProfile();
  if (!profile.organisation_id) return { ok: false, error: "No organisation on your account." };
  const trimmed = question.trim();
  if (!trimmed) return { ok: false, error: "Type a question first." };

  const db = createClient();

  // Re-checked here, not just trusted from the nav's hidden button - a
  // direct request to this action must not bypass the per-tenant flag.
  const { data: org } = await db
    .from("organisations")
    .select("ai_qa_enabled")
    .eq("id", profile.organisation_id)
    .maybeSingle();
  if (!org?.ai_qa_enabled) {
    return { ok: false, error: "This isn't turned on for your organisation yet." };
  }

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count } = await db
    .from("ai_interactions")
    .select("id", { count: "exact", head: true })
    .eq("staff_profile_id", profile.id)
    .gte("created_at", since);
  if ((count ?? 0) >= DAILY_LIMIT) {
    // The window is a rolling 24 hours, not a calendar day, so "try again
    // tomorrow" was misleading in both directions: a slot can free up
    // within the hour, or not until late tomorrow, depending on when the
    // questions were actually asked. Tell the person when instead of
    // making them guess. Formatted client-side so it reads in their own
    // timezone rather than the server's.
    const { data: oldest } = await db
      .from("ai_interactions")
      .select("created_at")
      .eq("staff_profile_id", profile.id)
      .gte("created_at", since)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    const retryAt = oldest?.created_at
      ? new Date(new Date(oldest.created_at).getTime() + 24 * 60 * 60 * 1000).toISOString()
      : undefined;

    return {
      ok: false,
      error: `You've asked ${DAILY_LIMIT} questions in the past 24 hours, which is the limit.`,
      retryAt,
    };
  }

  try {
    const result = await answerQuestion(db, profile.organisation_id, profile.id, trimmed);
    return { ok: true, ...result };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Something went wrong." };
  }
}
