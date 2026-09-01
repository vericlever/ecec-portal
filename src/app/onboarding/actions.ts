"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { CORE_TRAINING_TYPES, type TrainingType } from "@/lib/nqaits";

// The whole questionnaire, as the client holds it. Empty strings are treated as
// "not answered" and stored as null.
export type OnboardingPayload = {
  // personal
  ref_number: string;
  title: string;
  first_name: string;
  middle_name: string;
  last_name: string;
  previously_known_as: string;
  other_names: string;
  date_of_birth: string;
  phone: string;
  mobile: string;
  // home address
  home_line1: string;
  home_line2: string;
  home_suburb: string;
  home_state: string;
  home_postcode: string;
  // postal address
  postal_same_as_home: boolean;
  postal_line1: string;
  postal_line2: string;
  postal_suburb: string;
  postal_state: string;
  postal_postcode: string;
  // position
  nqaits_position: string;
  non_educator_role: string;
  start_date: string;
  employment_nature: string;
  // wwcc
  wwcc_exempt: "" | "yes" | "no";
  wwcc_exemption_reason: string;
  wwcc_check_number: string;
  wwcc_expiry_date: string;
  wwcc_state_of_issue: string;
  // teacher registration (ECT only)
  teacher_check_number: string;
  teacher_expiry_date: string;
  teacher_state_of_issue: string;
  // qualification
  has_no_qualifications: boolean;
  qualification_type: string;
  qualification_rto_name: string;
  qualification_rto_number: string;
  qualification_course_code: string;
  qualification_working_towards: "" | "yes" | "no";
  qualification_date_attained: string;
  qualification_date_commenced: string;
  // training
  training: Record<
    string,
    {
      rto_name: string;
      rto_number: string;
      course_code: string;
      date_attained: string;
      expiry_date: string;
      other_description?: string;
    }
  >;
};

type Result = { ok: true } | { ok: false; error: string };

const s = (v: string) => (v.trim() === "" ? null : v.trim());
const d = (v: string) => (v.trim() === "" ? null : v.trim());
const yn = (v: string) => (v === "yes" ? true : v === "no" ? false : null);

async function persist(
  payload: OnboardingPayload,
  markComplete: boolean,
): Promise<Result> {
  const profile = await getProfile();
  if (!profile || !profile.organisation_id) {
    return { ok: false, error: "You are not signed in." };
  }
  const supabase = createClient();
  const me = profile.id;
  const org = profile.organisation_id;

  const { error: wdError } = await supabase.from("worker_details").upsert(
    {
      profile_id: me,
      organisation_id: org,
      ref_number: s(payload.ref_number),
      title: s(payload.title),
      first_name: s(payload.first_name),
      middle_name: s(payload.middle_name),
      last_name: s(payload.last_name),
      previously_known_as: s(payload.previously_known_as),
      other_names: s(payload.other_names),
      date_of_birth: d(payload.date_of_birth),
      phone: s(payload.phone),
      mobile: s(payload.mobile),
      home_line1: s(payload.home_line1),
      home_line2: s(payload.home_line2),
      home_suburb: s(payload.home_suburb),
      home_state: s(payload.home_state),
      home_postcode: s(payload.home_postcode),
      postal_same_as_home: payload.postal_same_as_home,
      postal_line1: payload.postal_same_as_home ? null : s(payload.postal_line1),
      postal_line2: payload.postal_same_as_home ? null : s(payload.postal_line2),
      postal_suburb: payload.postal_same_as_home ? null : s(payload.postal_suburb),
      postal_state: payload.postal_same_as_home ? null : s(payload.postal_state),
      postal_postcode: payload.postal_same_as_home
        ? null
        : s(payload.postal_postcode),
      nqaits_position: s(payload.nqaits_position),
      non_educator_role:
        payload.nqaits_position === "Non-Educator Staff"
          ? s(payload.non_educator_role)
          : null,
      employment_nature: s(payload.employment_nature),
      wwcc_exempt: payload.wwcc_exempt === "yes",
      wwcc_exemption_reason:
        payload.wwcc_exempt === "yes" ? s(payload.wwcc_exemption_reason) : null,
      has_no_qualifications: payload.has_no_qualifications,
      start_date: d(payload.start_date),
      onboarding_completed_at: markComplete ? new Date().toISOString() : undefined,
    },
    { onConflict: "profile_id" },
  );
  if (wdError) return { ok: false, error: wdError.message };

  // WWCC: one row from onboarding, only once there is something to record. The
  // trigger protects sighted_at / sighted_by.
  const wwccHasData =
    s(payload.wwcc_check_number) ||
    d(payload.wwcc_expiry_date) ||
    s(payload.wwcc_state_of_issue);
  await upsertSingle(supabase, "wwcc_checks", me, org, payload.wwcc_exempt !== "yes" && wwccHasData
    ? {
        check_number: s(payload.wwcc_check_number),
        expiry_date: d(payload.wwcc_expiry_date),
        state_of_issue: s(payload.wwcc_state_of_issue),
      }
    : null);

  const teacherHasData =
    s(payload.teacher_check_number) ||
    d(payload.teacher_expiry_date) ||
    s(payload.teacher_state_of_issue);
  await upsertSingle(
    supabase,
    "teacher_registrations",
    me,
    org,
    payload.nqaits_position === "Early Childhood Teacher" && teacherHasData
      ? {
          check_number: s(payload.teacher_check_number),
          expiry_date: d(payload.teacher_expiry_date),
          state_of_issue: s(payload.teacher_state_of_issue),
        }
      : null,
  );

  const qualHasData =
    s(payload.qualification_type) ||
    s(payload.qualification_rto_name) ||
    s(payload.qualification_course_code) ||
    d(payload.qualification_date_attained);
  await upsertSingle(
    supabase,
    "qualifications",
    me,
    org,
    !payload.has_no_qualifications && qualHasData
      ? {
          qualification_type: s(payload.qualification_type),
          rto_name: s(payload.qualification_rto_name),
          rto_number: s(payload.qualification_rto_number),
          course_code: s(payload.qualification_course_code),
          working_towards: yn(payload.qualification_working_towards) ?? false,
          date_attained: d(payload.qualification_date_attained),
          date_commenced: d(payload.qualification_date_commenced),
        }
      : null,
  );

  for (const type of [...CORE_TRAINING_TYPES, "Other"] as TrainingType[]) {
    const row = payload.training[type];
    const hasData =
      row &&
      (s(row.rto_name) ||
        s(row.course_code) ||
        d(row.date_attained) ||
        (type === "Other" && s(row.other_description ?? "")));
    const { data: existing } = await supabase
      .from("training_records")
      .select("id")
      .eq("profile_id", me)
      .eq("training_type", type)
      .maybeSingle();

    if (!hasData) {
      if (existing) await supabase.from("training_records").delete().eq("id", existing.id);
      continue;
    }
    const record = {
      profile_id: me,
      organisation_id: org,
      training_type: type,
      other_description: type === "Other" ? s(row.other_description ?? "") : null,
      rto_name: s(row.rto_name),
      rto_number: s(row.rto_number),
      course_code: s(row.course_code),
      date_attained: d(row.date_attained),
      expiry_date: d(row.expiry_date),
    };
    if (existing) {
      await supabase.from("training_records").update(record).eq("id", existing.id);
    } else {
      await supabase.from("training_records").insert(record);
    }
  }

  revalidatePath("/onboarding");
  revalidatePath("/sops");
  return { ok: true };
}

async function upsertSingle(
  supabase: ReturnType<typeof createClient>,
  table: "wwcc_checks" | "teacher_registrations" | "qualifications",
  profileId: string,
  org: string,
  fields: Record<string, unknown> | null,
) {
  const { data: existing } = await supabase
    .from(table)
    .select("id, sighted_at")
    .eq("profile_id", profileId)
    .limit(1)
    .maybeSingle();

  if (!fields) {
    // Nothing to record. Drop an existing row only if it was never sighted.
    if (existing && !existing.sighted_at) {
      await supabase.from(table).delete().eq("id", existing.id);
    }
    return;
  }
  if (existing) {
    await supabase.from(table).update(fields).eq("id", existing.id);
  } else {
    await supabase
      .from(table)
      .insert({ profile_id: profileId, organisation_id: org, ...fields });
  }
}

export async function saveOnboardingProgress(
  payload: OnboardingPayload,
): Promise<Result> {
  return persist(payload, false);
}

export async function submitOnboarding(
  payload: OnboardingPayload,
): Promise<Result> {
  return persist(payload, true);
}
