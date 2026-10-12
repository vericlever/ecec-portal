"use server";

import { revalidatePath } from "next/cache";
import { getProfile, isManager } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { extractOutcomeDocument } from "@/lib/documents/outcome-extract";
import { redactOutcomeText } from "@/lib/redaction";
import { generateText } from "@/lib/ai/client";
import { sweepStaleQuarantineFiles } from "@/lib/outcome-quarantine";
import { numberLines, buildSuggestUserMessage, verifySuggestions, SUGGEST_SYSTEM_PROMPT } from "@/lib/outcome-suggest";
import { createHash } from "node:crypto";

type Result = { ok: true } | { ok: false; error: string };

const QUARANTINE_BUCKET = "outcome-quarantine";

async function requireManagerProfile() {
  const me = await getProfile();
  if (!me || !me.organisation_id || !isManager(me.access_tier)) {
    throw new Error("Only a manager can use Our Outcomes.");
  }
  return me;
}

// B5.1: a signed upload URL for the browser to upload straight to the
// quarantine bucket - authorisation happens here, before the URL is handed
// out, not at the bucket (outcome-quarantine has no storage.objects policy).
export async function createQuarantineUploadUrl(fileName: string): Promise<
  { ok: true; path: string; token: string } | { ok: false; error: string }
> {
  const me = await requireManagerProfile();
  const admin = createAdminClient();
  // Hold the one-hour rule on abandoned originals whenever uploads are in use
  // (the daily cron is only the backstop). Best effort: never blocks an upload.
  try {
    await sweepStaleQuarantineFiles(admin, me.organisation_id!);
  } catch (e) {
    console.error("quarantine sweep failed:", e);
  }
  const path = `${me.organisation_id}/${Date.now()}-${fileName.replace(/[^\w.\-]/g, "_")}`;
  const { data, error } = await admin.storage.from(QUARANTINE_BUCKET).createSignedUploadUrl(path);
  if (error || !data) return { ok: false, error: error?.message ?? "Could not prepare the upload." };
  return { ok: true, path, token: data.token };
}

// B5.2-B5.4: download the quarantined file, extract text, redact it. Returns
// the redacted preview text without saving anything yet - B5.5's preview
// screen shows this, and the uploader may redact further before B5.6 saves.
export async function extractAndRedact(
  quarantinePath: string,
  fileName: string,
): Promise<{ ok: true; redactedText: string; originalFormat: string; originalSha256: string } | { ok: false; error: string }> {
  const me = await requireManagerProfile();
  const admin = createAdminClient();

  const { data: fileData, error: downloadError } = await admin.storage.from(QUARANTINE_BUCKET).download(quarantinePath);
  if (downloadError || !fileData) {
    return { ok: false, error: downloadError?.message ?? "Could not read the uploaded file." };
  }
  const bytes = new Uint8Array(await fileData.arrayBuffer());
  const originalSha256 = createHash("sha256").update(bytes).digest("hex");

  const extracted = await extractOutcomeDocument(fileName, bytes);
  if (!extracted.ok) return { ok: false, error: extracted.error };

  const { data: staff } = await admin
    .from("profiles")
    .select("full_name")
    .eq("organisation_id", me.organisation_id);
  const staffNames = (staff ?? []).map((s) => s.full_name as string);

  const { redacted } = await redactOutcomeText(extracted.text, staffNames);

  return { ok: true, redactedText: redacted, originalFormat: extracted.format, originalSha256 };
}

// B5.5: further manual redaction from the preview screen - selection-based,
// never a removal.
export async function redactSelection(text: string, start: number, end: number): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  await requireManagerProfile();
  if (start < 0 || end > text.length || start >= end) return { ok: false, error: "Invalid selection." };
  return { ok: true, text: text.slice(0, start) + "[REDACTED]" + text.slice(end) };
}

// B5.7: cancelling the upload deletes the quarantine file immediately,
// rather than leaving it for the hourly cron sweep - that sweep is a
// backstop for abandoned uploads (closed tab, crash), not the primary path.
export async function cancelUpload(quarantinePath: string): Promise<Result> {
  await requireManagerProfile();
  const admin = createAdminClient();
  const { error } = await admin.storage.from(QUARANTINE_BUCKET).remove([quarantinePath]);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export type OutcomeSourceType = "incident_reports" | "staff_feedback" | "parent_feedback" | "regulator" | "other";

type SaveInput = {
  quarantinePath: string;
  redactedText: string;
  originalFormat: string;
  originalSha256: string;
  sourceType: OutcomeSourceType;
  serviceId: string | null;
  periodStart: string;
  periodEnd: string;
  isConfidential: boolean;
};

// B5.6: the confidential check and save. Yes on the confidential question
// refuses and deletes - this is the one path that does not create a record.
export async function saveOutcomeRecord(input: SaveInput): Promise<Result> {
  const me = await requireManagerProfile();
  const admin = createAdminClient();

  // Always clean up the quarantine file, whether saving or refusing.
  const cleanup = () => admin.storage.from(QUARANTINE_BUCKET).remove([input.quarantinePath]);

  if (input.isConfidential) {
    await cleanup();
    return {
      ok: false,
      error: "This doesn't belong here. Record it in the confidential record set out in the relevant policy.",
    };
  }

  if (!input.periodStart || !input.periodEnd || input.periodEnd < input.periodStart) {
    await cleanup();
    return { ok: false, error: "The end of the period can't be before its start." };
  }

  const supabase = createClient();
  const { data: record, error } = await supabase
    .from("outcome_records")
    .insert({
      organisation_id: me.organisation_id,
      service_id: input.serviceId,
      source_type: input.sourceType,
      period_start: input.periodStart,
      period_end: input.periodEnd,
      redacted_body: input.redactedText,
      original_format: input.originalFormat,
      original_sha256: input.originalSha256,
      uploaded_by: me.id,
    })
    .select("id")
    .single();

  await cleanup();

  if (error || !record) return { ok: false, error: error?.message ?? "Could not save the record." };

  // B6: suggest a procedure link. Best-effort - a failure here leaves the
  // record saved with no suggestion rather than losing the upload.
  try {
    await suggestProcedureLinks(record.id as string, me.organisation_id!);
  } catch (e) {
    console.error("suggestProcedureLinks failed:", e);
  }

  revalidatePath("/admin/our-outcomes");
  return { ok: true };
}

// Revision A: overlap warning for the upload form. Warns (never blocks) when
// a non-archived record of the same type for the same service (or both "all
// services") already covers part of the period.
export async function checkOverlap(
  sourceType: OutcomeSourceType,
  serviceId: string | null,
  periodStart: string,
  periodEnd: string,
): Promise<{ overlaps: { periodStart: string; periodEnd: string }[] }> {
  const me = await requireManagerProfile();
  if (!periodStart || !periodEnd || periodEnd < periodStart) return { overlaps: [] };
  const supabase = createClient();
  let query = supabase
    .from("outcome_records")
    .select("period_start, period_end")
    .eq("organisation_id", me.organisation_id!)
    .eq("source_type", sourceType)
    .is("archived_at", null)
    .lte("period_start", periodEnd)
    .gte("period_end", periodStart);
  query = serviceId ? query.eq("service_id", serviceId) : query.is("service_id", null);
  const { data } = await query;
  return {
    overlaps: (data ?? []).map((r) => ({ periodStart: r.period_start as string, periodEnd: r.period_end as string })),
  };
}

// B6, revised: after a record is saved, ask Haiku which published procedures
// (up to four) the record gives reason to review, with verbatim evidence.
// Prompt and verification live in src/lib/outcome-suggest.ts. Only a
// suggestion - counts for nothing until a manager confirms it in "To sort".
// Prompts contain this org's data only.
async function suggestProcedureLinks(recordId: string, organisationId: string): Promise<void> {
  const admin = createAdminClient();
  const { data: record } = await admin.from("outcome_records").select("redacted_body").eq("id", recordId).single();
  if (!record) return;

  const { data: procedures } = await admin
    .from("sops")
    .select("id, name, published_body")
    .eq("organisation_id", organisationId)
    .not("published_version", "is", null);
  if (!procedures || procedures.length === 0) return;

  const numbered = numberLines(record.redacted_body as string);
  const response = await generateText({
    feature: "outcome_link",
    organisationId,
    systemPrompt: SUGGEST_SYSTEM_PROMPT,
    userMessage: buildSuggestUserMessage(
      numbered,
      procedures as { id: string; name: string; published_body: string | null }[],
    ),
    maxTokens: 1500,
  });

  const verified = verifySuggestions(response, numbered, new Set(procedures.map((p) => p.id as string)));
  if (verified.length === 0) return;

  await admin.from("outcome_record_links").insert(
    verified.map((v) => ({
      organisation_id: organisationId,
      record_id: recordId,
      sop_id: v.sopId,
      status: "suggested",
      ai_suggested_sop_id: v.sopId,
      reason: v.reason,
      evidence: v.evidence,
    })),
  );
}

export async function confirmLink(linkId: string): Promise<Result> {
  const me = await requireManagerProfile();
  const supabase = createClient();
  const { error } = await supabase
    .from("outcome_record_links")
    .update({ status: "confirmed", decided_by: me.id, decided_at: new Date().toISOString() })
    .eq("id", linkId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/our-outcomes");
  return { ok: true };
}

// Manual link for a record the AI gave no usable suggestion for. Choosing the
// procedure is itself the manager's decision, so it is saved as confirmed.
// Both ids are read back through the caller's RLS-scoped client first, so a
// record or procedure from another organisation is never linkable.
export async function addProcedureLink(recordId: string, sopId: string): Promise<Result> {
  const me = await requireManagerProfile();
  const supabase = createClient();
  const [{ data: record }, { data: sop }] = await Promise.all([
    supabase.from("outcome_records").select("id").eq("id", recordId).maybeSingle(),
    supabase.from("sops").select("id").eq("id", sopId).maybeSingle(),
  ]);
  if (!record || !sop) return { ok: false, error: "That record or procedure could not be found." };

  const { error } = await supabase.from("outcome_record_links").insert({
    organisation_id: me.organisation_id,
    record_id: recordId,
    sop_id: sopId,
    status: "confirmed",
    decided_by: me.id,
    decided_at: new Date().toISOString(),
    evidence: [],
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/our-outcomes");
  return { ok: true };
}

export async function changeLink(linkId: string, newSopId: string): Promise<Result> {
  const me = await requireManagerProfile();
  const supabase = createClient();
  const { error } = await supabase
    .from("outcome_record_links")
    .update({ sop_id: newSopId, status: "confirmed", decided_by: me.id, decided_at: new Date().toISOString() })
    .eq("id", linkId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/our-outcomes");
  return { ok: true };
}

export async function dismissLink(linkId: string): Promise<Result> {
  const me = await requireManagerProfile();
  const supabase = createClient();
  const { error } = await supabase
    .from("outcome_record_links")
    .update({ status: "dismissed", decided_by: me.id, decided_at: new Date().toISOString() })
    .eq("id", linkId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/our-outcomes");
  return { ok: true };
}

export async function archiveRecord(recordId: string): Promise<Result> {
  await requireManagerProfile();
  const supabase = createClient();
  const { error } = await supabase
    .from("outcome_records")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", recordId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/our-outcomes");
  return { ok: true };
}

export async function listProcedures(): Promise<{ id: string; name: string }[]> {
  const me = await requireManagerProfile();
  const supabase = createClient();
  const { data } = await supabase
    .from("sops")
    .select("id, name")
    .eq("organisation_id", me.organisation_id!)
    .not("published_version", "is", null)
    .order("name");
  return (data ?? []) as { id: string; name: string }[];
}

export async function listOutcomeRecords(): Promise<{ id: string; label: string }[]> {
  const me = await requireManagerProfile();
  const supabase = createClient();
  const { data } = await supabase
    .from("outcome_records")
    .select("id, source_type, period_start, period_end")
    .eq("organisation_id", me.organisation_id!)
    .is("archived_at", null)
    .order("uploaded_at", { ascending: false })
    .limit(50);
  return (data ?? []).map((r) => ({ id: r.id as string, label: `${r.source_type} - ${r.period_start} to ${r.period_end}` }));
}

export async function listPolicies(): Promise<{ id: string; name: string }[]> {
  const me = await requireManagerProfile();
  const supabase = createClient();
  const { data } = await supabase
    .from("policies")
    .select("id, name")
    .eq("organisation_id", me.organisation_id!)
    .not("published_version", "is", null)
    .order("name");
  return (data ?? []) as { id: string; name: string }[];
}

// B7a: raise a policy flag. When it comes from a To-sort suggestion
// (recordId set, no linkId), the procedure suggestion this replaced is
// dismissed in the same call so it doesn't linger in "To sort".
export async function raisePolicyFlag(input: {
  policyId: string;
  note: string;
  recordId?: string;
  dismissLinkId?: string;
}): Promise<Result> {
  const me = await requireManagerProfile();
  if (!input.note.trim()) return { ok: false, error: "Add a note." };
  const supabase = createClient();

  const { error } = await supabase.from("policy_flags").insert({
    organisation_id: me.organisation_id,
    policy_id: input.policyId,
    note: input.note.trim(),
    source: "manager",
    outcome_record_id: input.recordId ?? null,
    raised_by: me.id,
  });
  if (error) return { ok: false, error: error.message };

  if (input.dismissLinkId) {
    await supabase
      .from("outcome_record_links")
      .update({ status: "dismissed", decided_by: me.id, decided_at: new Date().toISOString() })
      .eq("id", input.dismissLinkId);
  }

  revalidatePath("/admin/our-outcomes");
  return { ok: true };
}

// B2: review date changes, for both procedures and policies, from any of the
// three places the spec allows (procedure schedule, review policies list,
// the item's own review page/editor). Goes through the SECURITY DEFINER RPC
// (migration 0091) so a manager_staff - who can complete a review but can't
// otherwise write to sops/policies - can still move the date.
export async function updateReviewDate(
  itemType: "sop" | "policy",
  itemId: string,
  newDate: string,
): Promise<Result> {
  await requireManagerProfile();
  const supabase = createClient();
  const { error } = await supabase.rpc("set_review_date_override", {
    p_item_type: itemType,
    p_item_id: itemId,
    p_new_date: newDate,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/our-outcomes");
  revalidatePath("/admin/our-outcomes/review-policies");
  return { ok: true };
}
