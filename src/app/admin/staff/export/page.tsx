import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function ExportStaffPage() {
  const me = await requireAdmin();
  const supabase = createClient();

  const { data: services } = await supabase
    .from("services")
    .select("id, name, service_type")
    .order("name");

  const [{ data: profiles }, { data: workerRows }] = await Promise.all([
    supabase.from("profiles").select("id, service_id, is_active"),
    supabase.from("worker_details").select("profile_id"),
  ]);

  const onboarded = new Set((workerRows ?? []).map((w) => w.profile_id));

  // Only active staff who have started their Worker Register details land in an
  // export, so count those.
  const exportableCount = new Map<string, number>();
  let unassigned = 0;
  for (const p of profiles ?? []) {
    if (!p.is_active || !onboarded.has(p.id)) continue;
    if (!p.service_id) unassigned++;
    else
      exportableCount.set(
        p.service_id,
        (exportableCount.get(p.service_id) ?? 0) + 1,
      );
  }

  return (
    <div>
      <Link
        href="/admin/staff"
        className="text-sm text-slate-500 hover:text-slate-900"
      >
        ← Staff
      </Link>

      <h1 className="mt-3 text-xl font-semibold">Export staff (NQAITS)</h1>
      <p className="mt-1 max-w-prose text-sm text-slate-500">
        Download a service&apos;s active staff in the NQAITS Worker Register
        column layout. One file per service, since NQAITS registers are held per
        service.
      </p>

      <p className="mt-3 max-w-prose rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
        This matches the documented Worker Register template (field headers on
        row 12, one worker per row from row 13). NQAITS templates change over
        time. Check a real upload against the live NQAITS portal before relying
        on it for a submission.
      </p>

      <ul className="mt-6 divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
        {(services ?? []).map((s) => (
          <li key={s.id} className="px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-sm font-medium">{s.name}</div>
                <div className="text-xs text-slate-500">
                  {s.service_type === "FDC"
                    ? "Family Day Care"
                    : "Centre Based Day Care"}{" "}
                  · {exportableCount.get(s.id) ?? 0} staff with register details
                </div>
              </div>
              <div className="flex gap-2 text-xs">
                <a
                  href={`/admin/staff/export/file?service=${s.id}&format=xlsx`}
                  className="rounded-md bg-slate-900 px-3 py-1.5 font-medium text-white"
                >
                  Excel
                </a>
                <a
                  href={`/admin/staff/export/file?service=${s.id}&format=csv`}
                  className="rounded-md border border-slate-300 px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-50"
                >
                  CSV
                </a>
                <a
                  href={`/admin/staff/export/file?service=${s.id}&format=json`}
                  className="rounded-md border border-slate-300 px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-50"
                >
                  JSON
                </a>
              </div>
            </div>
          </li>
        ))}
      </ul>

      {unassigned > 0 && (
        <p className="mt-3 text-xs text-slate-500">
          {unassigned} staff member{unassigned === 1 ? "" : "s"} with register
          details {unassigned === 1 ? "is" : "are"} not assigned to a service and
          will not appear in any export. Assign them a service first.
        </p>
      )}
    </div>
  );
}
