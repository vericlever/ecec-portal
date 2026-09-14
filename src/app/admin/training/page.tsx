import Link from "next/link";
import { requireStaffAccess, isAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { resolveReportScope } from "@/lib/reports";
import { trainingStatusData, type TrainingRow } from "@/lib/training-status";
import { fmtDate } from "@/lib/format-date";
import { TrainingStatusFilters } from "./training-filters";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

const STATUS_LABEL: Record<TrainingRow["status"], string> = {
  not_started: "Not started",
  in_progress: "In progress",
  complete: "Complete",
};

const CLOCK_LABEL: Record<NonNullable<TrainingRow["clockState"]>, string> = {
  not_due: "Not due",
  due_soon: "Due soon",
  overdue: "Overdue",
  paused: "Paused",
};

function clockCls(state: TrainingRow["clockState"]) {
  if (state === "overdue") return "text-red-700 font-medium";
  if (state === "due_soon") return "text-amber-700 font-medium";
  if (state === "paused") return "text-slate-400";
  return "text-slate-500";
}

const REASON_LABEL = {
  no_job_role: "No job role assigned",
  role_has_no_procedures: "Job role has no procedures assigned to it yet",
};

export default async function TrainingStatusPage({
  searchParams,
}: {
  searchParams: { [key: string]: string | undefined };
}) {
  const me = await requireStaffAccess();
  const admin = isAdmin(me.access_tier);
  const supabase = createClient();

  const requested = searchParams.service ?? null;
  const { serviceId } = resolveReportScope(me, requested || null);
  const includeInactive = searchParams.inactive === "1";
  const q = (searchParams.q ?? "").trim().toLowerCase();
  const roleFilter = searchParams.role ?? "";
  const sopFilter = searchParams.sop ?? "";
  const statusFilter = searchParams.status ?? "";
  const page = Math.max(1, Number(searchParams.page ?? "1") || 1);

  const [{ data: services }, { data: jobRoles }, { data: sopList }, data] = await Promise.all([
    supabase.from("services").select("id, name").order("name"),
    supabase.from("job_roles").select("id, name").order("name"),
    supabase
      .from("sops")
      .select("id, name")
      .not("published_version", "is", null)
      .order("name"),
    trainingStatusData(supabase, { serviceId, includeInactive }),
  ]);

  // jobRoleNames on a row only holds names, not ids - the filter select
  // posts an id (like every other filter here), so resolve it once up front.
  const jobRoleNameById = new Map((jobRoles ?? []).map((r) => [r.id as string, r.name as string]));
  const wantedRoleName = roleFilter ? jobRoleNameById.get(roleFilter) : undefined;

  let rows = data.rows.filter((r) => {
    if (q && !r.fullName.toLowerCase().includes(q) && !r.sopName.toLowerCase().includes(q)) {
      return false;
    }
    if (roleFilter && (!wantedRoleName || !r.jobRoleNames.includes(wantedRoleName))) return false;
    if (sopFilter && r.sopId !== sopFilter) return false;
    if (statusFilter) {
      const isLifecycleStatus =
        statusFilter === "not_started" || statusFilter === "in_progress" || statusFilter === "complete";
      if (isLifecycleStatus ? r.status !== statusFilter : r.clockState !== statusFilter) return false;
    }
    return true;
  });

  let noAssignment = data.noAssignment;
  if (q) noAssignment = noAssignment.filter((n) => n.fullName.toLowerCase().includes(q));

  rows = rows
    .slice()
    .sort((a, b) => a.fullName.localeCompare(b.fullName) || a.sopName.localeCompare(b.sopName));

  const total = rows.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const pageRows = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const serviceList = (services ?? []) as { id: string; name: string }[];
  const ownServiceName = me.service_id
    ? (serviceList.find((s) => s.id === me.service_id)?.name ?? null)
    : null;

  function pageHref(p: number) {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (requested) params.set("service", requested);
    if (roleFilter) params.set("role", roleFilter);
    if (sopFilter) params.set("sop", sopFilter);
    if (statusFilter) params.set("status", statusFilter);
    if (includeInactive) params.set("inactive", "1");
    params.set("page", String(p));
    return `/admin/training?${params.toString()}`;
  }

  return (
    <div>
      <h1 className="text-xl font-semibold">Training status</h1>
      <p className="mt-1 text-sm text-slate-500">
        Every procedure assigned to a staff member through their job role, whether
        it has been signed, and where it stands against the signing clock.
        {!admin && ownServiceName && ` Scoped to ${ownServiceName}.`}
      </p>

      <div className="mt-4">
        <TrainingStatusFilters
          basePath="/admin/training"
          services={serviceList}
          jobRoles={(jobRoles ?? []) as { id: string; name: string }[]}
          sops={(sopList ?? []) as { id: string; name: string }[]}
          showServiceFilter={admin}
          includeInactive={includeInactive}
        />
      </div>

      {noAssignment.length > 0 && (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-amber-800">
            No assigned procedures ({noAssignment.length})
          </h2>
          <ul className="mt-2 space-y-1 text-sm">
            {noAssignment.map((n) => (
              <li key={n.profileId} className="flex flex-wrap items-baseline justify-between gap-x-3">
                <Link
                  href={`/admin/staff/${n.profileId}`}
                  className="font-medium text-slate-800 underline hover:text-slate-900"
                >
                  {n.fullName}
                </Link>
                <span className="text-amber-800">{REASON_LABEL[n.reason]}</span>
                <span className="text-xs text-slate-400">{n.serviceName}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="mt-4 text-sm text-slate-500">
        {total} {total === 1 ? "assignment" : "assignments"}
        {(q || roleFilter || sopFilter || statusFilter) && " matching the current filters"}.
      </p>

      <div className="mt-2 overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="px-3 py-2">Staff</th>
              <th className="px-3 py-2">Job role</th>
              <th className="px-3 py-2">Service</th>
              <th className="px-3 py-2">Procedure</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Assigned</th>
              <th className="px-3 py-2">Completed</th>
              <th className="px-3 py-2">Due / clock</th>
              <th className="px-3 py-2">Comprehension</th>
              <th className="px-3 py-2">Last reminded</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.map((r) => (
              <tr key={`${r.profileId}:${r.sopId}`} className="border-b border-slate-100 last:border-0">
                <td className="px-3 py-2">
                  <Link
                    href={`/admin/staff/${r.profileId}`}
                    className="font-medium text-slate-800 underline hover:text-slate-900"
                  >
                    {r.fullName}
                  </Link>
                </td>
                <td className="px-3 py-2 text-slate-600">{r.jobRoleNames.join(", ")}</td>
                <td className="px-3 py-2 text-slate-600">{r.serviceName}</td>
                <td className="px-3 py-2 text-slate-800">
                  {r.sopName} <span className="text-xs text-slate-400">v{r.publishedVersion}</span>
                </td>
                <td className="px-3 py-2">{STATUS_LABEL[r.status]}</td>
                <td className="px-3 py-2 text-slate-500">{r.assignedAt ? fmtDate(r.assignedAt) : "—"}</td>
                <td className="px-3 py-2 text-slate-500">
                  {r.completedAt ? fmtDate(r.completedAt) : "—"}
                </td>
                <td className={`px-3 py-2 ${clockCls(r.clockState)}`}>
                  {r.status === "complete"
                    ? "—"
                    : r.clockState
                      ? `${CLOCK_LABEL[r.clockState]}${
                          r.daysOverdue != null
                            ? ` (${r.daysOverdue} ${r.daysOverdue === 1 ? "day" : "days"})`
                            : ""
                        }${r.dueDate ? ` · ${fmtDate(r.dueDate)}` : ""}`
                      : "—"}
                </td>
                <td className="px-3 py-2 text-slate-600">
                  {r.attemptCount > 0
                    ? `${r.attemptCount} attempt${r.attemptCount === 1 ? "" : "s"}${
                        r.hasPassedAttempt ? ", passed" : ""
                      }`
                    : "—"}
                </td>
                <td className="px-3 py-2 text-slate-500">
                  {r.lastReminded ? fmtDate(r.lastReminded) : "—"}
                </td>
              </tr>
            ))}
            {pageRows.length === 0 && (
              <tr>
                <td colSpan={10} className="px-3 py-6 text-center text-sm text-slate-400">
                  Nothing matches the current filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="mt-3 flex items-center justify-between text-sm">
          <span className="text-slate-500">
            Page {page} of {totalPages}
          </span>
          <div className="flex gap-2">
            {page > 1 && (
              <Link
                href={pageHref(page - 1)}
                className="rounded-md border border-slate-300 px-3 py-1.5 text-slate-700 hover:bg-slate-50"
              >
                Previous
              </Link>
            )}
            {page < totalPages && (
              <Link
                href={pageHref(page + 1)}
                className="rounded-md border border-slate-300 px-3 py-1.5 text-slate-700 hover:bg-slate-50"
              >
                Next
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
