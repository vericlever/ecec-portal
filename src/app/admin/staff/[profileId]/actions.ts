"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getProfile, isHrManager, isAdmin, isManager } from "@/lib/auth";
import { type AccessTier, ASSIGNABLE_TIERS } from "@/lib/roles";
import { storeDocument, deleteDocument, documentSha256 } from "@/lib/documents/store";
import { calcExpiry } from "@/lib/contracts";
import { generatePasswordResetLink } from "@/lib/invite";
import { emailEnabled, sendPasswordReset } from "@/lib/email";

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
  // A deed is never signed in-app (see migration 0042) - HR/Admin flags it at
  // upload, based on the document they are looking at.
  const isDeed = formData.get("is_deed") === "on";

  const supabase = createClient();
  const { data: contract, error } = await supabase
    .from("contracts")
    .insert({
      organisation_id: gate.organisationId,
      profile_id: profileId,
      start_date: startDate,
      period_type: periodType,
      duration_months: durationMonths,
      expiry_date: expiry,
      notes,
      is_deed: isDeed,
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
    await supabase.from("contracts").delete().eq("id", contract.id);
    return { ok: false, error: stored.error };
  }
  await supabase
    .from("contracts")
    .update({ document_id: stored.document.id })
    .eq("id", contract.id);

  revalidatePath("/admin/staff", "layout");
  revalidatePath("/admin");
  return { ok: true };
}

// A staff member reads and accepts their own active contract by typing their
// full legal name (Step 39 - replaces the tick-box). sign_own_contract is a
// SECURITY DEFINER function (migration 0044): contracts_write RLS doesn't
// cover a self-write at all (only admin / hr_manager-at-service may write that
// table), and this operation must only ever be able to touch the signature
// fields, never the contract's terms - not something a table policy can
// express, so it goes through the function's own checks instead.
export async function signOwnContract(
  contractId: string,
  typedName: string,
): Promise<Result> {
  const me = await getProfile();
  if (!me) return { ok: false, error: "Sign in." };
  const name = typedName.trim();
  if (!name) return { ok: false, error: "Type your full legal name to sign." };

  const supabase = createClient();
  const { data: contract } = await supabase
    .from("contracts")
    .select("id, profile_id, superseded_at, signed_at, is_deed, document_id")
    .eq("id", contractId)
    .maybeSingle();
  if (!contract || contract.profile_id !== me.id) {
    return { ok: false, error: "Contract not found." };
  }
  if (contract.superseded_at) {
    return { ok: false, error: "This contract has been replaced." };
  }
  if (contract.is_deed) {
    return {
      ok: false,
      error: "This contract is a deed and is signed on paper, not in the portal.",
    };
  }
  if (contract.signed_at) return { ok: true };

  const hash = await documentSha256(contract.document_id);
  const { error } = await supabase.rpc("sign_own_contract", {
    p_contract_id: contractId,
    p_signed_name: name,
    p_signed_content_hash: hash,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/onboarding");
  revalidatePath("/admin/staff", "layout");
  return { ok: true };
}

// HR manager or Admin countersigns, independent of the employee slot -
// countersign_contract is the SECURITY DEFINER counterpart to
// sign_own_contract, gated the same as contracts_write (Admin org-wide, HR
// manager at the worker's own service).
export async function countersignContract(
  contractId: string,
  typedName: string,
): Promise<Result> {
  const me = await getProfile();
  if (!me || !isHrManager(me)) {
    return { ok: false, error: "You are not allowed to countersign contracts." };
  }
  const name = typedName.trim();
  if (!name) return { ok: false, error: "Type your full legal name to countersign." };

  const supabase = createClient();
  const { data: contract } = await supabase
    .from("contracts")
    .select("id, profile_id, organisation_id, superseded_at, is_deed, document_id, countersigned_at")
    .eq("id", contractId)
    .maybeSingle();
  if (!contract || contract.organisation_id !== me.organisation_id) {
    return { ok: false, error: "Contract not found." };
  }
  if (!isAdmin(me.access_tier) && contract.profile_id) {
    const { data: worker } = await supabase
      .from("profiles")
      .select("service_id")
      .eq("id", contract.profile_id)
      .maybeSingle();
    if (!worker || worker.service_id !== me.service_id) {
      return { ok: false, error: "That staff member is not at your service." };
    }
  }
  if (contract.superseded_at) {
    return { ok: false, error: "This contract has been replaced." };
  }
  if (contract.is_deed) {
    return {
      ok: false,
      error: "This contract is a deed and is signed on paper, not in the portal.",
    };
  }
  if (contract.countersigned_at) return { ok: true };

  const hash = await documentSha256(contract.document_id);
  const { error } = await supabase.rpc("countersign_contract", {
    p_contract_id: contractId,
    p_signed_name: name,
    p_signed_content_hash: hash,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/staff", "layout");
  revalidatePath("/admin");
  return { ok: true };
}

export async function deleteContract(contractId: string): Promise<Result> {
  const me = await getProfile();
  if (!me || !isHrManager(me)) {
    return { ok: false, error: "You are not allowed to manage contracts." };
  }
  const supabase = createClient();
  const { data: contract } = await supabase
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
  await supabase.from("contracts").delete().eq("id", contractId);

  // Restore the most recent remaining period as the active one, so a mistaken
  // upload can be undone cleanly.
  const { data: remaining } = await supabase
    .from("contracts")
    .select("id")
    .eq("profile_id", contract.profile_id)
    .order("created_at", { ascending: false })
    .limit(1);
  if (remaining && remaining.length > 0) {
    await supabase
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
    await supabase.from("identity_documents").delete().eq("id", row.id);
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
  const supabase = createClient();
  const { data: row } = await supabase
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
    const { data: target } = await supabase
      .from("profiles")
      .select("service_id")
      .eq("id", row.profile_id)
      .maybeSingle();
    if (!target || target.service_id !== me.service_id) {
      return { ok: false, error: "You cannot remove this document." };
    }
  }

  if (row.document_id) await deleteDocument(row.document_id);
  await supabase.from("identity_documents").delete().eq("id", id);

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

// Change a staff member's job roles (a person can hold more than one, e.g.
// an ed leader needs both Educator and Room Leader). Admin anywhere in the
// organisation, or an HR manager for staff at their own service. Removing a
// role drops its suite from what they must sign; existing sign_offs stay in
// the record but no longer count. profiles.job_role_id is kept in sync as
// the first assigned role (or null) so any reader still on the single-role
// column gets a reasonable value rather than a stale one.
export async function setStaffJobRoles(
  profileId: string,
  jobRoleIds: string[],
): Promise<Result> {
  const me = await getProfile();
  if (!me) return { ok: false, error: "Sign in." };
  const supabase = createClient();

  const { data: person } = await supabase
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

  const uniqueIds = Array.from(new Set(jobRoleIds));
  if (uniqueIds.length > 0) {
    const { data: roles } = await supabase
      .from("job_roles")
      .select("id, organisation_id")
      .in("id", uniqueIds);
    const valid = (roles ?? []).filter((r) => r.organisation_id === me.organisation_id);
    if (valid.length !== uniqueIds.length) {
      return { ok: false, error: "One of those job roles is not in your organisation." };
    }
  }

  const { error: deleteErr } = await supabase
    .from("profile_job_roles")
    .delete()
    .eq("profile_id", profileId);
  if (deleteErr) return { ok: false, error: deleteErr.message };

  if (uniqueIds.length > 0) {
    const { error: insertErr } = await supabase.from("profile_job_roles").insert(
      uniqueIds.map((jobRoleId) => ({
        profile_id: profileId,
        job_role_id: jobRoleId,
        organisation_id: me.organisation_id,
      })),
    );
    if (insertErr) return { ok: false, error: insertErr.message };
  }

  const { error: primaryErr } = await supabase
    .from("profiles")
    .update({ job_role_id: uniqueIds[0] ?? null })
    .eq("id", profileId);
  if (primaryErr) return { ok: false, error: primaryErr.message };

  revalidatePath("/admin/staff", "layout");
  revalidatePath("/admin/job-roles", "layout");
  revalidatePath("/sops");
  revalidatePath("/home");
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

  const supabase = createClient();
  const { data: person } = await supabase
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
    const { count } = await supabase
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

  const { error } = await supabase
    .from("profiles")
    .update({ access_tier: tier as AccessTier })
    .eq("id", profileId);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/staff", "layout");
  return { ok: true };
}

// Trigger a password reset email for a staff member. Admin anywhere in the
// organisation, or an HR manager for staff at their own service. The person who
// triggers it never sees or sets the password - Supabase mints the token and
// the staff member follows the emailed link. generatePasswordResetLink needs
// auth.admin.generateLink, which only the service-role client can call, so
// this one stays on it rather than swapping - there is no RLS-equivalent for
// an operation against Supabase's own auth schema.
export async function sendPasswordResetForStaff(
  profileId: string,
): Promise<Result> {
  const me = await getProfile();
  if (!me) return { ok: false, error: "Sign in." };
  const admin = createAdminClient();

  const { data: person } = await admin
    .from("profiles")
    .select("id, organisation_id, service_id, full_name, email")
    .eq("id", profileId)
    .maybeSingle();
  if (!person || person.organisation_id !== me.organisation_id) {
    return { ok: false, error: "Staff member not found." };
  }
  const allowed =
    isAdmin(me.access_tier) ||
    (isHrManager(me) && person.service_id === me.service_id);
  if (!allowed) {
    return { ok: false, error: "You cannot reset this person's password." };
  }
  if (!person.email) {
    return { ok: false, error: "This account has no email address." };
  }

  const link = await generatePasswordResetLink(person.email as string);
  if (!link.ok) return { ok: false, error: link.error };

  let emailSent = false;
  let sendError: string | null = null;
  if (emailEnabled()) {
    const sent = await sendPasswordReset({
      to: person.email as string,
      fullName: (person.full_name as string) ?? "",
      link: link.link,
      triggeredByLeader: true,
    });
    emailSent = sent.ok;
    if (!sent.ok) sendError = sent.error;
  }

  // Record the attempt either way, so the audit trail shows it was triggered.
  await admin.from("password_reset_requests").insert({
    organisation_id: person.organisation_id,
    target_email: person.email,
    target_profile_id: person.id,
    requested_by_profile_id: me.id,
    source: "admin",
    email_sent: emailSent,
  });
  revalidatePath(`/admin/staff/${profileId}`);

  if (emailEnabled() && !emailSent) {
    return {
      ok: false,
      error: `Recorded, but the email did not send: ${sendError ?? "unknown error"}`,
    };
  }
  return { ok: true };
}
