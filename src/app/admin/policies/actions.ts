"use server";

import { revalidatePath } from "next/cache";
import { requireContentEditor } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { randomUUID } from "node:crypto";
import { storeDocument, deleteDocument, uploadAndExtract } from "@/lib/documents/store";
import { cleanReviewPeriod } from "@/lib/constants";
import { reviewDateFromNow } from "@/lib/sop-review";
import { writeDocumentTag } from "@/lib/document-tags";
import { bestDuplicateMatch, looksLikeFilename, isBlankContent } from "@/lib/bulk-import/dedup";

type Result = { ok: true; id?: string } | { ok: false; error: string };

// Attach a policy to the given categories (ids validated against the org).
// When replace is true, any category not in the list is removed. Falls back to
// the "general" category when nothing valid is given and the policy has none.
async function applyCategories(
  db: ReturnType<typeof createClient>,
  org: string,
  policyId: string,
  categoryIds: string[],
  opts: { replace: boolean },
) {
  const { data: cats } = await db
    .from("policy_categories")
    .select("id, slug")
    .eq("organisation_id", org);
  const valid = new Set((cats ?? []).map((c) => c.id as string));
  let wanted = categoryIds.filter((id) => valid.has(id));

  if (wanted.length === 0) {
    const { data: existing } = await db
      .from("policy_category_links")
      .select("category_id")
      .eq("policy_id", policyId);
    if ((existing ?? []).length === 0) {
      const general = (cats ?? []).find((c) => c.slug === "general");
      if (general) wanted = [general.id as string];
    }
  }

  const { data: current } = await db
    .from("policy_category_links")
    .select("category_id")
    .eq("policy_id", policyId);
  const have = new Set((current ?? []).map((r) => r.category_id as string));

  const toAdd = wanted.filter((id) => !have.has(id));
  if (toAdd.length) {
    await db.from("policy_category_links").insert(
      toAdd.map((id) => ({
        organisation_id: org,
        policy_id: policyId,
        category_id: id,
      })),
    );
  }
  if (opts.replace) {
    const toRemove = [...have].filter((id) => !wanted.includes(id));
    for (const id of toRemove) {
      await db
        .from("policy_category_links")
        .delete()
        .eq("policy_id", policyId)
        .eq("category_id", id);
    }
  }
}

async function ownedPolicy(id: string) {
  const me = await requireContentEditor();
  const supabase = createClient();
  const { data } = await supabase
    .from("policies")
    .select(
      "id, organisation_id, name, body, published_body, published_version, review_period_months, next_review_date",
    )
    .eq("id", id)
    .maybeSingle();
  if (!data || data.organisation_id !== me.organisation_id) return null;
  return { me, policy: data };
}

export async function createPolicy(input: {
  name: string;
  body: string;
  categoryIds: string[];
}): Promise<Result> {
  const me = await requireContentEditor();
  if (!me.organisation_id) return { ok: false, error: "No organisation." };
  const name = input.name.trim();
  if (!name) return { ok: false, error: "A name is required." };

  const db = createClient();
  const { data, error } = await db
    .from("policies")
    .insert({
      organisation_id: me.organisation_id,
      name,
      status: "in_library",
      body: input.body.trim() || null,
      updated_by: me.id,
    })
    .select("id")
    .single();

  if (error) {
    return {
      ok: false,
      error: error.message.includes("duplicate")
        ? "A policy with that name already exists."
        : error.message,
    };
  }
  await applyCategories(db, me.organisation_id, data.id, input.categoryIds, {
    replace: false,
  });
  revalidatePath("/admin/policies");
  return { ok: true, id: data.id };
}

export async function setPolicyCategory(
  policyId: string,
  categoryId: string,
  attach: boolean,
): Promise<Result> {
  const owned = await ownedPolicy(policyId);
  if (!owned) return { ok: false, error: "Policy not found." };
  const db = createClient();

  if (attach) {
    await applyCategories(
      db,
      owned.policy.organisation_id,
      policyId,
      [categoryId],
      { replace: false },
    );
  } else {
    await db
      .from("policy_category_links")
      .delete()
      .eq("policy_id", policyId)
      .eq("category_id", categoryId);
  }
  revalidatePath("/admin/policies");
  revalidatePath(`/admin/policies/${policyId}`);
  revalidatePath("/policies");
  return { ok: true };
}

export async function setPolicyQualityArea(
  policyId: string,
  areaId: number,
  attach: boolean,
): Promise<Result> {
  const owned = await ownedPolicy(policyId);
  if (!owned) return { ok: false, error: "Policy not found." };
  const r = await writeDocumentTag({
    kind: "quality_area",
    documentType: "policy",
    documentId: policyId,
    organisationId: owned.policy.organisation_id,
    tagId: areaId,
    attach,
    actorId: owned.me.id,
  });
  if (!r.ok) return r;
  revalidatePath(`/admin/policies/${policyId}`);
  return { ok: true };
}

export async function setPolicyChildSafeStandard(
  policyId: string,
  standardId: number,
  attach: boolean,
): Promise<Result> {
  const owned = await ownedPolicy(policyId);
  if (!owned) return { ok: false, error: "Policy not found." };
  const r = await writeDocumentTag({
    kind: "child_safe_standard",
    documentType: "policy",
    documentId: policyId,
    organisationId: owned.policy.organisation_id,
    tagId: standardId,
    attach,
    actorId: owned.me.id,
  });
  if (!r.ok) return r;
  revalidatePath(`/admin/policies/${policyId}`);
  return { ok: true };
}

export async function updatePolicyMeta(
  id: string,
  input: {
    name: string;
    serviceId: string | null;
  },
): Promise<Result> {
  const owned = await ownedPolicy(id);
  if (!owned) return { ok: false, error: "Policy not found." };
  const name = input.name.trim();
  if (!name) return { ok: false, error: "A name is required." };

  const db = createClient();
  const { error } = await db
    .from("policies")
    .update({
      name,
      service_id: input.serviceId,
      updated_by: owned.me.id,
    })
    .eq("id", id);
  if (error) {
    return {
      ok: false,
      error: error.message.includes("duplicate")
        ? "A policy with that name already exists."
        : error.message,
    };
  }

  // Keep the targeting table in step with the policy's own site scope.
  await db.from("policy_audiences").delete().eq("policy_id", id).is("job_role_id", null);
  if (input.serviceId) {
    await db.from("policy_audiences").insert({
      organisation_id: owned.policy.organisation_id,
      policy_id: id,
      job_role_id: null,
      service_id: input.serviceId,
    });
  }

  revalidatePath("/admin/policies");
  revalidatePath(`/admin/policies/${id}`);
  return { ok: true };
}

export async function updatePolicyBody(
  id: string,
  body: string,
): Promise<Result> {
  const owned = await ownedPolicy(id);
  if (!owned) return { ok: false, error: "Policy not found." };
  const db = createClient();
  const { error } = await db
    .from("policies")
    .update({ body: body.trim() || null, updated_by: owned.me.id })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/admin/policies/${id}`);
  return { ok: true };
}

export async function publishPolicy(id: string): Promise<Result> {
  const owned = await ownedPolicy(id);
  if (!owned) return { ok: false, error: "Policy not found." };
  if (!owned.policy.body || !owned.policy.body.trim()) {
    return { ok: false, error: "Add the policy text before publishing." };
  }
  const db = createClient();
  const next = (owned.policy.published_version ?? 0) + 1;
  const { error } = await db
    .from("policies")
    .update({
      published_version: next,
      published_body: owned.policy.body,
      published_at: new Date().toISOString(),
      published_by: owned.me.id,
      current_version: next,
    })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/policies");
  revalidatePath(`/admin/policies/${id}`);
  revalidatePath("/policies");
  return { ok: true };
}

export async function unpublishPolicy(id: string): Promise<Result> {
  const owned = await ownedPolicy(id);
  if (!owned) return { ok: false, error: "Policy not found." };
  const db = createClient();
  const { error } = await db
    .from("policies")
    .update({ published_version: null, published_at: null, published_body: null })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/policies");
  revalidatePath(`/admin/policies/${id}`);
  revalidatePath("/policies");
  return { ok: true };
}

// Save the review schedule for a policy: cadence plus explicit next date.
// Policies do not have a per-document history log (that is a SOP feature in
// Step 20); this is just the editable fields the bulk wizard also sets.
export async function updatePolicyReview(
  id: string,
  input: { reviewPeriod: number; nextReviewDate: string },
): Promise<Result> {
  const owned = await ownedPolicy(id);
  if (!owned) return { ok: false, error: "Policy not found." };
  const date = /^\d{4}-\d{2}-\d{2}$/.test(input.nextReviewDate)
    ? input.nextReviewDate
    : null;
  const db = createClient();
  const { error } = await db
    .from("policies")
    .update({
      review_period_months: cleanReviewPeriod(input.reviewPeriod),
      next_review_date: date,
      updated_by: owned.me.id,
    })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/policies");
  revalidatePath(`/admin/policies/${id}`);
  return { ok: true };
}

export async function markPolicyReviewed(id: string): Promise<Result> {
  const owned = await ownedPolicy(id);
  if (!owned) return { ok: false, error: "Policy not found." };
  const period = cleanReviewPeriod(owned.policy.review_period_months);
  const db = createClient();
  const { error } = await db
    .from("policies")
    .update({
      next_review_date: reviewDateFromNow(period),
      updated_by: owned.me.id,
    })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/policies");
  revalidatePath(`/admin/policies/${id}`);
  return { ok: true };
}

export async function deletePolicy(id: string): Promise<Result> {
  const owned = await ownedPolicy(id);
  if (!owned) return { ok: false, error: "Policy not found." };
  const db = createClient();
  const { data: docs } = await db
    .from("documents")
    .select("id")
    .eq("owner_type", "policy")
    .eq("owner_id", id);
  for (const d of docs ?? []) await deleteDocument(d.id);
  const { error } = await db.from("policies").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/policies");
  return { ok: true };
}

export async function uploadPolicyDocument(
  id: string,
  formData: FormData,
): Promise<Result> {
  const owned = await ownedPolicy(id);
  if (!owned) return { ok: false, error: "Policy not found." };
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Choose a file." };
  }

  const db = createClient();
  // Replace any existing source document.
  const { data: existing } = await db
    .from("documents")
    .select("id")
    .eq("owner_type", "policy")
    .eq("owner_id", id);
  for (const d of existing ?? []) await deleteDocument(d.id);

  const bytes = new Uint8Array(await file.arrayBuffer());
  const stored = await storeDocument({
    organisationId: owned.policy.organisation_id,
    ownerType: "policy",
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
  // Prefill the body from the extracted text only if the editor has not
  // written anything yet.
  if (
    (!owned.policy.body || !owned.policy.body.trim()) &&
    stored.document.extracted_text
  ) {
    patch.body = stored.document.extracted_text;
  }
  await db.from("policies").update(patch).eq("id", id);

  revalidatePath(`/admin/policies/${id}`);
  return { ok: true };
}

export async function linkSop(policyId: string, sopId: string): Promise<Result> {
  const owned = await ownedPolicy(policyId);
  if (!owned) return { ok: false, error: "Policy not found." };
  const db = createClient();
  const { data: sop } = await db
    .from("sops")
    .select("id, organisation_id")
    .eq("id", sopId)
    .maybeSingle();
  if (!sop || sop.organisation_id !== owned.policy.organisation_id) {
    return { ok: false, error: "That procedure is not in your organisation." };
  }
  const { error } = await db.from("policy_sop_links").insert({
    organisation_id: owned.policy.organisation_id,
    policy_id: policyId,
    sop_id: sopId,
  });
  if (error && !error.message.includes("duplicate")) {
    return { ok: false, error: error.message };
  }
  revalidatePath(`/admin/policies/${policyId}`);
  return { ok: true };
}

export async function unlinkSop(policyId: string, sopId: string): Promise<Result> {
  const owned = await ownedPolicy(policyId);
  if (!owned) return { ok: false, error: "Policy not found." };
  const db = createClient();
  const { error } = await db
    .from("policy_sop_links")
    .delete()
    .eq("policy_id", policyId)
    .eq("sop_id", sopId);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/admin/policies/${policyId}`);
  return { ok: true };
}

// Step 47. Same staging approach as stageBulkSops: parse, store and flag
// every file now, but write nothing to `policies` until the batch commits.
export async function stageBulkPolicies(
  formData: FormData,
): Promise<{ ok: false; error: string } | { ok: true; batchId: string; failed: number }> {
  const me = await requireContentEditor();
  if (!me.organisation_id) return { ok: false, error: "No organisation." };
  const files = formData.getAll("files").filter((f): f is File => f instanceof File);
  if (files.length === 0) return { ok: false, error: "No files." };

  const db = createClient();
  const batchId = randomUUID();

  const { data: existing } = await db
    .from("policies")
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
        kind: "policy",
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

export async function discardBulkPolicyBatch(batchId: string): Promise<Result> {
  await requireContentEditor();
  const db = createClient();
  const { data: paths } = await db.rpc("discard_bulk_batch", { p_batch_id: batchId });
  const admin = (await import("@/lib/supabase/admin")).createAdminClient();
  if (paths && paths.length) {
    await admin.storage.from("documents").remove(paths as string[]);
  }
  revalidatePath("/admin/policies/bulk");
  return { ok: true };
}

export type PolicyBulkFinishItem = {
  stagingId: string;
  action: "create" | "skip" | "replace";
  title: string;
  categoryIds: string[];
  serviceId: string | null;
  reviewPeriod: number;
  nextReviewDate: string;
  linkedSopIds: string[];
  qualityAreaIds: number[];
  childSafeStandardIds: number[];
  publish: boolean;
  replaceTargetId: string | null;
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// One commit_bulk_policies() call (migration 0060) - atomic across every row
// in the batch, same as the SOP path.
export async function finishBulkPolicies(
  items: PolicyBulkFinishItem[],
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
    category_ids: i.categoryIds,
    service_id: i.serviceId,
    review_period_months: cleanReviewPeriod(i.reviewPeriod),
    next_review_date: ISO_DATE.test(i.nextReviewDate) ? i.nextReviewDate : null,
    linked_sop_ids: i.linkedSopIds,
    quality_area_ids: i.qualityAreaIds,
    child_safe_standard_ids: i.childSafeStandardIds,
    publish: i.publish,
    replace_target_id: i.replaceTargetId,
  }));

  const { data, error } = await db.rpc("commit_bulk_policies", { p_items: payload });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/policies");
  revalidatePath("/admin/sops");
  revalidatePath("/policies");
  const summary = data as { created: number; replaced: number; skipped: number; flagged: number };
  return { ok: true, ...summary };
}
