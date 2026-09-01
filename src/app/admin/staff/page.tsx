import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import {
  requireStaffAccess,
  isAdmin,
  isManager,
  TIER_LABELS,
  type AccessTier,
} from "@/lib/auth";
import { staffStatsByProfile } from "@/lib/staff-stats";

export const dynamic = "force-dynamic";

type StaffRow = {
  id: string;
  full_name: string;
  email: string;
  access_tier: AccessTier;
  is_active: boolean;
  service_id: string | null;
  job_role_id: string | null;
  hr_verifier: boolean;
};

export default async function StaffPage() {
  const me = await requireStaffAccess();
  const supabase = createClient();

  // RLS scopes profiles to the caller: admins see the whole organisation,
  // managers and HR verifiers see their own service.
  const [{ data: staff, error }, { data: services }, { data: jobRoles }] =
    await Promise.all([
      // The staff list is for people with compliance obligations. Admin
      // (operator) accounts are managed elsewhere and are left off.
      supabase
        .from("profiles")
        .select(
          "id, full_name, email, access_tier, is_active, service_id, job_role_id, hr_verifier",
        )
        .neq("access_tier", "admin")
        .order("full_name"),
      supabase.from("services").select("id, name"),
      supabase.from("job_roles").select("id, name"),
    ]);

  if (error) {
    return <p className="text-red-600">Could not load staff: {error.message}</p>;
  }

  const rows = (staff ?? []) as StaffRow[];
  const stats = await staffStatsByProfile(supabase, rows, me.id);

  const serviceName = new Map(
    (services ?? []).map((s) => [s.id as string, s.name as string]),
  );
  const jobRoleName = new Map(
    (jobRoles ?? []).map((r) => [r.id as string, r.name as string]),
  );

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Staff</h1>
        <div className="flex gap-2">
          {isAdmin(me.access_tier) && (
            <Link
              href="/admin/staff/import"
              className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Bulk import
            </Link>
          )}
          {isManager(me.access_tier) && (
            <Link
              href="/admin/staff/new"
              className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white"
            >
              Add staff member
            </Link>
          )}
        </div>
      </div>

      <ul className="mt-6 divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
        {rows.map((p) => {
          const stat = stats.get(p.id);
          return (
            <li key={p.id}>
              <Link
                href={`/admin/staff/${p.id}`}
                className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 px-4 py-3 hover:bg-slate-50"
              >
                <div className="min-w-0">
                  <div className="text-sm font-medium">
                    {p.full_name}
                    {!p.is_active && (
                      <span className="ml-2 text-xs font-normal text-slate-400">
                        inactive
                      </span>
                    )}
                    {p.hr_verifier && (
                      <span className="ml-2 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-500">
                        HR sign-off
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-slate-500">{p.email}</div>
                  <div className="text-xs text-slate-400">
                    {TIER_LABELS[p.access_tier]}
                    {" · "}
                    {p.job_role_id
                      ? (jobRoleName.get(p.job_role_id) ?? "—")
                      : "no job role"}
                    {" · "}
                    {p.service_id
                      ? (serviceName.get(p.service_id) ?? "—")
                      : "all services"}
                  </div>
                </div>

                {stat && (
                  <div className="flex shrink-0 gap-2">
                    <StatBox
                      label="SOP"
                      value={stat.sopPct === null ? "—" : `${stat.sopPct}%`}
                    />
                    <StatBox
                      label="Policy"
                      value={
                        stat.policyPct === null ? "—" : `${stat.policyPct}%`
                      }
                    />
                    <StatBox
                      label="Outstanding"
                      value={String(stat.outstanding)}
                      big
                      alert={stat.outstanding > 0}
                    />
                  </div>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function StatBox({
  label,
  value,
  big = false,
  alert = false,
}: {
  label: string;
  value: string;
  big?: boolean;
  alert?: boolean;
}) {
  return (
    <div className="shrink-0 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-center">
      <div className="text-[10px] font-medium uppercase tracking-wide text-slate-400">
        {label}
      </div>
      <div
        className={`${big ? "text-xl" : "text-lg"} font-semibold leading-tight ${
          alert ? "text-amber-700" : "text-slate-900"
        }`}
      >
        {value}
      </div>
    </div>
  );
}
