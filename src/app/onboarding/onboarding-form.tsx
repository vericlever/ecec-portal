"use client";

import { useMemo, useState } from "react";
import {
  AU_STATES,
  EMPLOYMENT_NATURES,
  NON_EDUCATOR_ROLES,
  NQAITS_POSITIONS,
  QUALIFICATION_TYPES,
  TITLES,
  CORE_TRAINING_TYPES,
} from "@/lib/nqaits";
import {
  saveOnboardingProgress,
  submitOnboarding,
  type OnboardingPayload,
} from "./actions";

type FieldKey = keyof OnboardingPayload;

const GENDERS = ["Female", "Male", "Non-binary", "Prefer not to say", "Other"];
const WEEK_DAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];
const WORK_ELIGIBILITY_OPTIONS = [
  { value: "citizen", label: "Australian citizen" },
  { value: "permanent_resident", label: "Permanent resident" },
  { value: "visa", label: "Working visa" },
  { value: "other", label: "Other" },
];

export type LockedCheck = {
  check_number: string;
  expiry_date: string;
  state_of_issue: string;
  sighted_at: string;
  sighted_by: string;
};

export function OnboardingForm({
  initial,
  completed,
  wwccLocked,
  teacherLocked,
}: {
  initial: OnboardingPayload;
  completed: boolean;
  wwccLocked: LockedCheck | null;
  teacherLocked: LockedCheck | null;
}) {
  const [data, setData] = useState<OnboardingPayload>(initial);
  const [stepIndex, setStepIndex] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [justSaved, setJustSaved] = useState(false);

  const set = (key: FieldKey, value: OnboardingPayload[FieldKey]) =>
    setData((d) => ({ ...d, [key]: value }));

  const setTraining = (type: string, field: string, value: string) =>
    setData((d) => ({
      ...d,
      training: {
        ...d.training,
        [type]: { ...d.training[type], [field]: value },
      },
    }));

  const setReferee = (index: number, field: string, value: string) =>
    setData((d) => ({
      ...d,
      referees: d.referees.map((r, i) =>
        i === index ? { ...r, [field]: value } : r,
      ),
    }));

  const isEct = data.nqaits_position === "Early Childhood Teacher";

  const steps = useMemo(
    () =>
      [
        { key: "personal", title: "Personal and contact details" },
        { key: "emergency", title: "Emergency contact" },
        { key: "home", title: "Home address" },
        { key: "postal", title: "Postal address" },
        { key: "position", title: "Position" },
        { key: "uniform", title: "Uniform and availability" },
        { key: "eligibility", title: "Work eligibility" },
        { key: "wwcc", title: "Working with Children Check" },
        isEct ? { key: "teacher", title: "Teacher registration" } : null,
        { key: "qualifications", title: "Qualifications" },
        { key: "training", title: "Training records" },
        { key: "payroll", title: "Tax, super and banking" },
        { key: "screening", title: "Screening declarations" },
        { key: "referees", title: "Referees" },
      ].filter(Boolean) as { key: string; title: string }[],
    [isEct],
  );

  const step = steps[Math.min(stepIndex, steps.length - 1)];
  const isLast = stepIndex >= steps.length - 1;

  async function persist(): Promise<boolean> {
    setError(null);
    setSaving(true);
    const result = await saveOnboardingProgress(data);
    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      return false;
    }
    setJustSaved(true);
    setTimeout(() => setJustSaved(false), 2500);
    return true;
  }

  // First run: step through, saving each step, then submit on the last one.
  async function next() {
    if (isLast && !completed) {
      setError(null);
      setSubmitting(true);
      const result = await submitOnboarding(data);
      if (!result.ok) {
        setSubmitting(false);
        setError(result.error);
        return;
      }
      window.location.assign("/sops");
      return;
    }
    if (await persist()) setStepIndex((i) => Math.min(i + 1, steps.length - 1));
  }

  // Edit mode: jump straight to a section. Edits are held in one object, so
  // moving between steps never loses anything; Save writes the lot.
  function jumpTo(i: number) {
    setError(null);
    setStepIndex(i);
  }

  return (
    <div className="mt-6">
      {completed && (
        <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-2.5 text-sm text-green-800">
          Your details are submitted. Change anything below and press Save.
        </div>
      )}

      <ol className="mt-4 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-400">
        {steps.map((s, i) => {
          const cls =
            i === stepIndex
              ? "font-medium text-slate-900"
              : i < stepIndex
                ? "text-slate-500"
                : "";
          return (
            <li key={s.key} className={cls}>
              {completed ? (
                <button
                  type="button"
                  onClick={() => jumpTo(i)}
                  className="hover:text-slate-900 hover:underline"
                >
                  {i + 1}. {s.title}
                </button>
              ) : (
                <span>
                  {i + 1}. {s.title}
                </span>
              )}
            </li>
          );
        })}
      </ol>

      <div className="mt-4 rounded-lg border border-slate-200 bg-white p-5">
        <h2 className="text-base font-semibold">{step.title}</h2>
        <div className="mt-4 space-y-4">
          {step.key === "personal" && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <Select label="Title" value={data.title} onChange={(v) => set("title", v)} options={TITLES} />
                <Text label="Reference number" value={data.ref_number} onChange={(v) => set("ref_number", v)} />
              </div>
              <div className="grid grid-cols-3 gap-4">
                <Text label="First name" value={data.first_name} onChange={(v) => set("first_name", v)} />
                <Text label="Middle name" value={data.middle_name} onChange={(v) => set("middle_name", v)} />
                <Text label="Last name" value={data.last_name} onChange={(v) => set("last_name", v)} />
              </div>
              <Text label="Names previously known as" value={data.previously_known_as} onChange={(v) => set("previously_known_as", v)} />
              <Text label="Alias / other names known by" value={data.other_names} onChange={(v) => set("other_names", v)} />
              <div className="grid grid-cols-2 gap-4">
                <DateField label="Date of birth" value={data.date_of_birth} onChange={(v) => set("date_of_birth", v)} />
                <Select label="Gender" value={data.gender} onChange={(v) => set("gender", v)} options={GENDERS} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Text label="Phone number" value={data.phone} onChange={(v) => set("phone", v)} />
                <Text label="Mobile number" value={data.mobile} onChange={(v) => set("mobile", v)} />
              </div>
            </>
          )}

          {step.key === "emergency" && (
            <>
              <p className="text-xs text-slate-500">
                Who we should contact in an emergency.
              </p>
              <div className="grid grid-cols-2 gap-4">
                <Text label="Name" value={data.nok_name} onChange={(v) => set("nok_name", v)} />
                <Text label="Relationship to you" value={data.nok_relationship} onChange={(v) => set("nok_relationship", v)} />
              </div>
              <Text label="Telephone number" value={data.nok_phone} onChange={(v) => set("nok_phone", v)} />
              <Text label="Address" value={data.nok_address} onChange={(v) => set("nok_address", v)} />
            </>
          )}

          {step.key === "home" && (
            <AddressFields
              prefix="home"
              value={data}
              onChange={(k, v) => set(k, v)}
            />
          )}

          {step.key === "postal" && (
            <>
              <YesNo
                label="Postal address is the same as home address"
                value={data.postal_same_as_home ? "yes" : "no"}
                onChange={(v) => set("postal_same_as_home", v === "yes")}
              />
              {!data.postal_same_as_home && (
                <AddressFields
                  prefix="postal"
                  value={data}
                  onChange={(k, v) => set(k, v)}
                />
              )}
            </>
          )}

          {step.key === "position" && (
            <>
              <Select
                label="Position - NQAITS Worker Register"
                hint="The regulatory position category recorded on the national Worker Register. This is separate from your job role and your access level in the portal."
                value={data.nqaits_position}
                onChange={(v) => set("nqaits_position", v)}
                options={NQAITS_POSITIONS}
              />
              {data.nqaits_position === "Non-Educator Staff" && (
                <Select label="Non-educator role" value={data.non_educator_role} onChange={(v) => set("non_educator_role", v)} options={NON_EDUCATOR_ROLES} />
              )}
              <div className="grid grid-cols-2 gap-4">
                <DateField label="Start date" value={data.start_date} onChange={(v) => set("start_date", v)} />
                <Select
                  label="Nature of employment"
                  hint="Direct: you are employed by Ready Set Go. Indirect: you are employed by an outside organisation, such as an agency, and placed here."
                  value={data.employment_nature}
                  onChange={(v) => set("employment_nature", v)}
                  options={EMPLOYMENT_NATURES}
                />
              </div>
            </>
          )}

          {step.key === "uniform" && (
            <>
              <p className="text-xs text-slate-500">
                Uniform sizes. Ladies or men&apos;s sizing is available, note
                whichever you want.
              </p>
              <div className="grid grid-cols-3 gap-4">
                <Text label="Hoodie" value={data.uniform_hoodie} onChange={(v) => set("uniform_hoodie", v)} />
                <Text label="Polo" value={data.uniform_polo} onChange={(v) => set("uniform_polo", v)} />
                <Text label="Vest" value={data.uniform_vest} onChange={(v) => set("uniform_vest", v)} />
              </div>
              <div className="text-sm">
                <span className="font-medium text-slate-700">
                  Which days are you available to work?
                </span>
                <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
                  {WEEK_DAYS.map((day) => (
                    <label key={day} className="flex items-center gap-1.5">
                      <input
                        type="checkbox"
                        checked={data.available_days.includes(day)}
                        onChange={(e) =>
                          set(
                            "available_days",
                            e.target.checked
                              ? [...data.available_days, day]
                              : data.available_days.filter((d) => d !== day),
                          )
                        }
                      />
                      {day}
                    </label>
                  ))}
                </div>
              </div>
              <Text
                label="Ideal hours per week"
                value={data.ideal_weekly_hours}
                onChange={(v) => set("ideal_weekly_hours", v)}
              />
              <label className="block text-sm">
                <span className="font-medium text-slate-700">
                  Anything else about your availability?
                </span>
                <textarea
                  value={data.availability_notes}
                  onChange={(e) => set("availability_notes", e.target.value)}
                  rows={3}
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                  placeholder="Relief availability, days you are not available, other commitments, planned leave"
                />
              </label>
            </>
          )}

          {step.key === "eligibility" && (
            <>
              <div className="text-sm">
                <span className="font-medium text-slate-700">
                  What is your eligibility to work in Australia?
                </span>
                <div className="mt-1 flex flex-col gap-1">
                  {WORK_ELIGIBILITY_OPTIONS.map((opt) => (
                    <label key={opt.value} className="flex items-center gap-1.5">
                      <input
                        type="radio"
                        checked={data.work_eligibility === opt.value}
                        onChange={() => set("work_eligibility", opt.value)}
                      />
                      {opt.label}
                    </label>
                  ))}
                </div>
              </div>
              {data.work_eligibility === "visa" && (
                <div className="grid grid-cols-2 gap-4">
                  <Text
                    label="Visa number"
                    value={data.visa_number}
                    onChange={(v) => set("visa_number", v)}
                  />
                  <DateField
                    label="Visa expiry date"
                    value={data.visa_expiry}
                    onChange={(v) => set("visa_expiry", v)}
                  />
                </div>
              )}
              <p className="text-xs text-slate-500">
                You can upload a copy of your visa or photo ID under &ldquo;Your
                documents&rdquo; once your details are saved. A leader will sight
                the originals with you.
              </p>
            </>
          )}

          {step.key === "wwcc" && (
            <>
              <YesNo label="Do you have a Working with Children Check exemption?" value={data.wwcc_exempt} onChange={(v) => set("wwcc_exempt", v as OnboardingPayload["wwcc_exempt"])} />
              {data.wwcc_exempt === "yes" ? (
                <Text label="Reason for exemption" value={data.wwcc_exemption_reason} onChange={(v) => set("wwcc_exemption_reason", v)} />
              ) : (
                <>
                  {wwccLocked && <LockedCheckPanel kind="Working with Children Check" locked={wwccLocked} />}
                  {wwccLocked && (
                    <p className="text-sm font-medium text-slate-700">
                      Enter a renewed or replacement check
                    </p>
                  )}
                  <Text label="Check number" value={data.wwcc_check_number} onChange={(v) => set("wwcc_check_number", v)} />
                  <div className="grid grid-cols-2 gap-4">
                    <DateField label="Check expiry date" value={data.wwcc_expiry_date} onChange={(v) => set("wwcc_expiry_date", v)} />
                    <Select label="State or territory of issue" value={data.wwcc_state_of_issue} onChange={(v) => set("wwcc_state_of_issue", v)} options={AU_STATES} />
                  </div>
                </>
              )}
            </>
          )}

          {step.key === "teacher" && (
            <>
              {teacherLocked && <LockedCheckPanel kind="teacher registration" locked={teacherLocked} />}
              {teacherLocked && (
                <p className="text-sm font-medium text-slate-700">
                  Enter a renewed or replacement check
                </p>
              )}
              <Text label="Check number" value={data.teacher_check_number} onChange={(v) => set("teacher_check_number", v)} />
              <div className="grid grid-cols-2 gap-4">
                <DateField label="Check expiry date" value={data.teacher_expiry_date} onChange={(v) => set("teacher_expiry_date", v)} />
                <Select label="State or territory of issue" value={data.teacher_state_of_issue} onChange={(v) => set("teacher_state_of_issue", v)} options={AU_STATES} />
              </div>
            </>
          )}

          {step.key === "qualifications" && (
            <>
              <YesNo
                label="I have no relevant qualifications or training"
                value={data.has_no_qualifications ? "yes" : "no"}
                onChange={(v) => set("has_no_qualifications", v === "yes")}
              />
              {!data.has_no_qualifications && (
                <>
                  <Select label="Qualification type" value={data.qualification_type} onChange={(v) => set("qualification_type", v)} options={QUALIFICATION_TYPES} />
                  <div className="grid grid-cols-2 gap-4">
                    <Text label="Registered Training Organisation" value={data.qualification_rto_name} onChange={(v) => set("qualification_rto_name", v)} />
                    <Text label="RTO number" value={data.qualification_rto_number} onChange={(v) => set("qualification_rto_number", v)} />
                  </div>
                  <Text label="Course code" value={data.qualification_course_code} onChange={(v) => set("qualification_course_code", v)} />
                  <YesNo label="I am working towards this qualification" value={data.qualification_working_towards} onChange={(v) => set("qualification_working_towards", v as OnboardingPayload["qualification_working_towards"])} />
                  <div className="grid grid-cols-2 gap-4">
                    <DateField label="Date attained" value={data.qualification_date_attained} onChange={(v) => set("qualification_date_attained", v)} />
                    <DateField label="Date commenced" value={data.qualification_date_commenced} onChange={(v) => set("qualification_date_commenced", v)} />
                  </div>
                </>
              )}
            </>
          )}

          {step.key === "training" && (
            <>
              <p className="text-xs text-slate-500">
                Fill in the training you have completed. Leave a section blank if
                it does not apply.
              </p>
              {[...CORE_TRAINING_TYPES, "Other"].map((type) => (
                <fieldset key={type} className="rounded-md border border-slate-200 p-3">
                  <legend className="px-1 text-sm font-medium">{type}</legend>
                  {type === "Other" && (
                    <Text
                      label="What was the training?"
                      value={data.training[type]?.other_description ?? ""}
                      onChange={(v) => setTraining(type, "other_description", v)}
                    />
                  )}
                  <div className="grid grid-cols-2 gap-3">
                    <Text label="RTO" value={data.training[type]?.rto_name ?? ""} onChange={(v) => setTraining(type, "rto_name", v)} />
                    <Text label="RTO number" value={data.training[type]?.rto_number ?? ""} onChange={(v) => setTraining(type, "rto_number", v)} />
                  </div>
                  <Text label="Course code" value={data.training[type]?.course_code ?? ""} onChange={(v) => setTraining(type, "course_code", v)} />
                  <div className="grid grid-cols-2 gap-3">
                    <DateField label="Date attained" value={data.training[type]?.date_attained ?? ""} onChange={(v) => setTraining(type, "date_attained", v)} />
                    <DateField label="Expiry date" value={data.training[type]?.expiry_date ?? ""} onChange={(v) => setTraining(type, "expiry_date", v)} />
                  </div>
                </fieldset>
              ))}
            </>
          )}

          {step.key === "payroll" && (
            <>
              <p className="text-xs text-slate-500">
                Only an administrator and the person you nominate for payroll can
                see this. Your manager cannot.
              </p>
              <Text label="Tax File Number" value={data.tfn} onChange={(v) => set("tfn", v)} />
              <YesNo label="Do you wish to claim the tax free threshold?" value={data.claims_tax_free_threshold} onChange={(v) => set("claims_tax_free_threshold", v as OnboardingPayload["claims_tax_free_threshold"])} />
              <YesNo label="Do you have a HELP, SSL or TSL debt?" value={data.has_help_ssl_tsl_debt} onChange={(v) => set("has_help_ssl_tsl_debt", v as OnboardingPayload["has_help_ssl_tsl_debt"])} />
              <YesNo label="Do you have a Financial Supplement debt?" value={data.has_financial_supplement_debt} onChange={(v) => set("has_financial_supplement_debt", v as OnboardingPayload["has_financial_supplement_debt"])} />
              <div className="grid grid-cols-2 gap-4">
                <Text label="Superannuation fund" value={data.super_fund_name} onChange={(v) => set("super_fund_name", v)} />
                <Text label="Member number" value={data.super_member_number} onChange={(v) => set("super_member_number", v)} />
              </div>
              <div className="grid grid-cols-3 gap-4">
                <Text label="BSB" value={data.bank_bsb} onChange={(v) => set("bank_bsb", v)} />
                <Text label="Account number" value={data.bank_account_number} onChange={(v) => set("bank_account_number", v)} />
                <Text label="Account name" value={data.bank_account_name} onChange={(v) => set("bank_account_name", v)} />
              </div>
            </>
          )}

          {step.key === "screening" && (
            <>
              <p className="text-xs text-slate-500">
                Only an administrator and the person you nominate for HR can see
                these answers. Your manager cannot.
              </p>
              <YesNo
                label="Have you ever been the subject of a child protection investigation, finding or disciplinary action relating to children?"
                value={data.screening_child_protection}
                onChange={(v) =>
                  set(
                    "screening_child_protection",
                    v as OnboardingPayload["screening_child_protection"],
                  )
                }
              />
              {data.screening_child_protection === "yes" && (
                <label className="block text-sm">
                  <span className="font-medium text-slate-700">
                    Please give details
                  </span>
                  <textarea
                    value={data.screening_child_protection_detail}
                    onChange={(e) =>
                      set("screening_child_protection_detail", e.target.value)
                    }
                    rows={3}
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                  />
                </label>
              )}
              <YesNo
                label="Do you have any current or historical criminal charges, convictions or findings relating to children or persons under 18?"
                value={data.screening_criminal}
                onChange={(v) =>
                  set(
                    "screening_criminal",
                    v as OnboardingPayload["screening_criminal"],
                  )
                }
              />
              {data.screening_criminal === "yes" && (
                <label className="block text-sm">
                  <span className="font-medium text-slate-700">
                    Please give details
                  </span>
                  <textarea
                    value={data.screening_criminal_detail}
                    onChange={(e) =>
                      set("screening_criminal_detail", e.target.value)
                    }
                    rows={3}
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                  />
                </label>
              )}
            </>
          )}

          {step.key === "referees" && (
            <>
              <p className="text-xs text-slate-500">
                Two referees, ideally current or recent direct supervisors, at
                least one from an early childhood or child-related setting.
              </p>
              {[0, 1].map((i) => (
                <fieldset
                  key={i}
                  className="rounded-md border border-slate-200 p-3"
                >
                  <legend className="px-1 text-sm font-medium">
                    Referee {i + 1}
                  </legend>
                  <div className="grid grid-cols-2 gap-3">
                    <Text label="Name" value={data.referees[i]?.name ?? ""} onChange={(v) => setReferee(i, "name", v)} />
                    <Text label="Organisation" value={data.referees[i]?.organisation ?? ""} onChange={(v) => setReferee(i, "organisation", v)} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <Text label="Job title" value={data.referees[i]?.job_title ?? ""} onChange={(v) => setReferee(i, "job_title", v)} />
                    <Text label="Relationship to you" value={data.referees[i]?.relationship ?? ""} onChange={(v) => setReferee(i, "relationship", v)} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <Text label="Phone" value={data.referees[i]?.phone ?? ""} onChange={(v) => setReferee(i, "phone", v)} />
                    <Text label="Email" value={data.referees[i]?.email ?? ""} onChange={(v) => setReferee(i, "email", v)} />
                  </div>
                </fieldset>
              ))}
            </>
          )}
        </div>

        {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

        <div className="mt-6 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => jumpTo(Math.max(0, stepIndex - 1))}
            disabled={stepIndex === 0 || saving || submitting}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-600 disabled:opacity-40"
          >
            Back
          </button>

          <div className="flex items-center gap-3">
            {justSaved && (
              <span className="text-xs font-medium text-green-700">Saved</span>
            )}

            {completed ? (
              <>
                {!isLast && (
                  <button
                    type="button"
                    onClick={() => jumpTo(stepIndex + 1)}
                    disabled={saving}
                    className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-600 disabled:opacity-40"
                  >
                    Next
                  </button>
                )}
                <button
                  type="button"
                  onClick={persist}
                  disabled={saving}
                  className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:bg-slate-300"
                >
                  {saving ? "Saving…" : "Save"}
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={next}
                disabled={saving || submitting}
                className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:bg-slate-300"
              >
                {submitting
                  ? "Submitting…"
                  : saving
                    ? "Saving…"
                    : isLast
                      ? "Submit"
                      : "Save and continue"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function LockedCheckPanel({
  kind,
  locked,
}: {
  kind: string;
  locked: LockedCheck;
}) {
  const sighted = locked.sighted_at
    ? new Date(locked.sighted_at).toLocaleDateString("en-AU", { dateStyle: "medium" })
    : null;
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm">
      <p className="font-medium text-slate-700">Sighted {kind}</p>
      <dl className="mt-1.5 grid grid-cols-2 gap-x-6 gap-y-0.5 text-slate-600">
        <dt className="text-slate-500">Check number</dt>
        <dd>{locked.check_number || "—"}</dd>
        <dt className="text-slate-500">Expiry</dt>
        <dd>
          {locked.expiry_date
            ? new Date(locked.expiry_date).toLocaleDateString("en-AU", { dateStyle: "medium" })
            : "—"}
        </dd>
        <dt className="text-slate-500">State of issue</dt>
        <dd>{locked.state_of_issue || "—"}</dd>
      </dl>
      <p className="mt-2 text-xs text-slate-500">
        {sighted
          ? `A leader sighted this check on ${sighted}${locked.sighted_by ? ` (${locked.sighted_by})` : ""}.`
          : "A leader has sighted this check."}{" "}
        It stays on your record as it was sighted and cannot be changed here. If
        the check has been renewed or reissued, enter the new details below and a
        leader will sight them with you.
      </p>
    </div>
  );
}

function AddressFields({
  prefix,
  value,
  onChange,
}: {
  prefix: "home" | "postal";
  value: OnboardingPayload;
  onChange: (key: FieldKey, v: string) => void;
}) {
  const k = (suffix: string) => `${prefix}_${suffix}` as FieldKey;
  return (
    <>
      <Text label="Address line 1" value={value[k("line1")] as string} onChange={(v) => onChange(k("line1"), v)} />
      <Text label="Address line 2" value={value[k("line2")] as string} onChange={(v) => onChange(k("line2"), v)} />
      <div className="grid grid-cols-3 gap-4">
        <Text label="Suburb / town" value={value[k("suburb")] as string} onChange={(v) => onChange(k("suburb"), v)} />
        <Select label="State" value={value[k("state")] as string} onChange={(v) => onChange(k("state"), v)} options={AU_STATES} />
        <Text label="Post code" value={value[k("postcode")] as string} onChange={(v) => onChange(k("postcode"), v)} />
      </div>
    </>
  );
}

function Text({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block text-sm">
      <span className="font-medium text-slate-700">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
      />
    </label>
  );
}

function DateField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block text-sm">
      <span className="font-medium text-slate-700">{label}</span>
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
      />
    </label>
  );
}

function Select({
  label,
  hint,
  value,
  onChange,
  options,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
  options: readonly string[];
}) {
  return (
    <label className="block text-sm">
      <span className="font-medium text-slate-700">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
      >
        <option value="">Select…</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </label>
  );
}

function YesNo({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="text-sm">
      <span className="font-medium text-slate-700">{label}</span>
      <div className="mt-1 flex gap-4">
        {["yes", "no"].map((opt) => (
          <label key={opt} className="flex items-center gap-1.5">
            <input
              type="radio"
              checked={value === opt}
              onChange={() => onChange(opt)}
            />
            <span className="capitalize">{opt}</span>
          </label>
        ))}
      </div>
    </div>
  );
}
