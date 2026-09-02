import Link from "next/link";
import {
  requireStaffAccess,
  isManager,
  isAdmin,
  canEditContent,
} from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { staffStatsByProfile, summariseTeam } from "@/lib/staff-stats";
import { pendingSightingsByProfile } from "@/lib/verification";
import { expiringCredentials } from "@/lib/credentials";
import { contractAlerts } from "@/lib/contracts";
import { unsignedAgreementsByProfile } from "@/lib/agreements";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const me = await requireStaffAccess();
  const supabase = createClient();
  const manager = isManager(me.access_tier);

  const [
    { data: staff },
    sightings,
    { data: pendingCosign },
    credentialAlerts,
    contractDue,
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, job_role_id, service_id, is_active")
      .neq("access_tier", "admin"),
    pendingSightingsByProfile(supabase, me.id),
    manager
      ? supabase
          .from("sign_offs")
          .select("id, user_id, sop_id, verified_at")
          .is("verified_at", null)
      : Promise.resolve({ data: [] as { id: string; user_id: string; sop_id: string; verified_at: string | null }[] }),
    expiringCredentials(supabase, { withinDays: 60 }),
    contractAlerts(supabase),
  ]);

  const { data: unsignedContracts } = await supabase
    .from("contracts")
    .select("profile_id")
    .is("superseded_at", null)
    .is("signed_at", null);

  const activeStaff = (staff ?? []).filter((p) => p.is_active);
  const unsignedAgreements = await unsignedAgreementsByProfile(
    supabase,
    activeStaff,
  );
  const activeIds = new Set(activeStaff.map((p) => p.id));
  const signaturePeople = new Set<string>();
  for (const c of unsignedContracts ?? [])
    if (activeIds.has(c.profile_id as string))
      signaturePeople.add(c.profile_id as string);
  for (const [id, n] of unsignedAgreements) if (n > 0) signaturePeople.add(id);

  const stats = await staffStatsByProfile(supabase, activeStaff, me.id);
  const summary = summariseTeam(
    activeStaff.map((p) => p.id),
    stats,
  );

  const docsToSight = Array.from(sightings.values()).reduce((n, c) => n + c, 0);
  const peopleToSight = sightings.size;

  // Countersign queue: unverified sign-offs on self_and_manager SOPs, not the
  // viewer's own. RLS already scopes sign_offs to the manager's service.
  let cosignCount = 0;
  const cosignRows = (pendingCosign ?? []).filter((r) => r.user_id !== me.id);
  if (cosignRows.length > 0) {
    const sopIds = [...new Set(cosignRows.map((r) => r.sop_id))];
    const { data: sops } = await supabase
      .from("sops")
      .select("id, signoff_type")
      .in("id", sopIds);
    const manual = new Set(
      (sops ?? [])
        .filter((s) => s.signoff_type === "self_and_manager")
        .map((s) => s.id),
    );
    cosignCount = cosignRows.filter((r) => manual.has(r.sop_id)).length;
  }

  const credentialPeople = new Set(credentialAlerts.map((a) => a.profileId)).size;
  const expiredCount = credentialAlerts.filter(
    (a) => a.status === "expired",
  ).length;

  const contractPeople = new Set(contractDue.map((a) => a.profileId)).size;
  const contractExpired = contractDue.filter(
    (a) => a.bucket === "expired",
  ).length;

  const staffWithOutstanding = activeStaff.filter(
    (p) => (stats.get(p.id)?.outstanding ?? 0) > 0,
  ).length;

  const actions = [
    {
      show: true,
      href: "/admin/staff",
      label: "Staff with outstanding items",
      count: staffWithOutstanding,
      detail:
        staffWithOutstanding === 0
          ? "Everyone is up to date"
          : `of ${activeStaff.length} staff`,
    },
    {
      show: true,
      href: "/admin/credentials",
      label: "Staff with an expiring or expired credential",
      count: credentialPeople,
      detail:
        expiredCount > 0
          ? `${expiredCount} already expired`
          : "within the next 60 days",
      alert: expiredCount > 0,
    },
    {
      show: true,
      href: "/admin/contracts",
      label: "Contracts due for renewal or expired",
      count: contractPeople,
      detail:
        contractExpired > 0
          ? `${contractExpired} already expired`
          : "within the next 4 weeks",
      alert: contractExpired > 0,
    },
    {
      show: true,
      href: "/admin/agreements",
      label: "Staff with an agreement or contract to sign",
      count: signaturePeople.size,
      detail:
        signaturePeople.size === 0
          ? "Everyone has signed"
          : "agreements or contract acceptance outstanding",
    },
    {
      show: true,
      href: "/admin/verification",
      label: "Documents waiting to be sighted",
      count: docsToSight,
      detail:
        peopleToSight === 0
          ? "Nothing in the queue"
          : `across ${peopleToSight} ${peopleToSight === 1 ? "person" : "people"}`,
    },
    {
      show: manager,
      href: "/admin/countersign",
      label: "SOPs waiting for your countersignature",
      count: cosignCount,
      detail: cosignCount === 0 ? "Nothing waiting" : "staff have signed",
    },
  ].filter((a) => a.show);

  return (
    <div>
      <h1 className="text-xl font-semibold">Overview</h1>
      <p className="mt-1 text-sm text-slate-500">
        {isAdmin(me.access_tier)
          ? "Compliance across your organisation."
          : "Compliance across staff at your service."}
      </p>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard
          label="Staff fully compliant"
          value={`${summary.clear} of ${summary.total}`}
        />
        <StatCard
          label="SOPs signed"
          value={summary.sopPct === null ? "—" : `${summary.sopPct}%`}
          sub={
            summary.sopTotal > 0
              ? `${summary.sopSigned} of ${summary.sopTotal}`
              : "none assigned"
          }
        />
        <StatCard
          label="Policies viewed"
          value={summary.policyPct === null ? "—" : `${summary.policyPct}%`}
          sub={
            summary.policyTotal > 0
              ? `${summary.policyViewed} of ${summary.policyTotal}`
              : "none published"
          }
        />
        <StatCard
          label="Outstanding items"
          value={String(summary.outstanding)}
          alert={summary.outstanding > 0}
        />
      </div>

      <h2 className="mt-8 text-xs font-semibold uppercase tracking-wide text-slate-500">
        Needs attention
      </h2>
      <ul className="mt-2 divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
        {actions.map((a) => (
          <li key={a.href}>
            <Link
              href={a.href}
              className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-slate-50"
            >
              <div>
                <div className="text-sm text-slate-800">{a.label}</div>
                <div className="text-xs text-slate-400">{a.detail}</div>
              </div>
              <span
                className={`shrink-0 rounded-full px-2.5 py-0.5 text-sm font-semibold ${
                  a.count === 0
                    ? "bg-slate-100 text-slate-400"
                    : a.alert
                      ? "bg-amber-100 text-amber-800"
                      : "bg-slate-900 text-white"
                }`}
              >
                {a.count}
              </span>
            </Link>
          </li>
        ))}
      </ul>

      <div className="mt-6 flex flex-wrap gap-2">
        <Link
          href="/admin/staff"
          className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          All staff
        </Link>
        {canEditContent(me.access_tier) && (
          <>
            <Link
              href="/admin/policies"
              className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Policies
            </Link>
            <Link
              href="/admin/sops"
              className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              SOPs
            </Link>
          </>
        )}
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
  alert = false,
}: {
  label: string;
  value: string;
  sub?: string;
  alert?: boolean;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
        {label}
      </div>
      <div
        className={`mt-1 text-2xl font-semibold leading-none ${
          alert ? "text-amber-700" : "text-slate-900"
        }`}
      >
        {value}
      </div>
      {sub && <div className="mt-1 text-xs text-slate-400">{sub}</div>}
    </div>
  );
}
