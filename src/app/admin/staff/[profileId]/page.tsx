import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  requireStaffAccess,
  isHrManager,
  isAdmin,
  TIER_LABELS,
} from "@/lib/auth";
import { ASSIGNABLE_TIERS } from "@/lib/roles";
import {
  AccessTierControl,
  ActiveControl,
  DeleteAccountControl,
  EmailControl,
  HrManagerToggle,
  JobRoleControl,
  NameControl,
  PasswordResetControl,
  ProbationControl,
  RefereeCheckControl,
  SightingControl,
} from "./record-controls";
import { ContractPanel } from "./contract-panel";
import { IdentityPanel, type IdentityDoc } from "./identity-panel";
import { classifyPersonCredentials } from "@/lib/credentials";
import {
  type ContractRow,
  activeContract,
  renewalState,
} from "@/lib/contracts";
import { agreementsForProfile } from "@/lib/agreements";
import { assignedJobRoles, sopSuiteIdsForRoles } from "@/lib/staff-job-roles";

export const dynamic = "force-dynamic";

const WORK_ELIGIBILITY_LABEL = {
  citizen: "Australian citizen",
  permanent_resident: "Permanent resident",
  visa: "Visa",
  other: "Other",
} as const;

function fmtDate(v: string | null | undefined) {
  if (!v) return "—";
  return new Date(v).toLocaleDateString("en-AU", { dateStyle: "medium" });
}

function ynLabel(v: boolean | null | undefined) {
  return v === true ? "Yes" : v === false ? "No" : "—";
}

function maskTfn(v: string | null | undefined) {
  if (!v) return "—";
  const digits = v.replace(/\D/g, "");
  if (digits.length < 3) return "•••";
  return `••• ••• ${digits.slice(-3)}`;
}

export default async function StaffRecordPage({
  params,
}: {
  params: { profileId: string };
}) {
  const me = await requireStaffAccess();
  const supabase = createClient();

  const [
    { data: person },
    { data: wd },
    { data: wwcc },
    { data: teacher },
    { data: quals },
    { data: training },
    { data: services },
    { data: jobRoles },
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, full_name, email, access_tier, hr_manager, service_id, job_role_id, is_active")
      .eq("id", params.profileId)
      .maybeSingle(),
    supabase.from("worker_details").select("*").eq("profile_id", params.profileId).maybeSingle(),
    supabase
      .from("wwcc_checks")
      .select("*")
      .eq("profile_id", params.profileId)
      .order("created_at", { ascending: false }),
    supabase
      .from("teacher_registrations")
      .select("*")
      .eq("profile_id", params.profileId)
      .order("created_at", { ascending: false }),
    supabase.from("qualifications").select("*").eq("profile_id", params.profileId),
    supabase.from("training_records").select("*").eq("profile_id", params.profileId),
    supabase.from("services").select("id, name"),
    supabase.from("job_roles").select("id, name"),
  ]);

  if (!person) notFound();

  const personRoles = await assignedJobRoles(supabase, person.id);
  const personRoleIds = personRoles.map((r) => r.id);

  const [{ data: contractRows }, { data: identityRows }] = await Promise.all([
    supabase
      .from("contracts")
      .select(
        "id, profile_id, start_date, period_type, duration_months, expiry_date, document_id, notes, superseded_at, signed_at, signed_name, signed_by, signed_content_hash, is_deed, countersigned_at, countersigned_name, countersigned_by, countersigned_content_hash, created_at",
      )
      .eq("profile_id", params.profileId)
      .order("created_at", { ascending: false }),
    supabase
      .from("identity_documents")
      .select("id, kind, label, document_id, sighted_at, sighted_by")
      .eq("profile_id", params.profileId)
      .order("created_at", { ascending: false }),
  ]);
  const identityDocs = (identityRows ?? []) as IdentityDoc[];
  const contracts = (contractRows ?? []) as ContractRow[];
  const contract = activeContract(contracts);
  const contractRenewal = renewalState(contract);

  const agreements = await agreementsForProfile(supabase, {
    id: person.id,
    jobRoleIds: personRoleIds,
  });
  const unsignedAgreements = agreements
    .filter((a) => !a.signed)
    .map((a) => a.name);
  const serviceName = new Map((services ?? []).map((s) => [s.id, s.name]));
  const hrManager = isHrManager(me);
  // Contract upload: Admin anywhere, or an HR manager for staff at their service.
  const canManageContract =
    hrManager &&
    (isAdmin(me.access_tier) || me.service_id === person.service_id);
  // Payroll, screening and referees: Admin anywhere, or an HR manager at the
  // person's service. Not the manager tiers.
  const canSeeSensitive =
    isAdmin(me.access_tier) ||
    (me.hr_manager && me.service_id === person.service_id);

  const [{ data: payroll }, { data: screening }, { data: referees }] =
    canSeeSensitive
      ? await Promise.all([
          supabase
            .from("worker_payroll")
            .select("*")
            .eq("profile_id", params.profileId)
            .maybeSingle(),
          supabase
            .from("worker_screening")
            .select("*")
            .eq("profile_id", params.profileId)
            .maybeSingle(),
          supabase
            .from("worker_referees")
            .select("*")
            .eq("profile_id", params.profileId)
            .order("slot"),
        ])
      : [{ data: null }, { data: null }, { data: null }];

  // Onboarding documents this person has entered that a leader has not sighted.
  const pendingSightings = [wwcc, teacher, quals, training, identityRows].reduce(
    (n, list) => n + (list ?? []).filter((r) => !r.sighted_at).length,
    0,
  );
  const showSignOffPrompt = person.id !== me.id && pendingSightings > 0;

  // SOP sign-off progress: the published SOPs in this person's job-role suite,
  // and how many they have fully signed (a self_and_manager SOP counts only
  // once a manager has countersigned).
  let sopTotal = 0;
  let sopSigned = 0;
  // The specific published SOPs this person has not yet fully signed, split
  // into "not started" and "signed, waiting on a manager to countersign".
  const unsignedSops: string[] = [];
  const awaitingCosignSops: string[] = [];
  if (personRoleIds.length > 0) {
    const suiteIds = await sopSuiteIdsForRoles(supabase, personRoleIds);
    if (suiteIds.length > 0) {
      const [{ data: sopRows }, { data: signRows }] = await Promise.all([
        supabase
          .from("sops")
          .select("id, name, published_version, signoff_type")
          .in("id", suiteIds)
          .not("published_version", "is", null),
        supabase
          .from("sign_offs")
          .select("sop_id, sop_version, verified_at")
          .eq("user_id", person.id),
      ]);
      const signOf = new Map(
        (signRows ?? []).map((s) => [
          `${s.sop_id}:${s.sop_version}`,
          Boolean(s.verified_at),
        ]),
      );
      const published = sopRows ?? [];
      sopTotal = published.length;
      for (const s of published) {
        const verified = signOf.get(`${s.id}:${s.published_version}`);
        const needsManager = s.signoff_type === "self_and_manager";
        if (verified === undefined) {
          unsignedSops.push(s.name as string);
        } else if (needsManager && !verified) {
          awaitingCosignSops.push(s.name as string);
        } else {
          sopSigned += 1;
        }
      }
    }
  }

  // Policy view progress: the published policies that target this person, and
  // how many they have opened at the current published version.
  const [{ data: targetPolicies }, { data: policyViewRows }] = await Promise.all([
    supabase.rpc("visible_published_policies", { p_profile: person.id }),
    supabase
      .from("policy_views")
      .select("policy_id, policy_version")
      .eq("user_id", person.id),
  ]);
  const policyTotal = (targetPolicies ?? []).length;
  const viewedSet = new Set(
    (policyViewRows ?? []).map((v) => `${v.policy_id}:${v.policy_version}`),
  );
  const targetPolicyRows = (targetPolicies ?? []) as {
    id: string;
    published_version: number;
    name: string;
    document_type: string;
  }[];
  const policyViewed = targetPolicyRows.filter((p) =>
    viewedSet.has(`${p.id}:${p.published_version}`),
  ).length;
  const unviewedPolicies = targetPolicyRows
    .filter((p) => !viewedSet.has(`${p.id}:${p.published_version}`))
    .map((p) => p.name);

  const documents: {
    label: string;
    table: "wwcc_checks" | "teacher_registrations" | "qualifications" | "training_records";
    rows: { id: string; lines: [string, string][]; sighted_at: string | null; sighted_by: string | null; note?: string }[];
  }[] = [
    {
      label: "Working with Children Check",
      table: "wwcc_checks",
      rows: (wwcc ?? []).map((r, i) => ({
        id: r.id,
        sighted_at: r.sighted_at,
        sighted_by: r.sighted_by,
        note: i > 0 ? "Superseded by a newer check, kept for the record" : undefined,
        lines: [
          ["Check number", r.check_number ?? "—"],
          ["Expiry", fmtDate(r.expiry_date)],
          ["State of issue", r.state_of_issue ?? "—"],
        ],
      })),
    },
    {
      label: "Teacher registration",
      table: "teacher_registrations",
      rows: (teacher ?? []).map((r, i) => ({
        id: r.id,
        sighted_at: r.sighted_at,
        sighted_by: r.sighted_by,
        note: i > 0 ? "Superseded by a newer check, kept for the record" : undefined,
        lines: [
          ["Check number", r.check_number ?? "—"],
          ["Expiry", fmtDate(r.expiry_date)],
          ["State of issue", r.state_of_issue ?? "—"],
        ],
      })),
    },
    {
      label: "Qualification",
      table: "qualifications",
      rows: (quals ?? []).map((r) => ({
        id: r.id,
        sighted_at: r.sighted_at,
        sighted_by: r.sighted_by,
        lines: [
          ["Type", r.qualification_type ?? "—"],
          ["RTO", r.rto_name ?? "—"],
          ["RTO number", r.rto_number ?? "—"],
          ["Course code", r.course_code ?? "—"],
          ["Working towards", r.working_towards ? "Yes" : "No"],
          ["Date attained", fmtDate(r.date_attained)],
        ],
      })),
    },
    {
      label: "Training",
      table: "training_records",
      rows: (training ?? [])
        .slice()
        .sort((a, b) => String(a.training_type).localeCompare(String(b.training_type)))
        .map((r) => ({
          id: r.id,
          sighted_at: r.sighted_at,
          sighted_by: r.sighted_by,
          lines: [
            ["Training", r.training_type + (r.other_description ? ` (${r.other_description})` : "")],
            ["RTO", r.rto_name ?? "—"],
            ["Course code", r.course_code ?? "—"],
            ["Date attained", fmtDate(r.date_attained)],
            ["Expiry", fmtDate(r.expiry_date)],
          ],
        })),
    },
  ];

  const anyDocs = documents.some((d) => d.rows.length > 0);

  // Onboarding documents the person has entered that a leader has not sighted.
  const unsightedDocs = [
    ...documents.flatMap((d) =>
      d.rows
        .filter((r) => !r.sighted_at)
        .map((r) => ({
          label: d.label,
          detail: r.lines.find(([, v]) => v && v !== "—")?.[1] ?? "",
        })),
    ),
    ...identityDocs
      .filter((d) => !d.sighted_at)
      .map((d) => ({
        label:
          d.kind === "photo_id"
            ? "Photo ID"
            : d.kind === "visa"
              ? "Visa document"
              : "Identity document",
        detail: d.label ?? "",
      })),
  ];

  // A worker (anyone with a job role) who has not finished the onboarding
  // questionnaire. This matches the count shown against them on the staff list.
  const onboardingOutstanding = Boolean(
    personRoleIds.length > 0 && !wd?.onboarding_completed_at,
  );

  // Expired or soon-to-expire credentials (WWCC, teacher registration,
  // training), latest record of each kind only.
  const credentialAlerts = classifyPersonCredentials({
    wwcc: (wwcc ?? []) as { expiry_date: string | null }[],
    teacher: (teacher ?? []) as { expiry_date: string | null }[],
    training: (training ?? []) as {
      training_type: string;
      other_description: string | null;
      expiry_date: string | null;
    }[],
    visaExpiry: wd?.visa_expiry ?? null,
  });
  const credentialItems = credentialAlerts.map((a) => {
    const when =
      a.daysLeft < 0
        ? `expired ${Math.abs(a.daysLeft)} ${Math.abs(a.daysLeft) === 1 ? "day" : "days"} ago`
        : a.daysLeft === 0
          ? "expires today"
          : `expires in ${a.daysLeft} ${a.daysLeft === 1 ? "day" : "days"}`;
    return `${a.label} — ${fmtDate(a.expiryDate)} (${when})`;
  });
  const visaAlertObj = credentialAlerts.find((a) => a.kind === "Working rights");
  const visaAlert = visaAlertObj
    ? visaAlertObj.daysLeft < 0
      ? `expired ${Math.abs(visaAlertObj.daysLeft)} days ago`
      : `expires in ${visaAlertObj.daysLeft} days`
    : null;

  const contractItems: string[] = [];
  if (contractRenewal.bucket === "expired") {
    contractItems.push(
      `Contract expired ${fmtDate(contract?.expiry_date)} — needs renewing`,
    );
  } else if (contractRenewal.bucket === "due") {
    contractItems.push(
      `Contract expires ${fmtDate(contract?.expiry_date)} (${contractRenewal.daysLeft} days) — due for renewal`,
    );
  }
  if (contract && !contract.signed_at && !contract.is_deed) {
    contractItems.push("Contract not signed by the staff member");
  }

  const unsightedDocLabels = unsightedDocs.map((d) =>
    d.detail ? `${d.label} — ${d.detail}` : d.label,
  );

  // Every flag this person carries. The same primitives that staffStatsByProfile
  // counts for the staff-list "Outstanding" figure (same 60-day credential and
  // 28-day contract windows), so this total matches that row.
  const outstandingCount =
    (onboardingOutstanding ? 1 : 0) +
    unsignedSops.length +
    awaitingCosignSops.length +
    unviewedPolicies.length +
    unsightedDocs.length +
    credentialItems.length +
    contractItems.length +
    unsignedAgreements.length;

  // Most recent password reset for this person, for the audit line.
  const { data: lastResetRow } = await supabase
    .from("password_reset_requests")
    .select("created_at, source")
    .eq("target_profile_id", person.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const lastReset = lastResetRow
    ? {
        at: lastResetRow.created_at as string,
        source: lastResetRow.source as "self" | "admin",
      }
    : null;

  return (
    <div>
      <Link href="/admin/staff" className="text-sm text-slate-500 hover:text-slate-900">
        ← Staff
      </Link>

      <h1 className="mt-3 text-xl font-semibold">{person.full_name}</h1>
      <p className="mt-1 text-sm text-slate-500">
        {person.email} · {TIER_LABELS[person.access_tier as keyof typeof TIER_LABELS]}
        {" · "}
        {personRoles.length > 0
          ? personRoles.map((r) => r.name).join(", ")
          : "no job role"}
        {" · "}
        {person.service_id ? serviceName.get(person.service_id) : "all services"}
        {!person.is_active && " · inactive"}
      </p>

      {/* The first thing a leader sees: everything still owing for this person. */}
      <section className="mt-4">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Outstanding items{outstandingCount > 0 ? ` (${outstandingCount})` : ""}
        </h2>
        <div className="mt-2 rounded-lg border border-slate-200 bg-white p-4">
          {outstandingCount === 0 ? (
            <p className="text-sm text-slate-500">
              Nothing outstanding. Everything expected of this person is signed,
              read and sighted.
            </p>
          ) : (
            <div className="space-y-4">
              <OutstandingGroup
                title="Onboarding questionnaire"
                items={onboardingOutstanding ? ["Not completed"] : []}
              />
              <OutstandingGroup title="Procedures not signed" items={unsignedSops} />
              <OutstandingGroup
                title="Procedures waiting on a manager countersignature"
                items={awaitingCosignSops}
              />
              <OutstandingGroup
                title="Policies not read"
                items={unviewedPolicies}
              />
              <OutstandingGroup
                title="Agreements not signed"
                items={unsignedAgreements}
              />
              <OutstandingGroup title="Contract" items={contractItems} />
              <OutstandingGroup
                title="Credentials expired or expiring"
                items={credentialItems}
              />
              <OutstandingGroup
                title="Documents a leader has not sighted"
                items={unsightedDocLabels}
              />
            </div>
          )}
        </div>
      </section>

      {showSignOffPrompt && (
        <div className="mt-4 flex items-center justify-between gap-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <span>
            Staff sign-off: {person.full_name} has {pendingSightings}{" "}
            {pendingSightings === 1 ? "document" : "documents"} entered that a
            leader still needs to sight.
          </span>
          <Link
            href="/admin/verification"
            className="shrink-0 rounded-md bg-amber-900 px-2.5 py-1 text-xs font-medium text-white"
          >
            Go to verification
          </Link>
        </div>
      )}

      {(isAdmin(me.access_tier) ||
        (hrManager && me.service_id === person.service_id)) && (
        <section className="mt-4 space-y-4 rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Role and access
          </h2>
          <NameControl profileId={person.id} value={person.full_name} />
          <EmailControl profileId={person.id} value={person.email} />
          <JobRoleControl
            profileId={person.id}
            value={personRoleIds}
            jobRoles={(jobRoles ?? []) as { id: string; name: string }[]}
          />
          {isAdmin(me.access_tier) && person.id !== me.id && (
            <AccessTierControl
              profileId={person.id}
              value={person.access_tier}
              tiers={ASSIGNABLE_TIERS}
            />
          )}
          {isAdmin(me.access_tier) && (
            <HrManagerToggle profileId={person.id} value={person.hr_manager} />
          )}
          <PasswordResetControl
            profileId={person.id}
            email={person.email}
            lastReset={lastReset}
          />
          {person.id !== me.id && (
            <ActiveControl profileId={person.id} isActive={person.is_active} />
          )}
        </section>
      )}

      {isAdmin(me.access_tier) && person.id !== me.id && (
        <section className="mt-6">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Danger zone
          </h2>
          <div className="mt-2">
            <DeleteAccountControl profileId={person.id} />
          </div>
        </section>
      )}

      <section className="mt-6">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Training progress
        </h2>
        <div className="mt-2 space-y-4 rounded-lg border border-slate-200 bg-white p-4">
          <ProgressBar
            label="Procedures signed"
            done={sopSigned}
            total={sopTotal}
            emptyNote={
              personRoleIds.length > 0
                ? "This job role has no procedures attached yet."
                : "No job role set, so there are no procedures to sign."
            }
          />
          <ProgressBar
            label="Policies viewed"
            done={policyViewed}
            total={policyTotal}
            emptyNote="No published policies target this person yet."
          />
        </div>
      </section>

      <section className="mt-6">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Personal details
        </h2>
        {wd ? (
          <dl className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 rounded-lg border border-slate-200 bg-white p-4 text-sm">
            <Row k="Name">{[wd.title, wd.first_name, wd.middle_name, wd.last_name].filter(Boolean).join(" ") || "—"}</Row>
            <Row k="Date of birth">{fmtDate(wd.date_of_birth)}</Row>
            <Row k="Phone">{wd.phone ?? "—"}</Row>
            <Row k="Mobile">{wd.mobile ?? "—"}</Row>
            <Row k="Home address">
              {[wd.home_line1, wd.home_suburb, wd.home_state, wd.home_postcode].filter(Boolean).join(", ") || "—"}
            </Row>
            <Row k="Gender">{wd.gender ?? "—"}</Row>
            <Row k="Position (Worker Register)">{wd.nqaits_position ?? "—"}</Row>
            <Row k="Nature of employment">{wd.employment_nature ?? "—"}</Row>
            <Row k="Start date">{fmtDate(wd.start_date)}</Row>
            <Row k="WWCC exemption">{wd.wwcc_exempt ? `Yes — ${wd.wwcc_exemption_reason ?? ""}` : "No"}</Row>
            <Row k="Emergency contact">
              {wd.nok_name
                ? `${wd.nok_name}${wd.nok_relationship ? ` (${wd.nok_relationship})` : ""}${wd.nok_phone ? ` · ${wd.nok_phone}` : ""}`
                : "—"}
            </Row>
            <Row k="Uniform (hoodie / polo / vest)">
              {[wd.uniform_hoodie, wd.uniform_polo, wd.uniform_vest]
                .map((s) => s || "—")
                .join(" / ")}
            </Row>
            <Row k="Availability">
              {[
                wd.available_days?.length
                  ? (wd.available_days as string[]).join(", ")
                  : null,
                wd.ideal_weekly_hours != null
                  ? `${wd.ideal_weekly_hours} h/week ideal`
                  : null,
              ]
                .filter(Boolean)
                .join(" · ") || "—"}
            </Row>
            {wd.availability_notes && (
              <Row k="Availability notes">{wd.availability_notes}</Row>
            )}
          </dl>
        ) : (
          <p className="mt-2 text-sm text-slate-500">
            This person has not started their onboarding questionnaire.
          </p>
        )}
      </section>

      <section className="mt-6">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Probationary period
        </h2>
        <div className="mt-2 rounded-lg border border-slate-200 bg-white p-4">
          <ProbationControl
            profileId={person.id}
            onProbation={wd?.on_probation ?? null}
            startDate={wd?.probation_start_date ?? null}
            canEdit={hrManager}
          />
        </div>
      </section>

      <section className="mt-6">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Identity and working rights
        </h2>
        <div className="mt-2 rounded-lg border border-slate-200 bg-white p-4">
          <dl className="grid grid-cols-2 gap-x-6 gap-y-0.5 text-sm">
            <Row k="Work eligibility">
              {wd?.work_eligibility
                ? WORK_ELIGIBILITY_LABEL[
                    wd.work_eligibility as keyof typeof WORK_ELIGIBILITY_LABEL
                  ]
                : "—"}
            </Row>
            {wd?.work_eligibility === "visa" && (
              <>
                <Row k="Visa number">{wd?.visa_number ?? "—"}</Row>
                <Row k="Visa expiry">
                  {fmtDate(wd?.visa_expiry)}
                  {visaAlert && (
                    <span className="ml-2 text-amber-700">({visaAlert})</span>
                  )}
                </Row>
              </>
            )}
          </dl>
        </div>
        <IdentityPanel
          profileId={person.id}
          docs={identityDocs}
          canSight={hrManager}
        />
      </section>

      <section className="mt-6">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Contract
        </h2>
        <ContractPanel
          profileId={person.id}
          contracts={contracts}
          canManage={canManageContract}
        />
      </section>

      {canSeeSensitive && (
        <>
          <section className="mt-6">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Payroll
              <span className="ml-2 font-normal normal-case tracking-normal text-slate-400">
                Admin and HR manager only
              </span>
            </h2>
            <div className="mt-2 rounded-lg border border-slate-200 bg-white p-4">
              {payroll ? (
                <dl className="grid grid-cols-2 gap-x-6 gap-y-0.5 text-sm">
                  <Row k="Tax File Number">{maskTfn(payroll.tfn)}</Row>
                  <Row k="Claims tax free threshold">
                    {ynLabel(payroll.claims_tax_free_threshold)}
                  </Row>
                  <Row k="HELP / SSL / TSL debt">
                    {ynLabel(payroll.has_help_ssl_tsl_debt)}
                  </Row>
                  <Row k="Financial Supplement debt">
                    {ynLabel(payroll.has_financial_supplement_debt)}
                  </Row>
                  <Row k="Superannuation fund">
                    {payroll.super_fund_name ?? "—"}
                  </Row>
                  <Row k="Member number">
                    {payroll.super_member_number ?? "—"}
                  </Row>
                  <Row k="Bank BSB">{payroll.bank_bsb ?? "—"}</Row>
                  <Row k="Account number">
                    {payroll.bank_account_number ?? "—"}
                  </Row>
                  <Row k="Account name">{payroll.bank_account_name ?? "—"}</Row>
                </dl>
              ) : (
                <p className="text-sm text-slate-500">
                  Not completed by the staff member yet.
                </p>
              )}
            </div>
          </section>

          <section className="mt-6">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Screening declarations
              <span className="ml-2 font-normal normal-case tracking-normal text-slate-400">
                Admin and HR manager only
              </span>
            </h2>
            <div className="mt-2 rounded-lg border border-slate-200 bg-white p-4 text-sm">
              {screening && screening.answered_at ? (
                <div className="space-y-3">
                  <div>
                    <p className="text-slate-600">
                      {screening.child_protection_question}
                    </p>
                    <p className="mt-0.5 font-medium text-slate-800">
                      {ynLabel(screening.child_protection_history)}
                      {screening.child_protection_detail
                        ? ` — ${screening.child_protection_detail}`
                        : ""}
                    </p>
                  </div>
                  <div>
                    <p className="text-slate-600">
                      {screening.criminal_question}
                    </p>
                    <p className="mt-0.5 font-medium text-slate-800">
                      {ynLabel(screening.criminal_history)}
                      {screening.criminal_detail
                        ? ` — ${screening.criminal_detail}`
                        : ""}
                    </p>
                  </div>
                  <p className="text-xs text-slate-400">
                    Answered {fmtDate(screening.answered_at.slice(0, 10))}
                  </p>
                </div>
              ) : (
                <p className="text-slate-500">
                  Not completed by the staff member yet.
                </p>
              )}
            </div>
          </section>

          <section className="mt-6">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Referees
              <span className="ml-2 font-normal normal-case tracking-normal text-slate-400">
                Admin and HR manager only
              </span>
            </h2>
            <div className="mt-2 space-y-3">
              {(referees ?? []).length === 0 && (
                <p className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-500">
                  No referees entered yet.
                </p>
              )}
              {(referees ?? []).map((r) => (
                <div
                  key={r.id}
                  className="rounded-lg border border-slate-200 bg-white p-4"
                >
                  <div className="text-sm font-medium">
                    Referee {r.slot}: {r.name ?? "—"}
                  </div>
                  <dl className="mt-1 grid grid-cols-2 gap-x-6 gap-y-0.5 text-sm">
                    <Row k="Organisation">{r.organisation ?? "—"}</Row>
                    <Row k="Job title">{r.job_title ?? "—"}</Row>
                    <Row k="Relationship">{r.relationship ?? "—"}</Row>
                    <Row k="Phone">{r.phone ?? "—"}</Row>
                    <Row k="Email">{r.email ?? "—"}</Row>
                  </dl>
                  {r.check_completed_at ? (
                    <p className="mt-2 border-t border-slate-100 pt-2 text-xs text-green-700">
                      Reference check completed {fmtDate(r.check_completed_at)}
                      {r.check_completed_by ? ` by ${r.check_completed_by}` : ""}
                    </p>
                  ) : (
                    <RefereeCheckControl
                      refereeId={r.id}
                      completedAt={r.check_completed_at}
                      completedBy={r.check_completed_by}
                    />
                  )}
                </div>
              ))}
            </div>
          </section>
        </>
      )}

      <section className="mt-6">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Documents
        </h2>
        {!anyDocs && (
          <p className="mt-2 text-sm text-slate-500">No documents entered yet.</p>
        )}
        <div className="mt-2 space-y-3">
          {documents
            .filter((d) => d.rows.length > 0)
            .map((doc) =>
              doc.rows.map((row) => (
                <div key={row.id} className="rounded-lg border border-slate-200 bg-white p-4">
                  <div className="text-sm font-medium">{doc.label}</div>
                  {row.note && (
                    <div className="text-xs text-slate-400">{row.note}</div>
                  )}
                  <dl className="mt-1 grid grid-cols-2 gap-x-6 gap-y-0.5 text-sm">
                    {row.lines.map(([k, v]) => (
                      <Row key={k} k={k}>
                        {v}
                      </Row>
                    ))}
                  </dl>
                  <div className="mt-3 border-t border-slate-100 pt-3">
                    <SightingControl
                      table={doc.table}
                      recordId={row.id}
                      sightedAt={row.sighted_at}
                      sightedBy={row.sighted_by}
                      canVerify={hrManager}
                    />
                  </div>
                </div>
              )),
            )}
        </div>
      </section>
    </div>
  );
}

function ProgressBar({
  label,
  done,
  total,
  emptyNote,
}: {
  label: string;
  done: number;
  total: number;
  emptyNote: string;
}) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  return (
    <div>
      <div className="flex items-baseline justify-between text-sm">
        <span className="text-slate-700">{label}</span>
        {total > 0 ? (
          <span className="text-slate-500">
            {done} of {total} ({pct}%)
          </span>
        ) : (
          <span className="text-slate-400">{emptyNote}</span>
        )}
      </div>
      {total > 0 && (
        <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-full rounded-full bg-green-500"
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
    </div>
  );
}

function OutstandingGroup({
  title,
  items,
}: {
  title: string;
  items: string[];
}) {
  if (items.length === 0) return null;
  return (
    <div>
      <div className="flex items-baseline gap-2 text-sm">
        <span className="font-medium text-slate-700">{title}</span>
        <span className="text-slate-400">({items.length})</span>
      </div>
      <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-slate-600">
        {items.map((it, i) => (
          <li key={i}>{it}</li>
        ))}
      </ul>
    </div>
  );
}

function Row({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <>
      <dt className="text-slate-500">{k}</dt>
      <dd className="text-slate-800">{children}</dd>
    </>
  );
}
