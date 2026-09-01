import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import {
  requireStaffAccess,
  isManager,
  TIER_LABELS,
  type AccessTier,
} from "@/lib/auth";

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
      supabase
        .from("profiles")
        .select(
          "id, full_name, email, access_tier, is_active, service_id, job_role_id, hr_verifier",
        )
        .order("full_name"),
      supabase.from("services").select("id, name"),
      supabase.from("job_roles").select("id, name"),
    ]);

  if (error) {
    return <p className="text-red-600">Could not load staff: {error.message}</p>;
  }

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
        {isManager(me.access_tier) && (
          <Link
            href="/admin/staff/new"
            className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white"
          >
            Add staff member
          </Link>
        )}
      </div>

      <ul className="mt-6 divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
        {((staff ?? []) as StaffRow[]).map((p) => (
          <li key={p.id}>
            <Link
              href={`/admin/staff/${p.id}`}
              className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-slate-50"
            >
              <div>
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
              </div>
              <div className="text-right text-xs text-slate-500">
                <div className="text-slate-700">{TIER_LABELS[p.access_tier]}</div>
                <div>
                  {p.job_role_id
                    ? (jobRoleName.get(p.job_role_id) ?? "—")
                    : "no job role"}
                  {" · "}
                  {p.service_id
                    ? (serviceName.get(p.service_id) ?? "—")
                    : "all services"}
                </div>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
