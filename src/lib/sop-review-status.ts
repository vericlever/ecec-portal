// sops.next_review_date does not exist (Review cycle v2, migration 0039) - it
// is derived from last_reviewed_at + review_period_months in the
// sop_review_status view. This is the one place that view gets queried, so
// every caller (the SOP list, the dashboard, reports, reminders) reads the
// same derivation the same way.

import { createClient } from "@/lib/supabase/server";

type ServerClient = ReturnType<typeof createClient>;

export type SopReviewStatusRow = {
  lastReviewedAt: string | null;
  nextReviewDate: string | null;
};

// All SOPs in the caller's org (RLS-scoped, same as any other query here).
export async function sopReviewStatusMap(
  supabase: ServerClient,
): Promise<Map<string, SopReviewStatusRow>> {
  const { data } = await supabase
    .from("sop_review_status")
    .select("sop_id, last_reviewed_at, next_review_date");
  const map = new Map<string, SopReviewStatusRow>();
  for (const r of data ?? []) {
    map.set(r.sop_id as string, {
      lastReviewedAt: (r.last_reviewed_at as string | null) ?? null,
      nextReviewDate: (r.next_review_date as string | null) ?? null,
    });
  }
  return map;
}

export async function sopReviewStatusFor(
  supabase: ServerClient,
  sopId: string,
): Promise<SopReviewStatusRow> {
  const { data } = await supabase
    .from("sop_review_status")
    .select("last_reviewed_at, next_review_date")
    .eq("sop_id", sopId)
    .maybeSingle();
  return {
    lastReviewedAt: (data?.last_reviewed_at as string | null) ?? null,
    nextReviewDate: (data?.next_review_date as string | null) ?? null,
  };
}
