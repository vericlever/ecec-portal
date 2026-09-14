"use server";

import { revalidatePath } from "next/cache";
import { requireContentEditor } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { randomUUID } from "node:crypto";
import { storeDocument, deleteDocument, uploadAndExtract } from "@/lib/documents/store";
import { cleanReviewPeriod, cleanSigningWindow } from "@/lib/constants";
import { writeDocumentTag } from "@/lib/document-tags";
import { bestDuplicateMatch, looksLikeFilename, isBlankContent } from "@/lib/bulk-import/dedup";

type Result = { ok: true; id?: string } | { ok: false; error: string };

type SopEvent = "edit" | "published";

async function logSopEvent(
  db: ReturnType<typeof createClient>,
  opts: {
    organisationId: string;
    sopId: string;
    eventType: SopEvent;
    actorId: string;
    note?: string;
    detail?: Record<string, unknown>;
  },
) {
  await db.from("sop_history").insert({
    organisation_id: opts.organisationId,
    sop_id: opts.sopId,
    event_type: opts.eventType,
    actor_profile_id: opts.actorId,
    note: opts.note ?? null,
    detail: opts.detail ?? null,
  });
}

const SIGNOFF_TYPES = ["self", "self_and_manager"];

// A category id is valid for a procedure only if it belongs to this org and
// is flagged applies_to_procedures - the same policy_categories table
// policies use, not a second lookup (build addendum item 4).
async function validCategoryId(
  db: ReturnType<typeof createClient>,
  organisationId: string,
  categoryId: string,
): Promise<boolean> {
  const { data } = await db
    .from("policy_categories")
    .select("id")
    .eq("id", categoryId)
    .eq("organisation_id", organisationId)
    .eq("applies_to_procedures", true)
    .maybeSingle();
  return Boolean(data);
}

async function ownedSop(id: string) {
  const me = await requireContentEditor();
  const supabase = createClient();
  const { data } = await supabase
    .from("sops")
    .select(
      "id, organisation_id, name, body, published_body, published_version, review_period_months",
    )
    .eq("id", id)
    .maybeSingle();
  if (!data || data.organisation_id !== me.organisation_id) return null;
  return { me, sop: data };
}

export async function createSop(input: {
  name: string;
  body: string;
  signoffType: string;
  categoryId: string;
}): Promise<Result> {
  const me = await requireContentEditor();
  if (!me.organisation_id) return { ok: false, error: "No organisation." };
  const name = input.name.trim();
  if (!name) return { ok: false, error: "A name is required." };

  const db = createClient();
  const categoryId =
    input.categoryId && (await validCategoryId(db, me.organisation_id, input.categoryId))
      ? input.categoryId
      : null;
  const { data, error } = await db
    .from("sops")
    .insert({
      organisation_id: me.organisation_id,
      name,
      status: null,
      signoff_type: SIGNOFF_TYPES.includes(input.signoffType)
        ? input.signoffType
        : "self",
      category_id: categoryId,
      body: input.body.trim() || null,
      updated_by: me.id,
    })
    .select("id")
    .single();

  if (error) {
    return {
      ok: false,
      error: error.message.includes("duplicate")
        ? "A procedure with that name already exists."
        : error.message,
    };
  }
  revalidatePath("/admin/sops");
  return { ok: true, id: data.id };
}

export async function updateSopMeta(
  id: string,
  input: {
    name: string;
    signoffType: string;
    categoryId: string;
    priority: string;
    signingWindow: string;
    notes: string;
    serviceId: string | null;
    reviewPeriod: number;
  },
): Promise<Result> {
  const owned = await ownedSop(id);
  if (!owned) return { ok: false, error: "Procedure not found." };
  const name = input.name.trim();
  if (!name) return { ok: false, error: "A name is required." };

  const priority = input.priority.trim() === "" ? null : Number(input.priority);
  if (priority != null && !Number.isFinite(priority)) {
    return { ok: false, error: "Priority must be a number." };
  }

  const db = createClient();
  const categoryId =
    input.categoryId &&
    (await validCategoryId(db, owned.sop.organisation_id, input.categoryId))
      ? input.categoryId
      : null;
  const { error } = await db
    .from("sops")
    .update({
      name,
      signoff_type: SIGNOFF_TYPES.includes(input.signoffType)
        ? input.signoffType
        : "self",
      category_id: categoryId,
      priority,
      signing_window: cleanSigningWindow(input.signingWindow),
      notes: input.notes.trim() || null,
      service_id: input.serviceId,
      review_period_months: cleanReviewPeriod(input.reviewPeriod),
      updated_by: owned.me.id,
    })
    .eq("id", id);
  if (error) {
    return {
      ok: false,
      error: error.message.includes("duplicate")
        ? "A procedure with that name already exists."
        : error.message,
    };
  }
  revalidatePath("/admin/sops");
  revalidatePath(`/admin/sops/${id}`);
  return { ok: true };
}

// The per-SOP "what to look for" hint, retained on the row but rendered only
// inside the review form (Review cycle v2), not this editor.
export async function updateSopSuggestedEvidence(
  id: string,
  text: string,
): Promise<Result> {
  const owned = await ownedSop(id);
  if (!owned) return { ok: false, error: "Procedure not found." };
  const db = createClient();
  const { error } = await db
    .from("sops")
    .update({ suggested_evidence: text.trim() || null, updated_by: owned.me.id })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/admin/sops/${id}`);
  return { ok: true };
}

// The review clock is no longer touched from here. It derives entirely from
// sop_reviews (migration 0046) - a content edit no longer resets it, and
// there is no longer a "reset the clock while you're at it" prompt, matching
// Review cycle v2's rule that nothing but a completed review may move the
// due date.
export async function updateSopBody(id: string, body: string): Promise<Result> {
  const owned = await ownedSop(id);
  if (!owned) return { ok: false, error: "Procedure not found." };
  const db = createClient();

  const { error } = await db
    .from("sops")
    .update({ body: body.trim() || null, updated_by: owned.me.id })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };

  await logSopEvent(db, {
    organisationId: owned.sop.organisation_id,
    sopId: id,
    eventType: "edit",
    actorId: owned.me.id,
    note: "Content edited",
  });

  revalidatePath(`/admin/sops/${id}`);
  revalidatePath("/admin/sops");
  return { ok: true };
}

export async function publishSop(id: string): Promise<Result> {
  const owned = await ownedSop(id);
  if (!owned) return { ok: false, error: "Procedure not found." };
  if (!owned.sop.body || !owned.sop.body.trim()) {
    return { ok: false, error: "Add the procedure text before publishing." };
  }
  const db = createClient();
  const next = (owned.sop.published_version ?? 0) + 1;
  const { error } = await db
    .from("sops")
    .update({
      published_version: next,
      published_body: owned.sop.body,
      published_at: new Date().toISOString(),
      published_by: owned.me.id,
      current_version: next,
    })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };

  await logSopEvent(db, {
    organisationId: owned.sop.organisation_id,
    sopId: id,
    eventType: "published",
    actorId: owned.me.id,
    note: `Published v${next}`,
  });

  revalidatePath("/admin/sops");
  revalidatePath(`/admin/sops/${id}`);
  revalidatePath("/sops");
  return { ok: true };
}

export async function unpublishSop(id: string): Promise<Result> {
  const owned = await ownedSop(id);
  if (!owned) return { ok: false, error: "Procedure not found." };
  const db = createClient();
  const { error } = await db
    .from("sops")
    .update({ published_version: null, published_at: null, published_body: null })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/sops");
  revalidatePath(`/admin/sops/${id}`);
  revalidatePath("/sops");
  return { ok: true };
}

export async function deleteSop(id: string): Promise<Result> {
  const owned = await ownedSop(id);
  if (!owned) return { ok: false, error: "Procedure not found." };
  const db = createClient();
  const { data: docs } = await db
    .from("documents")
    .select("id")
    .eq("owner_type", "sop")
    .eq("owner_id", id);
  for (const d of docs ?? []) await deleteDocument(d.id);
  const { error } = await db.from("sops").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/sops");
  return { ok: true };
}

export async function uploadSopDocument(
  id: string,
  formData: FormData,
): Promise<Result> {
  const owned = await ownedSop(id);
  if (!owned) return { ok: false, error: "Procedure not found." };
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Choose a file." };
  }

  const db = createClient();
  const { data: existing } = await db
    .from("documents")
    .select("id")
    .eq("owner_type", "sop")
    .eq("owner_id", id);
  for (const d of existing ?? []) await deleteDocument(d.id);

  const bytes = new Uint8Array(await file.arrayBuffer());
  const stored = await storeDocument({
    organisationId: owned.sop.organisation_id,
    ownerType: "sop",
    ownerId: id,
    fileName: file.name,
    mimeType: file.type || null,
    bytes,
    uploadedBy: owned.me.id,
  });
  if (!stored.ok) return { ok: false, error: stored.error };

  const patch: Record<string, unknown> = {
    source_document_id: stored.document.id,
    updated_by: owned.me.id,
  };
  if ((!owned.sop.body || !owned.sop.body.trim()) && stored.document.extracted_text) {
    patch.body = stored.document.extracted_text;
  }
  await db.from("sops").update(patch).eq("id", id);

  revalidatePath(`/admin/sops/${id}`);
  return { ok: true };
}

export async function setJobRole(
  sopId: string,
  jobRoleId: string,
  attach: boolean,
): Promise<Result> {
  const owned = await ownedSop(sopId);
  if (!owned) return { ok: false, error: "Procedure not found." };
  const db = createClient();

  if (attach) {
    const { data: role } = await db
      .from("job_roles")
      .select("id, organisation_id")
      .eq("id", jobRoleId)
      .maybeSingle();
    if (!role || role.organisation_id !== owned.sop.organisation_id) {
      return { ok: false, error: "That job role is not in your organisation." };
    }
    const { error } = await db.from("job_role_sops").insert({
      organisation_id: owned.sop.organisation_id,
      job_role_id: jobRoleId,
      sop_id: sopId,
    });
    if (error && !error.message.includes("duplicate")) {
      return { ok: false, error: error.message };
    }
  } else {
    const { error } = await db
      .from("job_role_sops")
      .delete()
      .eq("sop_id", sopId)
      .eq("job_role_id", jobRoleId);
    if (error) return { ok: false, error: error.message };
  }

  const { count } = await db
    .from("job_role_sops")
    .select("sop_id", { count: "exact", head: true })
    .eq("job_role_id", jobRoleId);
  await db
    .from("job_roles")
    .update({ is_placeholder: (count ?? 0) === 0 })
    .eq("id", jobRoleId);

  revalidatePath(`/admin/sops/${sopId}`);
  revalidatePath("/admin/job-roles");
  return { ok: true };
}

// Quality area / child safe standard tags (Steps 28, 29). The picker toggles
// one tag at a time, matching the job-role and policy-category controls.
export async function setSopQualityArea(
  sopId: string,
  areaId: number,
  attach: boolean,
): Promise<Result> {
  const owned = await ownedSop(sopId);
  if (!owned) return { ok: false, error: "Procedure not found." };
  const r = await writeDocumentTag({
    kind: "quality_area",
    documentType: "sop",
    documentId: sopId,
    organisationId: owned.sop.organisation_id,
    tagId: areaId,
    attach,
    actorId: owned.me.id,
  });
  if (!r.ok) return r;
  revalidatePath(`/admin/sops/${sopId}`);
  return { ok: true };
}

export async function setSopChildSafeStandard(
  sopId: string,
  standardId: number,
  attach: boolean,
): Promise<Result> {
  const owned = await ownedSop(sopId);
  if (!owned) return { ok: false, error: "Procedure not found." };
  const r = await writeDocumentTag({
    kind: "child_safe_standard",
    documentType: "sop",
    documentId: sopId,
    organisationId: owned.sop.organisation_id,
    tagId: standardId,
    attach,
    actorId: owned.me.id,
  });
  if (!r.ok) return r;
  revalidatePath(`/admin/sops/${sopId}`);
  return { ok: true };
}

// Step 47. Files are parsed and stored now (Storage + text extraction), and
// flagged for duplicate/filename/blank-content review, but nothing is
// written to `sops` until the batch is committed - unlike the old
// bulkImportSops, which created a real row per file synchronously, before
// anyone had reviewed anything.
export async function stageBulkSops(
  formData: FormData,
): Promise<{ ok: false; error: string } | { ok: true; batchId: string; failed: number }> {
  const me = await requireContentEditor();
  if (!me.organisation_id) return { ok: false, error: "No organisation." };
  const files = formData.getAll("files").filter((f): f is File => f instanceof File);
  if (files.length === 0) return { ok: false, error: "No files." };

  const db = createClient();
  const batchId = randomUUID();

  const { data: existing } = await db
    .from("sops")
    .select("id, name")
    .eq("organisation_id", me.organisation_id);
  const candidates = (existing ?? []) as { id: string; name: string }[];

  let failed = 0;
  for (const file of files) {
    const title = file.name.replace(/\.[A-Za-z0-9]+$/, "").trim();
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const uploaded = await uploadAndExtract({
        organisationId: me.organisation_id,
        pathPrefix: "bulk_staging",
        ownerId: batchId,
        fileName: file.name,
        mimeType: file.type || null,
        bytes,
      });
      if (!uploaded.ok) {
        failed += 1;
        continue;
      }
      const dup = bestDuplicateMatch(title, candidates);
      const { error } = await db.from("bulk_upload_staging").insert({
        organisation_id: me.organisation_id,
        batch_id: batchId,
        kind: "sop",
        original_filename: file.name,
        derived_title: title,
        storage_path: uploaded.storagePath,
        mime_type: file.type || null,
        byte_size: bytes.byteLength,
        extracted_text: uploaded.extractedText,
        extraction_note: uploaded.extractionNote,
        duplicate_of_id: dup?.match.id ?? null,
        duplicate_of_name: dup?.match.name ?? null,
        duplicate_score: dup?.score ?? null,
        filename_flag: looksLikeFilename(title),
        blank_flag: isBlankContent(uploaded.extractedText),
        created_by: me.id,
      });
      if (error) failed += 1;
    } catch {
      failed += 1;
    }
  }

  return { ok: true, batchId, failed };
}

// Cancel a batch before commit. Discards the staging rows and removes the
// staged Storage objects - the library is left exactly as it was.
export async function discardBulkSopBatch(batchId: string): Promise<Result> {
  await requireContentEditor();
  const db = createClient();
  const { data: paths } = await db.rpc("discard_bulk_batch", { p_batch_id: batchId });
  const admin = (await import("@/lib/supabase/admin")).createAdminClient();
  if (paths && paths.length) {
    await admin.storage.from("documents").remove(paths as string[]);
  }
  revalidatePath("/admin/sops/bulk");
  return { ok: true };
}

export type SopBulkFinishItem = {
  stagingId: string;
  action: "create" | "skip" | "replace";
  title: string;
  jobRoleIds: string[];
  serviceId: string | null;
  categoryId: string | null;
  signoffType: string;
  reviewPeriod: number;
  signingWindow: string;
  linkedPolicyIds: string[];
  publish: boolean;
  replaceTargetId: string | null;
};

// The commit itself is one SECURITY DEFINER function call (migration 0060,
// commit_bulk_sops) so every row in the batch lands atomically - a failure
// on any one row rolls the whole commit back, per Step 47's requirement that
// a mid-commit failure must leave the library untouched.
export async function finishBulkSops(
  items: SopBulkFinishItem[],
): Promise<
  | { ok: false; error: string }
  | { ok: true; created: number; replaced: number; skipped: number; flagged: number }
> {
  const me = await requireContentEditor();
  if (!me.organisation_id) return { ok: false, error: "No organisation." };
  if (items.length === 0) return { ok: false, error: "Nothing to commit." };

  const db = createClient();
  const payload = items.map((i) => ({
    staging_id: i.stagingId,
    action: i.action,
    title: i.title,
    job_role_ids: i.jobRoleIds,
    service_id: i.serviceId,
    category_id: i.categoryId,
    signoff_type: SIGNOFF_TYPES.includes(i.signoffType) ? i.signoffType : "self",
    review_period_months: cleanReviewPeriod(i.reviewPeriod),
    signing_window: cleanSigningWindow(i.signingWindow),
    linked_policy_ids: i.linkedPolicyIds,
    publish: i.publish,
    replace_target_id: i.replaceTargetId,
  }));

  const { data, error } = await db.rpc("commit_bulk_sops", { p_items: payload });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/sops");
  revalidatePath("/admin/job-roles");
  revalidatePath("/admin/policies");
  revalidatePath("/sops");
  revalidatePath("/policies");
  const summary = data as { created: number; replaced: number; skipped: number; flagged: number };
  return { ok: true, ...summary };
}
