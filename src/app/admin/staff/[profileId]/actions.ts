"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getProfile, isHrManager, isAdmin, isManager } from "@/lib/auth";
import { type AccessTier, ASSIGNABLE_TIERS } from "@/lib/roles";
import { storeDocument, deleteDocument } from "@/lib/documents/store";
import { calcExpiry } from "@/lib/contracts";

type Result = { ok: true } | { ok: false; error: string };

type VerifiableTable =
  | "wwcc_checks"
  | "teacher_registrations"
  | "qualifications"
  | "training_records"
  | "identity_documents";

const VERIFIABLE: VerifiableTable[] = [
  "wwcc_checks",
  "teacher_registrations",
  "qualifications",
  "training_records",
  "identity_documents",
];

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function recordSighting(
  table: VerifiableTable,
  recordId: string,
  sightedBy: string,
): Promise<Result> {
  const me = await getProfile();
  if (!isHrManager(me)) {
    return { ok: false, error: "You are not allowed to verify documents." };
  }
  if (!VERIFIABLE.includes(table)) {
    return { ok: false, error: "Unknown record type." };
  }
  if (sightedBy !== "Provider" && sightedBy !== "Nominated Supervisor") {
    return { ok: false, error: "Choose who sighted the document." };
  }

  const supabase = createClient();
  const { error } = await supabase
    .from(table)
    .update({ sighted_at: today(), sighted_by: sightedBy })
    .eq("id", recordId);

  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/staff", "layout");
  revalidatePath("/admin/verification");
  return { ok: true };
}

export async function clearSighting(
  table: VerifiableTable,
  recordId: string,
): Promise<Result> {
  const me = await getProfile();
  if (!isHrManager(me)) {
    return { ok: false, error: "You are not allowed to change this." };
  }
  const supabase = createClient();
  const { error } = await supabase
    .from(table)
    .update({ sighted_at: null, sighted_by: null })
    .eq("id", recordId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/staff", "layout");
  revalidatePath("/admin/verification");
  return { ok: true };
}

export async function setProbation(
  profileId: string,
  input: { onProbation: "" | "yes" | "no"; startDate: string },
): Promise<Result> {
  const me = await getProfile();
  if (!isHrManager(me)) {
    return { ok: false, error: "You are not allowed to change this." };
  }

  const supabase = createClient();

  // worker_details may not exist yet if the staff member has not started their
  // onboarding questionnaire, so upsert rather than update.
  const { data: target } = await supabase
    .from("profiles")
    .select("organisation_id")
    .eq("id", profileId)
    .maybeSingle();
  if (!target) return { ok: false, error: "Staff member not found." };

  const on_probation =
    input.onProbation === "yes"
      ? true
      : input.onProbation === "no"
        ? false
        : null;
  // The probation start date only means anything while someone is on probation.
  const probation_start_date =
    input.onProbation === "yes" && input.startDate ? input.startDate : null;

  const { error } = await supabase.from("worker_details").upsert(
    {
      profile_id: profileId,
      organisation_id: target.organisation_id,
      on_probation,
      probation_start_date,
    },
    { onConflict: "profile_id" },
  );
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/staff", "layout");
  return { ok: true };
}

// May upload or replace a contract: Admin anywhere in the organisation, or an
// HR manager for staff at their own service. Mirrors the contracts_write RLS
// policy, but gives a clean error before any file is touched.
async function canManageContractFor(
  profileId: string,
): Promise<
  | { ok: true; me: NonNullable<Awaited<ReturnType<typeof getProfile>>>; organisationId: string }
  | { ok: false; error: string }
> {
  const me = await getProfile();
  if (!me || !isHrManager(me)) {
    return { ok: false, error: "You are not allowed to manage contracts." };
  }
  const supabase = createClient();
  const { data: target } = await supabase
    .from("profiles")
    .select("organisation_id, service_id")
    .eq("id", profileId)
    .maybeSingle();
  if (!target || target.organisation_id !== me.organisation_id) {
    return { ok: false, error: "Staff member not found." };
  }
  if (
    !isAdmin(me.access_tier) &&
    target.service_id !== me.service_id
  ) {
    return { ok: false, error: "That staff member is not at your service." };
  }
  return { ok: true, me, organisationId: me.organisation_id as string };
}

export async function uploadContract(
  profileId: string,
  formData: FormData,
): Promise<Result> {
  const gate = await canManageContractFor(profileId);
  if (!gate.ok) return gate;

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Choose the executed contract document." };
  }
  const startDate = String(formData.get("start_date") ?? "").trim();
  if (!startDate) return { ok: false, error: "Enter the contract start date." };

  const periodType = String(formData.get("period_type") ?? "");
  if (periodType !== "fixed" && periodType !== "no_fixed_period") {
    return { ok: false, error: "Choose the contract period type." };
  }

  let durationMonths: number | null = null;
  let expiry: string | null = null;
  if (periodType === "fixed") {
    const raw = String(formData.get("duration_months") ?? "").trim();
    const n = Number(raw);
    if (!raw || !Number.isInteger(n) || n <= 0) {
      return {
        ok: false,
        error: "Enter the contract length in whole months.",
      };
    }
    durationMonths = n;
    expiry = calcExpiry(startDate, n);
  }

  const notes = String(formData.get("notes") ?? "").trim() || null;

  const admin = createAdminClient();
  const { data: contract, error } = await admin
    .from("contracts")
    .insert({
      organisation_id: gate.organisationId,
      profile_id: profileId,
      start_date: startDate,
      period_type: periodType,
      duration_months: durationMonths,
      expiry_date: expiry,
      notes,
      created_by: gate.me.id,
    })
    .select("id")
    .single();
  if (error || !contract) {
    return { ok: false, error: error?.message ?? "Could not save the contract." };
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const stored = await storeDocument({
    organisationId: gate.organisationId,
    ownerType: "contract",
    ownerId: contract.id,
    fileName: file.name,
    mimeType: file.type || null,
    bytes,
    uploadedBy: gate.me.id,
  });
  if (!stored.ok) {
    await admin.from("contracts").delete().eq("id", contract.id);
    return { ok: false, error: stored.error };
  }
  await admin
    .from("contracts")
    .update({ document_id: stored.document.id })
    .eq("id", contract.id);

  revalidatePath("/admin/staff", "layout");
  revalidatePath("/admin");
  return { ok: true };
}

// A staff member reads and accepts their own active contract. Verified in code
// (the staff member is not in contracts_write RLS) then written with the admin
// client, recording their name and the time.
export async function signOwnContract(contractId: string): Promise<Result> {
  const me = await getProfile();
  if (!me) return { ok: false, error: "Sign in." };
  const admin = createAdminClient();
  const { data: contract } = await admin
    .from("contracts")
    .select("id, profile_id, superseded_at, signed_at")
    .eq("id", contractId)
    .maybeSingle();
  if (!contract || contract.profile_id !== me.id) {
    return { ok: false, error: "Contract not found." };
  }
  if (contract.superseded_at) {
    return { ok: false, error: "This contract has been replaced." };
  }
  if (contract.signed_at) return { ok: true };

  const { error } = await admin
    .from("contracts")
    .update({ signed_at: new Date().toISOString(), signed_name: me.full_name })
    .eq("id", contractId);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/onboarding");
  revalidatePath("/admin/staff", "layout");
  return { ok: true };
}

export async function deleteContract(contractId: string): Promise<Result> {
  const me = await getProfile();
  if (!me || !isHrManager(me)) {
    return { ok: false, error: "You are not allowed to manage contracts." };
  }
  const admin = createAdminClient();
  const { data: contract } = await admin
    .from("contracts")
    .select("id, profile_id, organisation_id, document_id")
    .eq("id", contractId)
    .maybeSingle();
  if (!contract || contract.organisation_id !== me.organisation_id) {
    return { ok: false, error: "Contract not found." };
  }
  const gate = await canManageContractFor(contract.profile_id);
  if (!gate.ok) return gate;

  if (contract.document_id) await deleteDocument(contract.document_id);
  await admin.from("contracts").delete().eq("id", contractId);

  // Restore the most recent remaining period as the active one, so a mistaken
  // upload can be undone cleanly.
  const { data: remaining } = await admin
    .from("contracts")
    .select("id")
    .eq("profile_id", contract.profile_id)
    .order("created_at", { ascending: false })
    .limit(1);
  if (remaining && remaining.length > 0) {
    await admin
      .from("contracts")
      .update({ superseded_at: null })
      .eq("id", remaining[0].id);
  }

  revalidatePath("/admin/staff", "layout");
  revalidatePath("/admin");
  return { ok: true };
}

const IDENTITY_KINDS = ["photo_id", "visa", "other"] as const;

// Upload a Photo ID or visa document. A staff member may upload their own; a
// manager or HR manager may upload for staff at their service. The row and the
// stored file are re-checked by identity_documents RLS and the documents route.
export async function uploadIdentityDocument(
  profileId: string,
  formData: FormData,
): Promise<Result> {
  const me = await getProfile();
  if (!me) return { ok: false, error: "Sign in." };

  const kind = String(formData.get("kind") ?? "");
  if (!IDENTITY_KINDS.includes(kind as (typeof IDENTITY_KINDS)[number])) {
    return { ok: false, error: "Choose a document type." };
  }
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Choose a file to upload." };
  }
  const label = String(formData.get("label") ?? "").trim() || null;

  const supabase = createClient();
  const { data: target } = await supabase
    .from("profiles")
    .select("organisation_id, service_id")
    .eq("id", profileId)
    .maybeSingle();
  if (!target) return { ok: false, error: "Staff member not found." };

  const mine = profileId === me.id;
  const canManageOthers =
    isAdmin(me.access_tier) ||
    ((isManager(me.access_tier) || isHrManager(me)) &&
      target.service_id != null &&
      target.service_id === me.service_id);
  if (!mine && !canManageOthers) {
    return { ok: false, error: "You cannot add documents for this person." };
  }

  // Create the row first so the stored file can be keyed to it.
  const { data: row, error } = await supabase
    .from("identity_documents")
    .insert({
      organisation_id: target.organisation_id,
      profile_id: profileId,
      kind,
      label,
    })
    .select("id")
    .single();
  if (error || !row) {
    return { ok: false, error: error?.message ?? "Could not save the record." };
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const stored = await storeDocument({
    organisationId: target.organisation_id as string,
    ownerType: "identity",
    ownerId: row.id,
    fileName: file.name,
    mimeType: file.type || null,
    bytes,
    uploadedBy: me.id,
  });
  if (!stored.ok) {
    await createAdminClient().from("identity_documents").delete().eq("id", row.id);
    return { ok: false, error: stored.error };
  }
  await supabase
    .from("identity_documents")
    .update({ document_id: stored.document.id })
    .eq("id", row.id);

  revalidatePath("/admin/staff", "layout");
  revalidatePath("/admin/verification");
  revalidatePath("/onboarding");
  return { ok: true };
}

export async function deleteIdentityDocument(id: string): Promise<Result> {
  const me = await getProfile();
  if (!me) return { ok: false, error: "Sign in." };
  const admin = createAdminClient();
  const { data: row } = await admin
    .from("identity_documents")
    .select("id, profile_id, organisation_id, document_id, sighted_at")
    .eq("id", id)
    .maybeSingle();
  if (!row || row.organisation_id !== me.organisation_id) {
    return { ok: false, error: "Not found." };
  }
  // A sighted document is history and only an HR manager may remove it.
  if (row.sighted_at && !isHrManager(me)) {
    return { ok: false, error: "That document has been sighted and is locked." };
  }
  if (row.profile_id !== me.id && !isHrManager(me)) {
    // fall through to worker managers at the same service
    const { data: target } = await admin
      .from("profiles")
      .select("service_id")
      .eq("id", row.profile_id)
      .maybeSingle();
    if (!target || target.service_id !== me.service_id) {
      return { ok: false, error: "You cannot remove this document." };
    }
  }

  if (row.document_id) await deleteDocument(row.document_id);
  await admin.from("identity_documents").delete().eq("id", id);

  revalidatePath("/admin/staff", "layout");
  revalidatePath("/admin/verification");
  revalidatePath("/onboarding");
  return { ok: true };
}

// An HR manager (or admin) records that a reference check was completed.
export async function recordRefereeCheck(
  refereeId: string,
  input: { completedAt: string; completedBy: string },
): Promise<Result> {
  const me = await getProfile();
  if (!me) return { ok: false, error: "Sign in." };
  const supabase = createClient();
  // worker_referees RLS already limits writes to the person or an HR manager
  // at their service; a plain manager gets no row back.
  const { data: referee } = await supabase
    .from("worker_referees")
    .select("id, profile_id")
    .eq("id", refereeId)
    .maybeSingle();
  if (!referee || referee.profile_id === me.id) {
    return { ok: false, error: "Not allowed." };
  }
  const { error } = await supabase
    .from("worker_referees")
    .update({
      check_completed_at: input.completedAt || null,
      check_completed_by: input.completedBy.trim() || null,
    })
    .eq("id", refereeId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/staff", "layout");
  return { ok: true };
}

export async function setHrManager(
  profileId: string,
  value: boolean,
): Promise<Result> {
  const me = await getProfile();
  if (!isAdmin(me?.access_tier)) {
    return { ok: false, error: "Only an admin can change the HR manager flag." };
  }
  const supabase = createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ hr_manager: value })
    .eq("id", profileId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/staff", "layout");
  return { ok: true };
}

// Change a staff member's job role. Admin anywhere in the organisation, or an
// HR manager for staff at their own service. Changing the role swaps the SOP
// suite; existing sign_offs stay in the record but no longer count.
export async function setStaffJobRole(
  profileId: string,
  jobRoleId: string | null,
): Promise<Result> {
  const me = await getProfile();
  if (!me) return { ok: false, error: "Sign in." };
  const admin = createAdminClient();

  const { data: person } = await admin
    .from("profiles")
    .select("id, organisation_id, service_id")
    .eq("id", profileId)
    .maybeSingle();
  if (!person || person.organisation_id !== me.organisation_id) {
    return { ok: false, error: "Staff member not found." };
  }
  const allowed =
    isAdmin(me.access_tier) ||
    (isHrManager(me) && person.service_id === me.service_id);
  if (!allowed) {
    return { ok: false, error: "You cannot change this person's job role." };
  }

  if (jobRoleId) {
    const { data: role } = await admin
      .from("job_roles")
      .select("id, organisation_id")
      .eq("id", jobRoleId)
      .maybeSingle();
    if (!role || role.organisation_id !== me.organisation_id) {
      return { ok: false, error: "That job role is not in your organisation." };
    }
  }

  const { error } = await admin
    .from("profiles")
    .update({ job_role_id: jobRoleId })
    .eq("id", profileId);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/staff", "layout");
  revalidatePath("/admin/job-roles", "layout");
  revalidatePath("/sops");
  return { ok: true };
}

// Change a staff member's access tier. Admin only. Cannot change your own, and
// the last admin in an organisation cannot be demoted.
export async function setStaffAccessTier(
  profileId: string,
  tier: string,
): Promise<Result> {
  const me = await getProfile();
  if (!isAdmin(me?.access_tier) || !me) {
    return { ok: false, error: "Only an admin can change access levels." };
  }
  if (!ASSIGNABLE_TIERS.some((t) => t.value === tier)) {
    return { ok: false, error: "Unknown access level." };
  }
  if (profileId === me.id) {
    return { ok: false, error: "You cannot change your own access level." };
  }

  const admin = createAdminClient();
  const { data: person } = await admin
    .from("profiles")
    .select("id, organisation_id, access_tier")
    .eq("id", profileId)
    .maybeSingle();
  if (!person || person.organisation_id !== me.organisation_id) {
    return { ok: false, error: "Staff member not found." };
  }
  if (person.access_tier === tier) return { ok: true };

  // Demoting the last admin would lock the organisation out.
  if (person.access_tier === "admin" && tier !== "admin") {
    const { count } = await admin
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("organisation_id", me.organisation_id)
      .eq("access_tier", "admin");
    if ((count ?? 0) <= 1) {
      return {
        ok: false,
        error: "This is the only admin. Promote someone else first.",
      };
    }
  }

  const { error } = await admin
    .from("profiles")
    .update({ access_tier: tier as AccessTier })
    .eq("id", profileId);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/staff", "layout");
  return { ok: true };
}
