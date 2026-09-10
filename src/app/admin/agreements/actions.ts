"use server";

import { revalidatePath } from "next/cache";
import { requireContentEditor } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

type Result = { ok: true; id?: string } | { ok: false; error: string };

async function ownedAgreement(id: string) {
  const me = await requireContentEditor();
  const supabase = createClient();
  const { data } = await supabase
    .from("hr_agreements")
    .select("id, organisation_id, name, body, published_body, published_version")
    .eq("id", id)
    .maybeSingle();
  if (!data || data.organisation_id !== me.organisation_id) return null;
  return { me, agreement: data };
}

export async function createAgreement(input: {
  name: string;
  body: string;
}): Promise<Result> {
  const me = await requireContentEditor();
  if (!me.organisation_id) return { ok: false, error: "No organisation." };
  const name = input.name.trim();
  if (!name) return { ok: false, error: "A name is required." };

  const db = createClient();
  const { data, error } = await db
    .from("hr_agreements")
    .insert({
      organisation_id: me.organisation_id,
      name,
      body: input.body.trim() || null,
      all_staff: true,
      updated_by: me.id,
    })
    .select("id")
    .single();
  if (error) {
    return {
      ok: false,
      error: error.message.includes("duplicate")
        ? "An agreement with that name already exists."
        : error.message,
    };
  }
  revalidatePath("/admin/agreements");
  return { ok: true, id: data.id };
}

export async function updateAgreementMeta(
  id: string,
  input: { name: string; allStaff: boolean; linkedPolicyId: string | null },
): Promise<Result> {
  const owned = await ownedAgreement(id);
  if (!owned) return { ok: false, error: "Agreement not found." };
  const name = input.name.trim();
  if (!name) return { ok: false, error: "A name is required." };

  const db = createClient();

  if (input.linkedPolicyId) {
    const { data: policy } = await db
      .from("policies")
      .select("id, organisation_id")
      .eq("id", input.linkedPolicyId)
      .maybeSingle();
    if (!policy || policy.organisation_id !== owned.agreement.organisation_id) {
      return { ok: false, error: "That policy is not in your organisation." };
    }
  }

  const { error } = await db
    .from("hr_agreements")
    .update({
      name,
      all_staff: input.allStaff,
      linked_policy_id: input.linkedPolicyId,
      updated_by: owned.me.id,
    })
    .eq("id", id);
  if (error) {
    return {
      ok: false,
      error: error.message.includes("duplicate")
        ? "An agreement with that name already exists."
        : error.message,
    };
  }
  revalidatePath("/admin/agreements");
  revalidatePath(`/admin/agreements/${id}`);
  return { ok: true };
}

export async function updateAgreementBody(
  id: string,
  body: string,
): Promise<Result> {
  const owned = await ownedAgreement(id);
  if (!owned) return { ok: false, error: "Agreement not found." };
  const db = createClient();
  const { error } = await db
    .from("hr_agreements")
    .update({ body: body.trim() || null, updated_by: owned.me.id })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/admin/agreements/${id}`);
  return { ok: true };
}

export async function publishAgreement(id: string): Promise<Result> {
  const owned = await ownedAgreement(id);
  if (!owned) return { ok: false, error: "Agreement not found." };
  if (!owned.agreement.body || !owned.agreement.body.trim()) {
    return { ok: false, error: "Add the agreement text before publishing." };
  }
  const db = createClient();
  const next = (owned.agreement.published_version ?? 0) + 1;
  const { error } = await db
    .from("hr_agreements")
    .update({
      published_version: next,
      published_body: owned.agreement.body,
      published_at: new Date().toISOString(),
      published_by: owned.me.id,
    })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/agreements");
  revalidatePath(`/admin/agreements/${id}`);
  revalidatePath("/agreements");
  return { ok: true };
}

export async function unpublishAgreement(id: string): Promise<Result> {
  const owned = await ownedAgreement(id);
  if (!owned) return { ok: false, error: "Agreement not found." };
  const db = createClient();
  const { error } = await db
    .from("hr_agreements")
    .update({ published_version: null, published_at: null, published_body: null })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/agreements");
  revalidatePath(`/admin/agreements/${id}`);
  revalidatePath("/agreements");
  return { ok: true };
}

export async function deleteAgreement(id: string): Promise<Result> {
  const owned = await ownedAgreement(id);
  if (!owned) return { ok: false, error: "Agreement not found." };
  const db = createClient();
  const { error } = await db.from("hr_agreements").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/agreements");
  return { ok: true };
}

export async function setAgreementJobRole(
  agreementId: string,
  jobRoleId: string,
  attach: boolean,
): Promise<Result> {
  const owned = await ownedAgreement(agreementId);
  if (!owned) return { ok: false, error: "Agreement not found." };
  const db = createClient();

  if (attach) {
    const { data: role } = await db
      .from("job_roles")
      .select("id, organisation_id")
      .eq("id", jobRoleId)
      .maybeSingle();
    if (!role || role.organisation_id !== owned.agreement.organisation_id) {
      return { ok: false, error: "That job role is not in your organisation." };
    }
    const { error } = await db.from("hr_agreement_job_roles").insert({
      organisation_id: owned.agreement.organisation_id,
      agreement_id: agreementId,
      job_role_id: jobRoleId,
    });
    if (error && !error.message.includes("duplicate")) {
      return { ok: false, error: error.message };
    }
  } else {
    const { error } = await db
      .from("hr_agreement_job_roles")
      .delete()
      .eq("agreement_id", agreementId)
      .eq("job_role_id", jobRoleId);
    if (error) return { ok: false, error: error.message };
  }
  revalidatePath(`/admin/agreements/${agreementId}`);
  return { ok: true };
}
