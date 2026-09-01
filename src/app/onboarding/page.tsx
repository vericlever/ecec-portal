import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { CORE_TRAINING_TYPES } from "@/lib/nqaits";
import { OnboardingForm } from "./onboarding-form";
import type { OnboardingPayload } from "./actions";

export const dynamic = "force-dynamic";

const str = (v: unknown) => (v == null ? "" : String(v));
const ynStr = (v: unknown): "" | "yes" | "no" =>
  v === true ? "yes" : v === false ? "no" : "";

export default async function OnboardingPage() {
  const profile = await requireProfile();
  const supabase = createClient();

  const [
    { data: wd },
    { data: wwcc },
    { data: teacher },
    { data: qual },
    { data: training },
  ] = await Promise.all([
    supabase.from("worker_details").select("*").eq("profile_id", profile.id).maybeSingle(),
    supabase.from("wwcc_checks").select("*").eq("profile_id", profile.id).limit(1).maybeSingle(),
    supabase.from("teacher_registrations").select("*").eq("profile_id", profile.id).limit(1).maybeSingle(),
    supabase.from("qualifications").select("*").eq("profile_id", profile.id).limit(1).maybeSingle(),
    supabase.from("training_records").select("*").eq("profile_id", profile.id),
  ]);

  const trainingByType: OnboardingPayload["training"] = {};
  for (const type of [...CORE_TRAINING_TYPES, "Other"]) {
    const row = (training ?? []).find((t) => t.training_type === type);
    trainingByType[type] = {
      rto_name: str(row?.rto_name),
      rto_number: str(row?.rto_number),
      course_code: str(row?.course_code),
      date_attained: str(row?.date_attained),
      expiry_date: str(row?.expiry_date),
      other_description: str(row?.other_description),
    };
  }

  const initial: OnboardingPayload = {
    ref_number: str(wd?.ref_number),
    title: str(wd?.title),
    first_name: str(wd?.first_name),
    middle_name: str(wd?.middle_name),
    last_name: str(wd?.last_name),
    previously_known_as: str(wd?.previously_known_as),
    other_names: str(wd?.other_names),
    date_of_birth: str(wd?.date_of_birth),
    phone: str(wd?.phone),
    mobile: str(wd?.mobile),
    home_line1: str(wd?.home_line1),
    home_line2: str(wd?.home_line2),
    home_suburb: str(wd?.home_suburb),
    home_state: str(wd?.home_state),
    home_postcode: str(wd?.home_postcode),
    postal_same_as_home: wd?.postal_same_as_home ?? true,
    postal_line1: str(wd?.postal_line1),
    postal_line2: str(wd?.postal_line2),
    postal_suburb: str(wd?.postal_suburb),
    postal_state: str(wd?.postal_state),
    postal_postcode: str(wd?.postal_postcode),
    nqaits_position: str(wd?.nqaits_position),
    non_educator_role: str(wd?.non_educator_role),
    start_date: str(wd?.start_date),
    employment_nature: str(wd?.employment_nature),
    wwcc_exempt: ynStr(wd?.wwcc_exempt),
    wwcc_exemption_reason: str(wd?.wwcc_exemption_reason),
    wwcc_check_number: str(wwcc?.check_number),
    wwcc_expiry_date: str(wwcc?.expiry_date),
    wwcc_state_of_issue: str(wwcc?.state_of_issue),
    teacher_check_number: str(teacher?.check_number),
    teacher_expiry_date: str(teacher?.expiry_date),
    teacher_state_of_issue: str(teacher?.state_of_issue),
    has_no_qualifications: wd?.has_no_qualifications ?? false,
    qualification_type: str(qual?.qualification_type),
    qualification_rto_name: str(qual?.rto_name),
    qualification_rto_number: str(qual?.rto_number),
    qualification_course_code: str(qual?.course_code),
    qualification_working_towards: ynStr(qual?.working_towards),
    qualification_date_attained: str(qual?.date_attained),
    qualification_date_commenced: str(qual?.date_commenced),
    training: trainingByType,
  };

  const completed = Boolean(wd?.onboarding_completed_at);

  return (
    <div>
      <h1 className="text-xl font-semibold">
        {completed ? "Your details" : "Your onboarding"}
      </h1>
      <p className="mt-1 max-w-prose text-sm text-slate-500">
        {completed
          ? "Your Worker Register details. Update them whenever they change - a leader will sight any new documents with you."
          : "Enter your details and the information from your documents. A leader will check the original documents with you and record that they have sighted them."}
      </p>
      <OnboardingForm initial={initial} completed={completed} />
    </div>
  );
}
