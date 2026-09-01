"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getProfile, canVerify, isAdmin } from "@/lib/auth";

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
  if (!canVerify(me)) {
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
  if (!canVerify(me)) {
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
  if (!canVerify(me)) {
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

export async function setHrVerifier(
  profileId: string,
  value: boolean,
): Promise<Result> {
  const me = await getProfile();
  if (!isAdmin(me?.access_tier)) {
    return { ok: false, error: "Only an admin can change HR sign-off." };
  }
  const supabase = createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ hr_verifier: value })
    .eq("id", profileId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/staff", "layout");
  return { ok: true };
}
