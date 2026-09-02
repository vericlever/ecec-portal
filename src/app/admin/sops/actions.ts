"use server";

import { revalidatePath } from "next/cache";
import { requireContentEditor } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { storeDocument, deleteDocument } from "@/lib/documents/store";

type Result = { ok: true; id?: string } | { ok: false; error: string };

const CATEGORIES = [
  "educator",
  "room_leader",
  "educational_leader",
  "director",
  "finance_admin",
];
const SIGNOFF_TYPES = ["self", "self_and_manager"];

async function ownedSop(id: string) {
  const me = await requireContentEditor();
  const supabase = createClient();
  const { data } = await supabase
    .from("sops")
    .select("id, organisation_id, name, body, published_body, published_version")
    .eq("id", id)
    .maybeSingle();
  if (!data || data.organisation_id !== me.organisation_id) return null;
  return { me, sop: data };
}

export async function createSop(input: {
  name: string;
  body: string;
  signoffType: string;
  category: string;
}): Promise<Result> {
  const me = await requireContentEditor();
  if (!me.organisation_id) return { ok: false, error: "No organisation." };
  const name = input.name.trim();
  if (!name) return { ok: false, error: "A name is required." };

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("sops")
    .insert({
      organisation_id: me.organisation_id,
      name,
      status: null,
      signoff_type: SIGNOFF_TYPES.includes(input.signoffType)
        ? input.signoffType
        : "self",
      target_tier: CATEGORIES.includes(input.category) ? input.category : null,
      body: input.body.trim() || null,
      updated_by: me.id,
    })
    .select("id")
    .single();

  if (error) {
    return {
      ok: false,
      error: error.message.includes("duplicate")
        ? "A SOP with that name already exists."
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
    category: string;
    priority: string;
    notes: string;
    serviceId: string | null;
  },
): Promise<Result> {
  const owned = await ownedSop(id);
  if (!owned) return { ok: false, error: "SOP not found." };
  const name = input.name.trim();
  if (!name) return { ok: false, error: "A name is required." };

  const priority = input.priority.trim() === "" ? null : Number(input.priority);
  if (priority != null && !Number.isFinite(priority)) {
    return { ok: false, error: "Priority must be a number." };
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("sops")
    .update({
      name,
      signoff_type: SIGNOFF_TYPES.includes(input.signoffType)
        ? input.signoffType
        : "self",
      target_tier: CATEGORIES.includes(input.category) ? input.category : null,
      priority,
      notes: input.notes.trim() || null,
      service_id: input.serviceId,
      updated_by: owned.me.id,
    })
    .eq("id", id);
  if (error) {
    return {
      ok: false,
      error: error.message.includes("duplicate")
        ? "A SOP with that name already exists."
        : error.message,
    };
  }
  revalidatePath("/admin/sops");
  revalidatePath(`/admin/sops/${id}`);
  return { ok: true };
}

export async function updateSopBody(id: string, body: string): Promise<Result> {
  const owned = await ownedSop(id);
  if (!owned) return { ok: false, error: "SOP not found." };
  const admin = createAdminClient();
  const { error } = await admin
    .from("sops")
    .update({ body: body.trim() || null, updated_by: owned.me.id })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/admin/sops/${id}`);
  return { ok: true };
}

export async function publishSop(id: string): Promise<Result> {
  const owned = await ownedSop(id);
  if (!owned) return { ok: false, error: "SOP not found." };
  if (!owned.sop.body || !owned.sop.body.trim()) {
    return { ok: false, error: "Add the procedure text before publishing." };
  }
  const admin = createAdminClient();
  const next = (owned.sop.published_version ?? 0) + 1;
  const { error } = await admin
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
  revalidatePath("/admin/sops");
  revalidatePath(`/admin/sops/${id}`);
  revalidatePath("/sops");
  return { ok: true };
}

export async function unpublishSop(id: string): Promise<Result> {
  const owned = await ownedSop(id);
  if (!owned) return { ok: false, error: "SOP not found." };
  const admin = createAdminClient();
  const { error } = await admin
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
  if (!owned) return { ok: false, error: "SOP not found." };
  const admin = createAdminClient();
  const { data: docs } = await admin
    .from("documents")
    .select("id")
    .eq("owner_type", "sop")
    .eq("owner_id", id);
  for (const d of docs ?? []) await deleteDocument(d.id);
  const { error } = await admin.from("sops").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/sops");
  return { ok: true };
}

export async function uploadSopDocument(
  id: string,
  formData: FormData,
): Promise<Result> {
  const owned = await ownedSop(id);
  if (!owned) return { ok: false, error: "SOP not found." };
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Choose a file." };
  }

  const admin = createAdminClient();
  const { data: existing } = await admin
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
  await admin.from("sops").update(patch).eq("id", id);

  revalidatePath(`/admin/sops/${id}`);
  return { ok: true };
}

export async function setJobRole(
  sopId: string,
  jobRoleId: string,
  attach: boolean,
): Promise<Result> {
  const owned = await ownedSop(sopId);
  if (!owned) return { ok: false, error: "SOP not found." };
  const admin = createAdminClient();

  if (attach) {
    const { data: role } = await admin
      .from("job_roles")
      .select("id, organisation_id")
      .eq("id", jobRoleId)
      .maybeSingle();
    if (!role || role.organisation_id !== owned.sop.organisation_id) {
      return { ok: false, error: "That job role is not in your organisation." };
    }
    const { error } = await admin.from("job_role_sops").insert({
      organisation_id: owned.sop.organisation_id,
      job_role_id: jobRoleId,
      sop_id: sopId,
    });
    if (error && !error.message.includes("duplicate")) {
      return { ok: false, error: error.message };
    }
  } else {
    const { error } = await admin
      .from("job_role_sops")
      .delete()
      .eq("sop_id", sopId)
      .eq("job_role_id", jobRoleId);
    if (error) return { ok: false, error: error.message };
  }

  const { count } = await admin
    .from("job_role_sops")
    .select("sop_id", { count: "exact", head: true })
    .eq("job_role_id", jobRoleId);
  await admin
    .from("job_roles")
    .update({ is_placeholder: (count ?? 0) === 0 })
    .eq("id", jobRoleId);

  revalidatePath(`/admin/sops/${sopId}`);
  revalidatePath("/admin/job-roles");
  return { ok: true };
}

export type SopBulkOutcome = {
  fileName: string;
  sopName: string;
  outcome: "created" | "attached" | "error";
  detail?: string;
};

export async function bulkImportSops(
  formData: FormData,
): Promise<
  { ok: false; error: string } | { ok: true; outcomes: SopBulkOutcome[] }
> {
  const me = await requireContentEditor();
  if (!me.organisation_id) return { ok: false, error: "No organisation." };
  const files = formData.getAll("files").filter((f): f is File => f instanceof File);
  if (files.length === 0) return { ok: false, error: "No files." };

  // Defaults applied only to SOPs newly created by this upload, never to ones
  // that matched an existing entry.
  const newRoleIds = formData
    .getAll("newRoleIds")
    .map((v) => String(v))
    .filter(Boolean);
  const newSignoff = SIGNOFF_TYPES.includes(String(formData.get("newSignoffType")))
    ? String(formData.get("newSignoffType"))
    : "self";

  const admin = createAdminClient();

  // Validate the chosen roles belong to this org up front.
  let validRoleIds: string[] = [];
  if (newRoleIds.length) {
    const { data: roles } = await admin
      .from("job_roles")
      .select("id")
      .eq("organisation_id", me.organisation_id)
      .in("id", newRoleIds);
    validRoleIds = (roles ?? []).map((r) => r.id as string);
  }

  const outcomes: SopBulkOutcome[] = [];

  for (const file of files) {
    const sopName = file.name.replace(/\.[A-Za-z0-9]+$/, "").trim();
    try {
      const { data: existing } = await admin
        .from("sops")
        .select("id, body")
        .eq("organisation_id", me.organisation_id)
        .ilike("name", sopName)
        .maybeSingle();

      let sopId: string;
      let attached = false;
      if (existing) {
        sopId = existing.id;
        attached = true;
      } else {
        const { data: created, error } = await admin
          .from("sops")
          .insert({
            organisation_id: me.organisation_id,
            name: sopName,
            status: null,
            signoff_type: newSignoff,
            target_tier: null,
            updated_by: me.id,
          })
          .select("id")
          .single();
        if (error || !created) {
          outcomes.push({
            fileName: file.name,
            sopName,
            outcome: "error",
            detail: error?.message ?? "Could not create the SOP.",
          });
          continue;
        }
        sopId = created.id;

        // Attach the new SOP to the chosen job roles.
        for (const roleId of validRoleIds) {
          await admin.from("job_role_sops").insert({
            organisation_id: me.organisation_id,
            job_role_id: roleId,
            sop_id: sopId,
          });
        }
      }

      const bytes = new Uint8Array(await file.arrayBuffer());
      const stored = await storeDocument({
        organisationId: me.organisation_id,
        ownerType: "sop",
        ownerId: sopId,
        fileName: file.name,
        mimeType: file.type || null,
        bytes,
        uploadedBy: me.id,
      });
      if (!stored.ok) {
        outcomes.push({ fileName: file.name, sopName, outcome: "error", detail: stored.error });
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
      await admin.from("sops").update(patch).eq("id", sopId);

      outcomes.push({
        fileName: file.name,
        sopName,
        outcome: attached ? "attached" : "created",
        detail: stored.document.extraction_note ?? undefined,
      });
    } catch (e) {
      outcomes.push({
        fileName: file.name,
        sopName,
        outcome: "error",
        detail: e instanceof Error ? e.message : "Failed.",
      });
    }
  }

  // A role that just gained SOPs is no longer a placeholder.
  for (const roleId of validRoleIds) {
    const { count } = await admin
      .from("job_role_sops")
      .select("sop_id", { count: "exact", head: true })
      .eq("job_role_id", roleId);
    await admin
      .from("job_roles")
      .update({ is_placeholder: (count ?? 0) === 0 })
      .eq("id", roleId);
  }

  revalidatePath("/admin/sops");
  revalidatePath("/admin/job-roles");
  return { ok: true, outcomes };
}
