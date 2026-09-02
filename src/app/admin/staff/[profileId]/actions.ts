"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getProfile, isHrManager, isAdmin } from "@/lib/auth";
import { storeDocument, deleteDocument } from "@/lib/documents/store";
import { calcExpiry } from "@/lib/contracts";

type Result = { ok: true } | { ok: false; error: string };

type VerifiableTable =
  | "wwcc_checks"
  | "teacher_registrations"
  | "qualifications"
  | "training_records";

const VERIFIABLE: VerifiableTable[] = [
  "wwcc_checks",
  "teacher_registrations",
  "qualifications",
  "training_records",
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
