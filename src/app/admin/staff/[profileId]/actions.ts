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
import { isEmailSuppressed, logNotification } from "@/lib/notifications";
import { validatePdf } from "@/lib/signing/validate-pdf";
import { storeSignature } from "@/lib/signing/store-signature";
import { generateContractSignedCopy } from "@/lib/signing/signed-copy";
import { notifyContractSigned, notifyContractCountersigned } from "@/lib/signing/notify";

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
// policy (migration 0063), but gives a clean error before any file is touched.
// Self-management is locked out for everyone except an Admin - there is no
// higher tier to upload a contract for an Admin, but an HR-manager-flagged
// staff member or manager must never be the one managing their own.
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
  if (profileId === me.id && !isAdmin(me.access_tier)) {
    return {
      ok: false,
      error: "You cannot manage your own contract. An admin needs to do this for you.",
    };
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
  // Step 57: every contract requires countersignature - no per-upload
  // choice. Deeds never use this field either way (see executionState()).
  const requiresCountersign = true;

  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!isDeed) {
    const validation = await validatePdf(bytes, file.type || null, file.name);
    if (!validation.ok) return { ok: false, error: validation.error };
  }

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
      requires_countersign: requiresCountersign,
      created_by: gate.me.id,
    })
    .select("id")
    .single();
  if (error || !contract) {
    return { ok: false, error: error?.message ?? "Could not save the contract." };
  }

  const stored = await storeDocument({
    organisationId: gate.organisationId,
    ownerType: "contract",
    ownerId: contract.id,
    fileName: file.name,
    mimeType: file.type || null,
    bytes,
    uploadedBy: gate.me.id,
    // Contracts hold pay rates and personal terms - no reason to extract text.
    extract: false,
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
  signatureDataUrl: string,
): Promise<Result> {
  const me = await getProfile();
  if (!me) return { ok: false, error: "Sign in." };
  const name = typedName.trim();
  if (!name) return { ok: false, error: "Type your full legal name to sign." };

  const supabase = createClient();
  const { data: contract } = await supabase
    .from("contracts")
    .select("id, organisation_id, profile_id, superseded_at, signed_at, is_deed, document_id")
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

  const signature = await storeSignature({
    dataUrl: signatureDataUrl,
    organisationId: contract.organisation_id,
    contractId,
    uploadedBy: me.id,
  });
  if (!signature.ok) return { ok: false, error: signature.error };

  const hash = await documentSha256(contract.document_id);
  const { error } = await supabase.rpc("sign_own_contract", {
    p_contract_id: contractId,
    p_signed_name: name,
    p_signed_content_hash: hash,
    p_signature_document_id: signature.documentId,
  });
  if (error) return { ok: false, error: error.message };

  // Step 57, A5/A6: the signed copy and its email are best-effort follow-ups
  // - a failure here never undoes the signature that just succeeded above.
  // The panel shows "Signed copy being prepared" and retries on next load
  // whenever signed_copy_document_id is still null.
  try {
    await generateContractSignedCopy(supabase, contractId);
    await notifyContractSigned(supabase, contractId);
  } catch (e) {
    console.error("generateContractSignedCopy/notifyContractSigned failed:", e);
  }

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
  signatureDataUrl: string,
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
    .select("id, profile_id, organisation_id, superseded_at, is_deed, document_id, countersigned_at, requires_countersign")
    .eq("id", contractId)
    .maybeSingle();
  if (!contract || contract.organisation_id !== me.organisation_id) {
    return { ok: false, error: "Contract not found." };
  }
  if (contract.profile_id === me.id) {
    return { ok: false, error: "You cannot countersign your own contract." };
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
  if (!contract.requires_countersign) {
    return { ok: false, error: "This contract does not require a countersignature." };
  }
  if (contract.countersigned_at) return { ok: true };

  const signature = await storeSignature({
    dataUrl: signatureDataUrl,
    organisationId: contract.organisation_id,
    contractId,
    uploadedBy: me.id,
  });
  if (!signature.ok) return { ok: false, error: signature.error };

  const hash = await documentSha256(contract.document_id);
  const { error } = await supabase.rpc("countersign_contract", {
    p_contract_id: contractId,
    p_signed_name: name,
    p_signed_content_hash: hash,
    p_signature_document_id: signature.documentId,
  });
  if (error) return { ok: false, error: error.message };

  try {
    await generateContractSignedCopy(supabase, contractId);
    await notifyContractCountersigned(supabase, contractId);
  } catch (e) {
    console.error("generateContractSignedCopy/notifyContractCountersigned failed:", e);
  }

  revalidatePath("/admin/staff", "layout");
  revalidatePath("/admin");
  return { ok: true };
}

// Rebuild the signed copy from the current signature/typed-name data on
// file, for when generation failed or the underlying original changed. Same
// generator the sign/countersign paths call automatically. Same gate as
// uploadContract/deleteContract (canManageContractFor), matching the rest
// of this panel's canManage-controlled actions.
export async function regenerateSignedCopy(contractId: string): Promise<Result> {
  const supabase = createClient();
  const { data: contract } = await supabase
    .from("contracts")
    .select("id, profile_id")
    .eq("id", contractId)
    .maybeSingle();
  if (!contract) return { ok: false, error: "Contract not found." };
  const gate = await canManageContractFor(contract.profile_id);
  if (!gate.ok) return gate;

  try {
    await generateContractSignedCopy(supabase, contractId);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not build a signed copy." };
  }
  revalidatePath("/admin/staff", "layout");
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
    .select(
      "id, profile_id, organisation_id, document_id, signed_signature_document_id, countersigned_signature_document_id, signed_copy_document_id",
    )
    .eq("id", contractId)
    .maybeSingle();
  if (!contract || contract.organisation_id !== me.organisation_id) {
    return { ok: false, error: "Contract not found." };
  }
  const gate = await canManageContractFor(contract.profile_id);
  if (!gate.ok) return gate;

  // Step 57: a signed contract also owns a drawn signature (or two) and a
  // generated signed copy, none of which cascade off the contracts row -
  // clean up all four document rows, not just the original upload.
  const docIds = [
    contract.document_id,
    contract.signed_signature_document_id,
    contract.countersigned_signature_document_id,
    contract.signed_copy_document_id,
  ].filter((id): id is string => Boolean(id));
  for (const id of docIds) await deleteDocument(id);
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

  // Diff against what they already hold rather than delete-and-reinsert
  // everything: a role they keep must keep its original assigned_at, since
  // that is what the signing clock (Step 44) counts from. Only a genuinely
  // new role should start a fresh clock.
  const { data: current } = await supabase
    .from("profile_job_roles")
    .select("job_role_id")
    .eq("profile_id", profileId);
  const currentIds = new Set((current ?? []).map((r) => r.job_role_id as string));
  const wantIds = new Set(uniqueIds);

  const toRemove = Array.from(currentIds).filter((id) => !wantIds.has(id));
  const toAdd = uniqueIds.filter((id) => !currentIds.has(id));

  if (toRemove.length > 0) {
    const { error: deleteErr } = await supabase
      .from("profile_job_roles")
      .delete()
      .eq("profile_id", profileId)
      .in("job_role_id", toRemove);
    if (deleteErr) return { ok: false, error: deleteErr.message };
  }

  if (toAdd.length > 0) {
    const { error: insertErr } = await supabase.from("profile_job_roles").insert(
      toAdd.map((jobRoleId) => ({
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

// A reset link was always minted successfully here, whether or not it could
// be emailed - the caller needs the link itself when it could not, so an
// admin can pass it on some other way rather than the attempt vanishing.
export type PasswordResetResult =
  | { ok: true; emailSent: true }
  | { ok: true; emailSent: false; link: string; reason: string }
  | { ok: false; error: string };

// Trigger a password reset email for a staff member. Admin anywhere in the
// organisation, or an HR manager for staff at their own service. The person who
// triggers it never sees or sets the password - Supabase mints the token and
// the staff member follows the emailed link. generatePasswordResetLink needs
// auth.admin.generateLink, which only the service-role client can call, so
// this one stays on it rather than swapping - there is no RLS-equivalent for
// an operation against Supabase's own auth schema.
export async function sendPasswordResetForStaff(
  profileId: string,
): Promise<PasswordResetResult> {
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

  const suppression = await isEmailSuppressed(profileId);
  let emailSent = false;
  let sendError: string | null = null;
  let providerMessageId: string | null = null;
  if (emailEnabled() && !suppression.suppressed) {
    const sent = await sendPasswordReset({
      to: person.email as string,
      fullName: (person.full_name as string) ?? "",
      link: link.link,
      triggeredByLeader: true,
    });
    emailSent = sent.ok;
    if (sent.ok) providerMessageId = sent.id;
    else sendError = sent.error;
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
  await logNotification({
    organisationId: person.organisation_id,
    recipientProfileId: profileId,
    recipientEmail: person.email as string,
    kind: "password_reset",
    triggerReason: "Admin-triggered password reset",
    providerMessageId,
    deliveryState: suppression.suppressed ? "suppressed" : emailSent ? "sent" : "failed",
    failureReason: suppression.suppressed
      ? (suppression.reason ?? undefined)
      : (sendError ?? undefined),
  });
  revalidatePath(`/admin/staff/${profileId}`);

  if (!emailSent) {
    return {
      ok: true,
      emailSent: false,
      link: link.link,
      reason: suppression.suppressed
        ? `This address is suppressed after a hard bounce: ${suppression.reason ?? "unknown reason"}.`
        : emailEnabled()
          ? `The email did not send: ${sendError ?? "unknown error"}`
          : "Email is not configured on this deployment.",
    };
  }
  return { ok: true, emailSent: true };
}

// Step 44 pause/leave. Freezes the signing clock for every outstanding item
// this person has - not one procedure at a time, since the real scenario
// (someone on leave) means all of it should stop the same way. Manager
// (staff) tier and above, scoped to their own service like every other
// staff-record edit; admin reaches anyone in the organisation.
async function canPauseFor(profileId: string) {
  const me = await getProfile();
  if (!me) return null;
  const supabase = createClient();
  const { data: target } = await supabase
    .from("profiles")
    .select("id, organisation_id, service_id")
    .eq("id", profileId)
    .maybeSingle();
  if (!target || target.organisation_id !== me.organisation_id) return null;
  const allowed =
    isAdmin(me.access_tier) ||
    (isManager(me.access_tier) && target.service_id === me.service_id);
  if (!allowed) return null;
  return { me, supabase };
}

export async function pauseStaffSigning(
  profileId: string,
  reason: string,
  until: string | null,
): Promise<Result> {
  const gate = await canPauseFor(profileId);
  if (!gate) return { ok: false, error: "You cannot pause this person's signing clock." };
  const trimmed = reason.trim();
  if (!trimmed) return { ok: false, error: "A reason is required." };

  const { data, error } = await gate.supabase
    .from("profiles")
    .update({
      signing_paused_at: new Date().toISOString(),
      signing_paused_reason: trimmed,
      signing_paused_until: until || null,
    })
    .eq("id", profileId)
    .is("signing_paused_at", null)
    .select("id");
  if (error) return { ok: false, error: error.message };
  if (!data || data.length === 0) {
    return { ok: false, error: "Already paused." };
  }

  revalidatePath(`/admin/staff/${profileId}`);
  revalidatePath("/admin/staff", "layout");
  revalidatePath("/home");
  return { ok: true };
}

export async function resumeStaffSigning(profileId: string): Promise<Result> {
  const gate = await canPauseFor(profileId);
  if (!gate) return { ok: false, error: "You cannot resume this person's signing clock." };

  const { data: person } = await gate.supabase
    .from("profiles")
    .select("signing_paused_at, signing_paused_days_banked")
    .eq("id", profileId)
    .maybeSingle();
  if (!person?.signing_paused_at) return { ok: true };

  const pausedDays = Math.max(
    0,
    Math.round(
      (Date.now() - new Date(person.signing_paused_at as string).getTime()) / 86_400_000,
    ),
  );

  const { error } = await gate.supabase
    .from("profiles")
    .update({
      signing_paused_at: null,
      signing_paused_reason: null,
      signing_paused_until: null,
      signing_paused_days_banked:
        (person.signing_paused_days_banked as number) + pausedDays,
    })
    .eq("id", profileId);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/admin/staff/${profileId}`);
  revalidatePath("/admin/staff", "layout");
  revalidatePath("/home");
  return { ok: true };
}
