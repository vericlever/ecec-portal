"use server";

import { revalidatePath } from "next/cache";
import { getProfile, isManager } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { storeReviewEvidence } from "@/lib/documents/store";

type Result = { ok: true } | { ok: false; error: string };

type ActionInput = {
  description: string;
  raisedFrom: "practice" | "outcome";
  ownerId: string;
  dueDate: string;
};

// One event: a manager reflects on practice and outcomes, decides whether the
// procedure stands or needs revision, and optionally raises owned, dated
// actions. Zero extra work when practice holds - a 'stands' review with no
// actions is two paragraphs, an optional file and a button.
export async function submitReview(sopId: string, formData: FormData): Promise<Result> {
  const me = await getProfile();
  if (!me || !me.organisation_id || !isManager(me.access_tier)) {
    return { ok: false, error: "Only a manager can complete a review." };
  }

  const practice = String(formData.get("practice") ?? "").trim();
  const outcome = String(formData.get("outcome") ?? "").trim();
  const decision = String(formData.get("decision") ?? "");
  const file = formData.get("file");

  if (!practice) {
    return { ok: false, error: "Describe practice across the team." };
  }
  if (!outcome) {
    return { ok: false, error: "Describe what the outcomes tell you." };
  }
  if (decision !== "stands" && decision !== "needs_revision") {
    return { ok: false, error: "Choose a decision." };
  }

  let actions: ActionInput[] = [];
  try {
    const raw = JSON.parse(String(formData.get("actions") ?? "[]"));
    if (Array.isArray(raw)) {
      actions = raw.filter(
        (a): a is ActionInput =>
          a &&
          typeof a.description === "string" &&
          a.description.trim() &&
          (a.raisedFrom === "practice" || a.raisedFrom === "outcome") &&
          typeof a.ownerId === "string" &&
          a.ownerId &&
          typeof a.dueDate === "string" &&
          /^\d{4}-\d{2}-\d{2}$/.test(a.dueDate),
      );
    }
  } catch {
    return { ok: false, error: "Could not read the actions list." };
  }

  const supabase = createClient();
  const { data: sop } = await supabase
    .from("sops")
    .select("id, organisation_id, published_version")
    .eq("id", sopId)
    .maybeSingle();
  if (!sop || sop.organisation_id !== me.organisation_id) {
    return { ok: false, error: "Procedure not found." };
  }
  if (sop.published_version == null) {
    return { ok: false, error: "This procedure is not published yet." };
  }

  // Owners must be staff in this organisation - not arbitrary ids handed
  // back from the client.
  if (actions.length) {
    const ownerIds = [...new Set(actions.map((a) => a.ownerId))];
    const { data: owners } = await supabase
      .from("profiles")
      .select("id")
      .in("id", ownerIds)
      .eq("organisation_id", me.organisation_id);
    const validOwners = new Set((owners ?? []).map((o) => o.id as string));
    const invalid = actions.some((a) => !validOwners.has(a.ownerId));
    if (invalid) return { ok: false, error: "Choose a valid owner for every action." };
  }

  let evidencePath: string | null = null;
  if (file instanceof File && file.size > 0) {
    if (file.size > 15 * 1024 * 1024) {
      return { ok: false, error: "That file is over 15 MB." };
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    const stored = await storeReviewEvidence({
      organisationId: me.organisation_id,
      sopId,
      fileName: file.name,
      mimeType: file.type || null,
      bytes,
    });
    if (!stored.ok) return { ok: false, error: stored.error };
    evidencePath = stored.path;
  }

  // previous_review_id links the chain for the report - the most recent
  // prior review, if any.
  const { data: prev } = await supabase
    .from("sop_reviews")
    .select("id")
    .eq("sop_id", sopId)
    .order("reviewed_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: review, error } = await supabase
    .from("sop_reviews")
    .insert({
      organisation_id: me.organisation_id,
      sop_id: sopId,
      reviewed_by: me.id,
      practice_reflection: practice,
      outcome_reflection: outcome,
      decision,
      evidence_path: evidencePath,
      previous_review_id: prev?.id ?? null,
    })
    .select("id")
    .single();
  if (error || !review) {
    return { ok: false, error: error?.message ?? "Could not save the review." };
  }

  for (const a of actions) {
    await supabase.from("sop_review_actions").insert({
      organisation_id: me.organisation_id,
      review_id: review.id,
      sop_id: sopId,
      description: a.description.trim(),
      raised_from: a.raisedFrom,
      owner_id: a.ownerId,
      due_date: a.dueDate,
    });
  }

  revalidatePath(`/admin/sops/${sopId}`);
  revalidatePath(`/admin/sops/${sopId}/review`);
  revalidatePath("/admin/sops");
  revalidatePath("/admin");
  return { ok: true };
}

// Completing (or cancelling) an action raised by any review on this SOP -
// reached from the procedure page, not this form. Available to a manager, or
// the action's own owner (RLS backs the same rule - sop_review_actions_update).
export async function setActionStatus(
  actionId: string,
  status: "done" | "cancelled",
  completionNote?: string,
): Promise<Result> {
  const me = await getProfile();
  if (!me) return { ok: false, error: "Sign in." };

  const supabase = createClient();
  const patch: Record<string, unknown> = { status };
  if (status === "done") {
    patch.completed_at = new Date().toISOString();
    patch.completed_by = me.id;
    patch.completion_note = completionNote?.trim() || null;
  }

  const { data, error } = await supabase
    .from("sop_review_actions")
    .update(patch)
    .eq("id", actionId)
    .select("sop_id")
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "You cannot change this action." };

  revalidatePath(`/admin/sops/${data.sop_id}`);
  revalidatePath("/admin/sops");
  return { ok: true };
}
