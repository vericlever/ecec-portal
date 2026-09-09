"use server";

import { revalidatePath } from "next/cache";
import { getProfile, isManager } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { cleanReviewPeriod } from "@/lib/constants";
import { reviewDateFromNow } from "@/lib/sop-review";
import { storeDocument } from "@/lib/documents/store";

type Result = { ok: true } | { ok: false; error: string };

// A manager records what they saw when a procedure was carried out, optionally
// with an evidence file. A needs_review outcome raises the flag on the SOP; the
// reset-clock choice is made by the manager on save and respected regardless of
// the outcome tag.
export async function logSopObservation(
  sopId: string,
  formData: FormData,
): Promise<Result> {
  const me = await getProfile();
  if (!me || !me.organisation_id || !isManager(me.access_tier)) {
    return {
      ok: false,
      error: "Only a manager can log a practice observation.",
    };
  }
  const evidence = String(formData.get("evidence") ?? "").trim();
  const outcome = String(formData.get("outcome") ?? "");
  const resetClock = formData.get("resetClock") === "1";
  const file = formData.get("file");

  if (!evidence) return { ok: false, error: "Describe what you observed." };
  if (outcome !== "needs_review" && outcome !== "continue_as_is") {
    return { ok: false, error: "Choose an outcome." };
  }

  const admin = createAdminClient();
  const { data: sop } = await admin
    .from("sops")
    .select(
      "id, organisation_id, name, review_period_months, next_review_date, published_version",
    )
    .eq("id", sopId)
    .maybeSingle();
  if (!sop || sop.organisation_id !== me.organisation_id) {
    return { ok: false, error: "Procedure not found." };
  }
  if (sop.published_version == null) {
    return { ok: false, error: "This procedure is not published yet." };
  }

  const period = cleanReviewPeriod(sop.review_period_months);
  const newDue = resetClock ? reviewDateFromNow(period) : null;

  // Optional evidence file, stored in the same locked-down documents store.
  let evidenceDocumentId: string | null = null;
  if (file instanceof File && file.size > 0) {
    if (file.size > 15 * 1024 * 1024) {
      return { ok: false, error: "That file is over 15 MB." };
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    const stored = await storeDocument({
      organisationId: me.organisation_id,
      ownerType: "sop_evidence",
      ownerId: sopId,
      fileName: file.name,
      mimeType: file.type || null,
      bytes,
      uploadedBy: me.id,
    });
    if (!stored.ok) return { ok: false, error: stored.error };
    evidenceDocumentId = stored.document.id;
  }

  const { error: obsErr } = await admin.from("sop_observations").insert({
    organisation_id: me.organisation_id,
    sop_id: sopId,
    observed_by_profile_id: me.id,
    service_id: me.service_id,
    evidence,
    outcome,
    review_clock_reset: resetClock,
    evidence_document_id: evidenceDocumentId,
  });
  if (obsErr) return { ok: false, error: obsErr.message };

  const sopPatch: Record<string, unknown> = { updated_by: me.id };
  if (outcome === "needs_review") sopPatch.needs_review = true;
  if (newDue) sopPatch.next_review_date = newDue;
  await admin.from("sops").update(sopPatch).eq("id", sopId);

  const excerpt =
    evidence.length > 120 ? evidence.slice(0, 117) + "…" : evidence;
  await admin.from("sop_history").insert({
    organisation_id: me.organisation_id,
    sop_id: sopId,
    event_type: "review",
    actor_profile_id: me.id,
    note:
      `Practice observation — ${
        outcome === "needs_review" ? "needs review" : "continue as is"
      }. ${excerpt}` +
      (evidenceDocumentId ? " Evidence file attached." : "") +
      (newDue
        ? ` Review clock reset to ${newDue}.`
        : " Review clock unchanged."),
    detail: {
      observation: true,
      outcome,
      review_clock_reset: resetClock,
      new_due: newDue,
      has_evidence_file: Boolean(evidenceDocumentId),
    },
  });

  revalidatePath("/admin/observations");
  revalidatePath(`/admin/observations/${sopId}`);
  revalidatePath("/admin/sops");
  revalidatePath(`/admin/sops/${sopId}`);
  revalidatePath("/admin");
  return { ok: true };
}
