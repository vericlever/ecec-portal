import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  requireStaffAccess,
  canVerify,
  isAdmin,
  TIER_LABELS,
} from "@/lib/auth";
import {
  HrVerifierToggle,
  ProbationControl,
  SightingControl,
} from "./record-controls";

export const dynamic = "force-dynamic";

function fmtDate(v: string | null | undefined) {
  if (!v) return "—";
  return new Date(v).toLocaleDateString("en-AU", { dateStyle: "medium" });
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
      .select("id, full_name, email, access_tier, hr_verifier, service_id, job_role_id, is_active")
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

  const serviceName = new Map((services ?? []).map((s) => [s.id, s.name]));
  const jobRoleName = new Map((jobRoles ?? []).map((r) => [r.id, r.name]));
  const verifier = canVerify(me);

  // Onboarding documents this person has entered that a leader has not sighted.
  const pendingSightings = [wwcc, teacher, quals, training].reduce(
    (n, list) => n + (list ?? []).filter((r) => !r.sighted_at).length,
    0,
  );
  const showSignOffPrompt = person.id !== me.id && pendingSightings > 0;

  // SOP sign-off progress: the suite attached to this person's job role, and how
  // many of those they have signed at the current version.
  let sopTotal = 0;
  let sopSigned = 0;
  if (person.job_role_id) {
    const { data: suite } = await supabase
      .from("job_role_sops")
      .select("sop_id")
      .eq("job_role_id", person.job_role_id);
    const suiteIds = (suite ?? []).map((r) => r.sop_id as string);
    sopTotal = suiteIds.length;
    if (suiteIds.length > 0) {
      const [{ data: sopRows }, { data: signRows }] = await Promise.all([
        supabase.from("sops").select("id, current_version").in("id", suiteIds),
        supabase
          .from("sign_offs")
          .select("sop_id, sop_version")
          .eq("user_id", person.id),
      ]);
      const signed = new Set(
        (signRows ?? []).map((s) => `${s.sop_id}:${s.sop_version}`),
      );
      sopSigned = (sopRows ?? []).filter((s) =>
        signed.has(`${s.id}:${s.current_version}`),
      ).length;
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
  const policyViewed = (
    (targetPolicies ?? []) as { id: string; published_version: number }[]
  ).filter((p) => viewedSet.has(`${p.id}:${p.published_version}`)).length;

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

  return (
    <div>
      <Link href="/admin/staff" className="text-sm text-slate-500 hover:text-slate-900">
        ← Staff
      </Link>

      <h1 className="mt-3 text-xl font-semibold">{person.full_name}</h1>
      <p className="mt-1 text-sm text-slate-500">
        {person.email} · {TIER_LABELS[person.access_tier as keyof typeof TIER_LABELS]}
        {" · "}
        {person.job_role_id ? jobRoleName.get(person.job_role_id) : "no job role"}
        {" · "}
        {person.service_id ? serviceName.get(person.service_id) : "all services"}
        {!person.is_active && " · inactive"}
      </p>

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

      {isAdmin(me.access_tier) && (
        <div className="mt-4 rounded-lg border border-slate-200 bg-white p-4">
          <HrVerifierToggle
            profileId={person.id}
            value={person.hr_verifier}
          />
        </div>
      )}

      <section className="mt-6">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Training progress
        </h2>
        <div className="mt-2 space-y-4 rounded-lg border border-slate-200 bg-white p-4">
          <ProgressBar
            label="SOPs signed"
            done={sopSigned}
            total={sopTotal}
            emptyNote={
              person.job_role_id
                ? "This job role has no SOPs attached yet."
                : "No job role set, so there are no SOPs to sign."
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
            <Row k="Position (Worker Register)">{wd.nqaits_position ?? "—"}</Row>
            <Row k="Nature of employment">{wd.employment_nature ?? "—"}</Row>
            <Row k="Start date">{fmtDate(wd.start_date)}</Row>
            <Row k="WWCC exemption">{wd.wwcc_exempt ? `Yes — ${wd.wwcc_exemption_reason ?? ""}` : "No"}</Row>
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
            canEdit={verifier}
          />
        </div>
      </section>

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
                      canVerify={verifier}
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

function Row({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <>
      <dt className="text-slate-500">{k}</dt>
      <dd className="text-slate-800">{children}</dd>
    </>
  );
}
