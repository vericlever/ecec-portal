"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { CORE_TRAINING_TYPES, type TrainingType } from "@/lib/nqaits";
import {
  SCREENING_CHILD_PROTECTION_Q,
  SCREENING_CRIMINAL_Q,
} from "@/lib/hr-screening";

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
  gender: string;
  phone: string;
  mobile: string;
  // emergency contact / next of kin
  nok_name: string;
  nok_relationship: string;
  nok_phone: string;
  nok_address: string;
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
  // uniform and availability
  uniform_hoodie: string;
  uniform_polo: string;
  uniform_vest: string;
  available_days: string[];
  ideal_weekly_hours: string;
  availability_notes: string;
  // work eligibility
  work_eligibility: string;
  visa_number: string;
  visa_expiry: string;
  // payroll (tax, super, banking)
  tfn: string;
  claims_tax_free_threshold: "" | "yes" | "no";
  has_help_ssl_tsl_debt: "" | "yes" | "no";
  has_financial_supplement_debt: "" | "yes" | "no";
  super_fund_name: string;
  super_member_number: string;
  bank_bsb: string;
  bank_account_number: string;
  bank_account_name: string;
  // screening declarations
  screening_child_protection: "" | "yes" | "no";
  screening_child_protection_detail: string;
  screening_criminal: "" | "yes" | "no";
  screening_criminal_detail: string;
  // referees
  referees: {
    name: string;
    organisation: string;
    job_title: string;
    relationship: string;
    phone: string;
    email: string;
  }[];
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
      gender: s(payload.gender),
      phone: s(payload.phone),
      mobile: s(payload.mobile),
      nok_name: s(payload.nok_name),
      nok_relationship: s(payload.nok_relationship),
      nok_phone: s(payload.nok_phone),
      nok_address: s(payload.nok_address),
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
      uniform_hoodie: s(payload.uniform_hoodie),
      uniform_polo: s(payload.uniform_polo),
      uniform_vest: s(payload.uniform_vest),
      available_days:
        payload.available_days && payload.available_days.length > 0
          ? payload.available_days
          : null,
      ideal_weekly_hours:
        payload.ideal_weekly_hours.trim() === ""
          ? null
          : Number(payload.ideal_weekly_hours),
      availability_notes: s(payload.availability_notes),
      work_eligibility: s(payload.work_eligibility),
      visa_number:
        payload.work_eligibility === "visa" ? s(payload.visa_number) : null,
      visa_expiry:
        payload.work_eligibility === "visa" ? d(payload.visa_expiry) : null,
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

  // WWCC and teacher registration are standalone checks. A still-unsighted check
  // is corrected in place; once a leader has sighted one it becomes permanent
  // history and a changed check number, expiry or state is recorded as a new
  // check that re-enters the verification queue (see upsertCheck).
  const wwccHasData =
    s(payload.wwcc_check_number) ||
    d(payload.wwcc_expiry_date) ||
    s(payload.wwcc_state_of_issue);
  await upsertCheck(supabase, "wwcc_checks", me, org, payload.wwcc_exempt !== "yes" && wwccHasData
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
  await upsertCheck(
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

  // Payroll: tax file number declaration, superannuation, banking.
  const { error: payrollError } = await supabase.from("worker_payroll").upsert(
    {
      profile_id: me,
      organisation_id: org,
      tfn: s(payload.tfn),
      claims_tax_free_threshold: yn(payload.claims_tax_free_threshold),
      has_help_ssl_tsl_debt: yn(payload.has_help_ssl_tsl_debt),
      has_financial_supplement_debt: yn(payload.has_financial_supplement_debt),
      super_fund_name: s(payload.super_fund_name),
      super_member_number: s(payload.super_member_number),
      bank_bsb: s(payload.bank_bsb),
      bank_account_number: s(payload.bank_account_number),
      bank_account_name: s(payload.bank_account_name),
    },
    { onConflict: "profile_id" },
  );
  if (payrollError) return { ok: false, error: payrollError.message };

  // Screening declarations. Snapshot the current question wording whenever an
  // answer is given.
  const cpAnswered = yn(payload.screening_child_protection);
  const crimAnswered = yn(payload.screening_criminal);
  const { error: screeningError } = await supabase
    .from("worker_screening")
    .upsert(
      {
        profile_id: me,
        organisation_id: org,
        child_protection_history: cpAnswered,
        child_protection_detail:
          cpAnswered === true
            ? s(payload.screening_child_protection_detail)
            : null,
        child_protection_question:
          cpAnswered != null ? SCREENING_CHILD_PROTECTION_Q : null,
        criminal_history: crimAnswered,
        criminal_detail:
          crimAnswered === true ? s(payload.screening_criminal_detail) : null,
        criminal_question: crimAnswered != null ? SCREENING_CRIMINAL_Q : null,
        answered_at:
          cpAnswered != null || crimAnswered != null
            ? new Date().toISOString()
            : null,
      },
      { onConflict: "profile_id" },
    );
  if (screeningError) return { ok: false, error: screeningError.message };

  // Referees, two slots.
  for (let i = 0; i < 2; i++) {
    const r = payload.referees[i];
    const slot = i + 1;
    const { data: existing } = await supabase
      .from("worker_referees")
      .select("id")
      .eq("profile_id", me)
      .eq("slot", slot)
      .maybeSingle();
    const hasData =
      r &&
      (s(r.name) ||
        s(r.organisation) ||
        s(r.job_title) ||
        s(r.relationship) ||
        s(r.phone) ||
        s(r.email));
    if (!hasData) {
      if (existing)
        await supabase.from("worker_referees").delete().eq("id", existing.id);
      continue;
    }
    const fields = {
      profile_id: me,
      organisation_id: org,
      slot,
      name: s(r.name),
      organisation: s(r.organisation),
      job_title: s(r.job_title),
      relationship: s(r.relationship),
      phone: s(r.phone),
      email: s(r.email),
    };
    if (existing) {
      await supabase.from("worker_referees").update(fields).eq("id", existing.id);
    } else {
      await supabase.from("worker_referees").insert(fields);
    }
  }

  revalidatePath("/onboarding");
  revalidatePath("/sops");
  return { ok: true };
}

async function upsertSingle(
  supabase: ReturnType<typeof createClient>,
  table: "qualifications",
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

type CheckFields = {
  check_number: string | null;
  expiry_date: string | null;
  state_of_issue: string | null;
};

// WWCC / teacher registration checks, which keep a history rather than a single
// mutable row:
//   * no check yet, or an unsighted one waiting to be sighted -> write in place
//   * the latest check has been sighted and the new details differ -> insert a
//     new unsighted row; the sighted one stays as history and the new one shows
//     up in /admin/verification
//   * the new details match the latest sighted check -> nothing to do
// Clearing the details removes an unsighted check but never a sighted one.
async function upsertCheck(
  supabase: ReturnType<typeof createClient>,
  table: "wwcc_checks" | "teacher_registrations",
  profileId: string,
  org: string,
  fields: CheckFields | null,
) {
  const { data: rows } = await supabase
    .from(table)
    .select("id, check_number, expiry_date, state_of_issue, sighted_at")
    .eq("profile_id", profileId)
    .order("created_at", { ascending: false });

  const all = rows ?? [];
  const pending = all.find((r) => !r.sighted_at) ?? null;

  if (!fields) {
    if (pending) await supabase.from(table).delete().eq("id", pending.id);
    return;
  }

  if (pending) {
    await supabase.from(table).update(fields).eq("id", pending.id);
    return;
  }

  const latest = all[0];
  const unchanged =
    latest &&
    (latest.check_number ?? null) === fields.check_number &&
    (latest.expiry_date ?? null) === fields.expiry_date &&
    (latest.state_of_issue ?? null) === fields.state_of_issue;
  if (unchanged) return;

  await supabase
    .from(table)
    .insert({ profile_id: profileId, organisation_id: org, ...fields });
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
