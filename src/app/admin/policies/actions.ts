"use server";

import { revalidatePath } from "next/cache";
import { requireContentEditor } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { storeDocument, deleteDocument } from "@/lib/documents/store";
import { cleanReviewPeriod } from "@/lib/constants";
import { reviewDateFromNow } from "@/lib/sop-review";
import { writeDocumentTag } from "@/lib/document-tags";

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

export type BulkOutcome = {
  fileName: string;
  policyName: string;
  policyId?: string;
  hasText?: boolean;
  outcome: "created" | "attached" | "error";
  detail?: string;
};

// One draft policy per file. If a policy with the same name (filename minus
// extension) already exists - which is the case for RSG's whole imported
// inventory - the document is attached to it and its empty body filled in,
// rather than creating a duplicate.
export async function bulkImportPolicies(
  formData: FormData,
): Promise<
  { ok: false; error: string } | { ok: true; outcomes: BulkOutcome[] }
> {
  const me = await requireContentEditor();
  if (!me.organisation_id) return { ok: false, error: "No organisation." };
  const files = formData.getAll("files").filter((f): f is File => f instanceof File);
  if (files.length === 0) return { ok: false, error: "No files." };

  // Categories chosen for this batch, applied only to policies this upload
  // creates, never to ones that matched an existing entry.
  const categoryIds = formData
    .getAll("categoryIds")
    .map((v) => String(v))
    .filter(Boolean);

  const db = createClient();
  const outcomes: BulkOutcome[] = [];

  for (const file of files) {
    const policyName = file.name.replace(/\.[A-Za-z0-9]+$/, "").trim();
    try {
      const { data: existing } = await db
        .from("policies")
        .select("id, body")
        .eq("organisation_id", me.organisation_id)
        .ilike("name", policyName)
        .maybeSingle();

      let policyId: string;
      let attached = false;
      if (existing) {
        policyId = existing.id;
        attached = true;
      } else {
        const { data: created, error } = await db
          .from("policies")
          .insert({
            organisation_id: me.organisation_id,
            name: policyName,
            status: "in_library",
            updated_by: me.id,
          })
          .select("id")
          .single();
        if (error || !created) {
          outcomes.push({
            fileName: file.name,
            policyName,
            outcome: "error",
            detail: error?.message ?? "Could not create the policy.",
          });
          continue;
        }
        policyId = created.id;
        await applyCategories(
          db,
          me.organisation_id,
          policyId,
          categoryIds,
          { replace: false },
        );
      }

      const bytes = new Uint8Array(await file.arrayBuffer());
      const stored = await storeDocument({
        organisationId: me.organisation_id,
        ownerType: "policy",
        ownerId: policyId,
        fileName: file.name,
        mimeType: file.type || null,
        bytes,
        uploadedBy: me.id,
      });
      if (!stored.ok) {
        outcomes.push({
          fileName: file.name,
          policyName,
          outcome: "error",
          detail: stored.error,
        });
        continue;
      }

      const patch: Record<string, unknown> = {
        source_document_id: stored.document.id,
        updated_by: me.id,
      };
      const currentBody = existing?.body as string | null | undefined;
      const hadBody = !!(currentBody && currentBody.trim());
      const gotText = !!(
        stored.document.extracted_text && stored.document.extracted_text.trim()
      );
      if (!hadBody && gotText) {
        patch.body = stored.document.extracted_text;
      }
      await db.from("policies").update(patch).eq("id", policyId);

      outcomes.push({
        fileName: file.name,
        policyName,
        policyId,
        hasText: hadBody || gotText,
        outcome: attached ? "attached" : "created",
        detail: stored.document.extraction_note ?? undefined,
      });
    } catch (e) {
      outcomes.push({
        fileName: file.name,
        policyName,
        outcome: "error",
        detail: e instanceof Error ? e.message : "Failed.",
      });
    }
  }

  revalidatePath("/admin/policies");
  return { ok: true, outcomes };
}

// Page two of the bulk wizard. Sets categories, review period and SOP links for
// every uploaded policy and publishes the ones marked to publish that have
// text. A policy with no text stays an unpublished draft.
export type PolicyBulkFinishItem = {
  policyId: string;
  categoryIds: string[];
  reviewPeriod: number;
  nextReviewDate: string;
  linkedSopIds: string[];
  publish: boolean;
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function finishBulkPolicies(
  items: PolicyBulkFinishItem[],
): Promise<
  | { ok: false; error: string }
  | {
      ok: true;
      published: number;
      drafted: number;
      failed: { name: string; error: string }[];
    }
> {
  const me = await requireContentEditor();
  if (!me.organisation_id) return { ok: false, error: "No organisation." };
  if (items.length === 0) return { ok: false, error: "Nothing to publish." };

  const db = createClient();
  const ids = items.map((i) => i.policyId);
  const { data: rows } = await db
    .from("policies")
    .select("id, name, organisation_id, body, published_version")
    .in("id", ids);
  const byId = new Map((rows ?? []).map((r) => [r.id as string, r]));

  const { data: sops } = await db
    .from("sops")
    .select("id")
    .eq("organisation_id", me.organisation_id);
  const validSop = new Set((sops ?? []).map((s) => s.id as string));

  let published = 0;
  let drafted = 0;
  const failed: { name: string; error: string }[] = [];

  for (const item of items) {
    const policy = byId.get(item.policyId);
    if (!policy || policy.organisation_id !== me.organisation_id) continue;

    await applyCategories(
      db,
      me.organisation_id,
      item.policyId,
      item.categoryIds,
      { replace: true },
    );

    const update: Record<string, unknown> = {
      review_period_months: cleanReviewPeriod(item.reviewPeriod),
      next_review_date: ISO_DATE.test(item.nextReviewDate)
        ? item.nextReviewDate
        : null,
      updated_by: me.id,
    };

    const hasBody = !!(policy.body && String(policy.body).trim());
    const doPublish = item.publish && hasBody;
    if (doPublish) {
      const next = ((policy.published_version as number | null) ?? 0) + 1;
      update.published_version = next;
      update.published_body = policy.body;
      update.published_at = new Date().toISOString();
      update.published_by = me.id;
      update.current_version = next;
    }

    const { error } = await db
      .from("policies")
      .update(update)
      .eq("id", item.policyId);
    if (error) {
      failed.push({ name: policy.name as string, error: error.message });
      continue;
    }

    for (const sid of item.linkedSopIds) {
      if (!validSop.has(sid)) continue;
      const { error: linkErr } = await db.from("policy_sop_links").insert({
        organisation_id: me.organisation_id,
        policy_id: item.policyId,
        sop_id: sid,
      });
      if (linkErr && !linkErr.message.includes("duplicate")) {
        failed.push({ name: policy.name as string, error: linkErr.message });
      }
    }

    if (doPublish) published += 1;
    else drafted += 1;
  }

  revalidatePath("/admin/policies");
  revalidatePath("/admin/sops");
  revalidatePath("/policies");
  return { ok: true, published, drafted, failed };
}
