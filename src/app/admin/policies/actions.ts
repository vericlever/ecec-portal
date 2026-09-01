"use server";

import { revalidatePath } from "next/cache";
import { requireContentEditor } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { storeDocument, deleteDocument } from "@/lib/documents/store";

type Result = { ok: true; id?: string } | { ok: false; error: string };

const DOC_TYPES = ["policy", "procedure", "handbook", "disaster_plan"];

async function ownedPolicy(id: string) {
  const me = await requireContentEditor();
  const supabase = createClient();
  const { data } = await supabase
    .from("policies")
    .select("id, organisation_id, name, body, published_body, published_version")
    .eq("id", id)
    .maybeSingle();
  if (!data || data.organisation_id !== me.organisation_id) return null;
  return { me, policy: data };
}

export async function createPolicy(input: {
  name: string;
  body: string;
  documentType: string;
}): Promise<Result> {
  const me = await requireContentEditor();
  if (!me.organisation_id) return { ok: false, error: "No organisation." };
  const name = input.name.trim();
  if (!name) return { ok: false, error: "A name is required." };

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("policies")
    .insert({
      organisation_id: me.organisation_id,
      name,
      status: "in_library",
      document_type: DOC_TYPES.includes(input.documentType)
        ? input.documentType
        : "policy",
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
  revalidatePath("/admin/policies");
  return { ok: true, id: data.id };
}

export async function updatePolicyMeta(
  id: string,
  input: {
    name: string;
    documentType: string;
    isParentFacing: boolean;
    serviceId: string | null;
    program: string;
  },
): Promise<Result> {
  const owned = await ownedPolicy(id);
  if (!owned) return { ok: false, error: "Policy not found." };
  const name = input.name.trim();
  if (!name) return { ok: false, error: "A name is required." };

  const admin = createAdminClient();
  const { error } = await admin
    .from("policies")
    .update({
      name,
      document_type: DOC_TYPES.includes(input.documentType)
        ? input.documentType
        : "policy",
      is_parent_facing: input.isParentFacing,
      service_id: input.serviceId,
      program: input.program.trim() || null,
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
  await admin.from("policy_audiences").delete().eq("policy_id", id).is("job_role_id", null);
  if (input.serviceId) {
    await admin.from("policy_audiences").insert({
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
  const admin = createAdminClient();
  const { error } = await admin
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
  const admin = createAdminClient();
  const next = (owned.policy.published_version ?? 0) + 1;
  const { error } = await admin
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
  const admin = createAdminClient();
  const { error } = await admin
    .from("policies")
    .update({ published_version: null, published_at: null, published_body: null })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/policies");
  revalidatePath(`/admin/policies/${id}`);
  revalidatePath("/policies");
  return { ok: true };
}

export async function deletePolicy(id: string): Promise<Result> {
  const owned = await ownedPolicy(id);
  if (!owned) return { ok: false, error: "Policy not found." };
  const admin = createAdminClient();
  const { data: docs } = await admin
    .from("documents")
    .select("id")
    .eq("owner_type", "policy")
    .eq("owner_id", id);
  for (const d of docs ?? []) await deleteDocument(d.id);
  const { error } = await admin.from("policies").delete().eq("id", id);
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

  const admin = createAdminClient();
  // Replace any existing source document.
  const { data: existing } = await admin
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
  await admin.from("policies").update(patch).eq("id", id);

  revalidatePath(`/admin/policies/${id}`);
  return { ok: true };
}

export async function linkSop(policyId: string, sopId: string): Promise<Result> {
  const owned = await ownedPolicy(policyId);
  if (!owned) return { ok: false, error: "Policy not found." };
  const admin = createAdminClient();
  const { data: sop } = await admin
    .from("sops")
    .select("id, organisation_id")
    .eq("id", sopId)
    .maybeSingle();
  if (!sop || sop.organisation_id !== owned.policy.organisation_id) {
    return { ok: false, error: "That SOP is not in your organisation." };
  }
  const { error } = await admin.from("policy_sop_links").insert({
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
  const admin = createAdminClient();
  const { error } = await admin
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

  const admin = createAdminClient();
  const outcomes: BulkOutcome[] = [];

  for (const file of files) {
    const policyName = file.name.replace(/\.[A-Za-z0-9]+$/, "").trim();
    try {
      const { data: existing } = await admin
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
        const { data: created, error } = await admin
          .from("policies")
          .insert({
            organisation_id: me.organisation_id,
            name: policyName,
            status: "in_library",
            document_type: "policy",
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
      if ((!currentBody || !currentBody.trim()) && stored.document.extracted_text) {
        patch.body = stored.document.extracted_text;
      }
      await admin.from("policies").update(patch).eq("id", policyId);

      outcomes.push({
        fileName: file.name,
        policyName,
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
