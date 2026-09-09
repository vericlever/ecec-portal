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
import { reviewState, HISTORY_EVENT_LABELS } from "@/lib/sop-review";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const me = await requireStaffAccess();
  const supabase = createClient();
  const manager = isManager(me.access_tier);
  const editor = canEditContent(me.access_tier);

  const [
    { data: staff },
    sightings,
    { data: pendingCosign },
    credentialAlerts,
    contractDue,
    { data: services },
    { data: pubSops },
    { data: pubPolicies },
    { data: sopLinks },
    { data: history },
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
      : Promise.resolve({
          data: [] as {
            id: string;
            user_id: string;
            sop_id: string;
            verified_at: string | null;
          }[],
        }),
    expiringCredentials(supabase, { withinDays: 60 }),
    contractAlerts(supabase),
    supabase.from("services").select("id, name").order("name"),
    supabase
      .from("sops")
      .select("id, name, next_review_date, needs_review")
      .not("published_version", "is", null),
    supabase
      .from("policies")
      .select("id, name, next_review_date")
      .not("published_version", "is", null),
    supabase.from("policy_sop_links").select("sop_id, policy_id"),
    editor
      ? supabase
          .from("sop_history")
          .select("id, sop_id, event_type, note, created_at")
          .order("created_at", { ascending: false })
          .limit(20)
      : Promise.resolve({
          data: [] as {
            id: string;
            sop_id: string;
            event_type: string;
            note: string | null;
            created_at: string;
          }[],
        }),
  ]);

  const { data: unsignedContracts } = await supabase
    .from("contracts")
    .select("profile_id")
    .is("superseded_at", null)
    .is("signed_at", null)
    .eq("is_deed", false);

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

  // --- review cycle (Steps 20 & 21) ------------------------------------
  type ReviewItem = { id: string; name: string; kind: "Procedure" | "Policy"; label: string; overdue: boolean };
  const reviewItems: ReviewItem[] = [];
  for (const s of pubSops ?? []) {
    const r = reviewState(s.next_review_date as string | null);
    if (r.status === "overdue" || r.status === "soon")
      reviewItems.push({
        id: s.id as string,
        name: s.name as string,
        kind: "Procedure",
        label: r.label,
        overdue: r.status === "overdue",
      });
  }
  for (const p of pubPolicies ?? []) {
    const r = reviewState(p.next_review_date as string | null);
    if (r.status === "overdue" || r.status === "soon")
      reviewItems.push({
        id: p.id as string,
        name: p.name as string,
        kind: "Policy",
        label: r.label,
        overdue: r.status === "overdue",
      });
  }
  reviewItems.sort(
    (a, b) => Number(b.overdue) - Number(a.overdue) || a.name.localeCompare(b.name),
  );
  const reviewOverdue = reviewItems.filter((i) => i.overdue).length;
  const flaggedSops = (pubSops ?? []).filter((s) => s.needs_review);

  // --- structural integrity (Step 6 linking) --------------------------
  const linkedSopIds = new Set((sopLinks ?? []).map((l) => l.sop_id as string));
  const linkedPolicyIds = new Set(
    (sopLinks ?? []).map((l) => l.policy_id as string),
  );
  const orphanSops = (pubSops ?? []).filter((s) => !linkedSopIds.has(s.id as string));
  const orphanPolicies = (pubPolicies ?? []).filter(
    (p) => !linkedPolicyIds.has(p.id as string),
  );

  // --- compliance heatmap: per service ------------------------------
  const serviceName = new Map(
    (services ?? []).map((s) => [s.id as string, s.name as string]),
  );
  const byService = new Map<string | null, string[]>();
  for (const p of activeStaff) {
    const key = (p.service_id as string | null) ?? null;
    const arr = byService.get(key) ?? [];
    arr.push(p.id as string);
    byService.set(key, arr);
  }
  const heatRows = [...byService.entries()]
    .map(([sid, ids]) => ({
      name: sid ? (serviceName.get(sid) ?? "Unassigned") : "Unassigned",
      team: summariseTeam(ids, stats),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

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
      show: editor,
      href: "/admin/sops",
      label: "Procedures and policies due for review",
      count: reviewItems.length,
      detail:
        reviewItems.length === 0
          ? "Nothing due in the next month"
          : `${reviewOverdue} overdue`,
      alert: reviewOverdue > 0,
    },
    {
      show: manager,
      href: "/admin/observations",
      label: "Procedures flagged by a practice observation",
      count: flaggedSops.length,
      detail:
        flaggedSops.length === 0
          ? "None flagged"
          : "waiting on a content editor",
      alert: flaggedSops.length > 0,
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
      label: "Procedures waiting for your countersignature",
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
          label="Procedures signed"
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

      {/* 1. Action queue */}
      <h2 className="mt-8 text-xs font-semibold uppercase tracking-wide text-slate-500">
        Action queue
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

      {editor && (reviewItems.length > 0 || flaggedSops.length > 0) && (
        <details className="mt-3 rounded-lg border border-slate-200 bg-white">
          <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-slate-700">
            Review cycle detail
          </summary>
          <div className="border-t border-slate-100 px-4 py-3 text-sm">
            {flaggedSops.length > 0 && (
              <div className="mb-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-red-700">
                  Flagged from an observation
                </p>
                <ul className="mt-1 space-y-0.5">
                  {flaggedSops.map((s) => (
                    <li key={s.id as string}>
                      <Link
                        href={`/admin/sops/${s.id}`}
                        className="text-slate-700 underline"
                      >
                        {s.name as string}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {reviewItems.length > 0 && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Review due
                </p>
                <ul className="mt-1 space-y-0.5">
                  {reviewItems.map((i) => (
                    <li key={i.kind + i.id} className="flex justify-between gap-3">
                      <Link
                        href={
                          i.kind === "Procedure"
                            ? `/admin/sops/${i.id}`
                            : `/admin/policies/${i.id}`
                        }
                        className="text-slate-700 underline"
                      >
                        {i.kind}: {i.name}
                      </Link>
                      <span
                        className={
                          i.overdue ? "text-red-700" : "text-amber-700"
                        }
                      >
                        {i.label}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </details>
      )}

      {/* 2. Structural integrity */}
      {editor && (
        <>
          <h2 className="mt-8 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Structural integrity
          </h2>
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            <IntegrityCard
              title="Published procedures with no policy link"
              names={orphanSops.map((s) => s.name as string)}
              hrefFor={(name) =>
                `/admin/sops/${orphanSops.find((s) => s.name === name)?.id}`
              }
              total={(pubSops ?? []).length}
            />
            <IntegrityCard
              title="Published policies with no procedure link"
              names={orphanPolicies.map((p) => p.name as string)}
              hrefFor={(name) =>
                `/admin/policies/${orphanPolicies.find((p) => p.name === name)?.id}`
              }
              total={(pubPolicies ?? []).length}
            />
          </div>
          <p className="mt-2 text-xs text-slate-400">
            {(sopLinks ?? []).length} policy-to-procedure link
            {(sopLinks ?? []).length === 1 ? "" : "s"} across{" "}
            {linkedPolicyIds.size} policies and {linkedSopIds.size} procedures.
          </p>
        </>
      )}

      {/* 3. Compliance heatmap */}
      <h2 className="mt-8 text-xs font-semibold uppercase tracking-wide text-slate-500">
        Compliance heatmap
      </h2>
      <div className="mt-2 overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-400">
              <th className="px-4 py-2 font-medium">Service</th>
              <th className="px-3 py-2 font-medium">Staff</th>
              <th className="px-3 py-2 font-medium">Fully compliant</th>
              <th className="px-3 py-2 font-medium">Procedures signed</th>
              <th className="px-3 py-2 font-medium">Policies read</th>
              <th className="px-3 py-2 font-medium">Outstanding</th>
            </tr>
          </thead>
          <tbody>
            {heatRows.map((r) => (
              <tr key={r.name} className="border-b border-slate-50 last:border-0">
                <td className="px-4 py-2 font-medium text-slate-700">{r.name}</td>
                <td className="px-3 py-2 text-slate-500">{r.team.total}</td>
                <td className="px-3 py-2 text-slate-500">
                  {r.team.clear} of {r.team.total}
                </td>
                <HeatCell pct={r.team.sopPct} />
                <HeatCell pct={r.team.policyPct} />
                <td className="px-3 py-2">
                  <span
                    className={
                      r.team.outstanding > 0
                        ? "font-semibold text-amber-700"
                        : "text-slate-400"
                    }
                  >
                    {r.team.outstanding}
                  </span>
                </td>
              </tr>
            ))}
            {heatRows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-4 text-slate-400">
                  No active staff.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* 4. Review history log */}
      {editor && (history ?? []).length > 0 && (
        <details className="mt-8 rounded-lg border border-slate-200 bg-white">
          <summary className="cursor-pointer px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Review history log
          </summary>
          <ul className="divide-y divide-slate-100 border-t border-slate-100 text-sm">
            {(history ?? []).map((h) => (
              <li key={h.id as string} className="px-4 py-2.5">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <Link
                    href={`/admin/sops/${h.sop_id}`}
                    className="font-medium text-slate-700 underline"
                  >
                    {HISTORY_EVENT_LABELS[h.event_type as string] ??
                      h.event_type}
                  </Link>
                  <span className="text-xs text-slate-400">
                    {new Date(h.created_at as string).toLocaleString("en-AU", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </span>
                </div>
                {h.note && (
                  <p className="mt-0.5 text-xs text-slate-500">
                    {h.note as string}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}

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
              Procedures
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

function HeatCell({ pct }: { pct: number | null }) {
  const tone =
    pct === null
      ? "bg-slate-50 text-slate-400"
      : pct >= 90
        ? "bg-green-100 text-green-800"
        : pct >= 60
          ? "bg-amber-100 text-amber-800"
          : "bg-red-100 text-red-800";
  return (
    <td className="px-3 py-2">
      <span className={`rounded px-1.5 py-0.5 text-xs font-semibold ${tone}`}>
        {pct === null ? "—" : `${pct}%`}
      </span>
    </td>
  );
}

function IntegrityCard({
  title,
  names,
  hrefFor,
  total,
}: {
  title: string;
  names: string[];
  hrefFor: (name: string) => string;
  total: number;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-medium text-slate-700">{title}</span>
        <span
          className={`text-sm font-semibold ${
            names.length > 0 ? "text-amber-700" : "text-slate-400"
          }`}
        >
          {names.length}
        </span>
      </div>
      <p className="mt-0.5 text-xs text-slate-400">of {total} published</p>
      {names.length > 0 && (
        <ul className="mt-2 space-y-0.5 text-sm">
          {names.slice(0, 8).map((n) => (
            <li key={n}>
              <Link href={hrefFor(n)} className="text-slate-600 underline">
                {n}
              </Link>
            </li>
          ))}
          {names.length > 8 && (
            <li className="text-xs text-slate-400">
              and {names.length - 8} more
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
