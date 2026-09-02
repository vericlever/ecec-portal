import Link from "next/link";
import { requireStaffAccess, isAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { contractAlerts } from "@/lib/contracts";

export const dynamic = "force-dynamic";

function fmtDate(v: string) {
  return new Date(v + "T00:00:00").toLocaleDateString("en-AU", {
    dateStyle: "medium",
  });
}

function whenLabel(daysLeft: number) {
  if (daysLeft < 0) {
    const d = Math.abs(daysLeft);
    return `expired ${d} ${d === 1 ? "day" : "days"} ago`;
  }
  if (daysLeft === 0) return "expires today";
  return `expires in ${daysLeft} ${daysLeft === 1 ? "day" : "days"}`;
}

export default async function ContractsPage() {
  const me = await requireStaffAccess();
  const supabase = createClient();

  const [alerts, { data: profiles }, { data: services }] = await Promise.all([
    contractAlerts(supabase),
    supabase.from("profiles").select("id, full_name, service_id, is_active"),
    supabase.from("services").select("id, name"),
  ]);

  const nameOf = new Map((profiles ?? []).map((p) => [p.id, p.full_name]));
  const activeOf = new Map((profiles ?? []).map((p) => [p.id, p.is_active]));
  const serviceOf = new Map((profiles ?? []).map((p) => [p.id, p.service_id]));
  const serviceName = new Map((services ?? []).map((s) => [s.id, s.name]));

  const rows = alerts.filter((a) => activeOf.get(a.profileId) !== false);
  const expiredTotal = rows.filter((a) => a.bucket === "expired").length;

  return (
    <div>
      <Link
        href="/admin"
        className="text-sm text-slate-500 hover:text-slate-900"
      >
        ← Overview
      </Link>
      <h1 className="mt-3 text-xl font-semibold">Contracts due for renewal</h1>
      <p className="mt-1 max-w-prose text-sm text-slate-500">
        Fixed-period contracts that have expired or expire within four weeks, for{" "}
        {isAdmin(me.access_tier)
          ? "staff across your organisation"
          : "staff at your service"}
        . Uploading a new executed contract for the person closes the flag.
        Contracts with no fixed period never appear here.
      </p>

      {rows.length === 0 ? (
        <p className="mt-6 text-sm text-slate-500">
          No contract has expired and none expires in the next four weeks.
        </p>
      ) : (
        <>
          <p className="mt-4 text-sm text-slate-600">
            {rows.length} {rows.length === 1 ? "contract" : "contracts"}
            {expiredTotal > 0 && (
              <span className="text-amber-700">
                {" "}
                · {expiredTotal} already expired
              </span>
            )}
          </p>
          <ul className="mt-4 divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
            {rows.map((a) => {
              const svc = serviceOf.get(a.profileId);
              return (
                <li key={a.profileId}>
                  <Link
                    href={`/admin/staff/${a.profileId}`}
                    className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-3 hover:bg-slate-50"
                  >
                    <div>
                      <div className="text-sm font-medium text-slate-900">
                        {nameOf.get(a.profileId) ?? "Unknown"}
                      </div>
                      <div className="text-xs text-slate-400">
                        {svc ? (serviceName.get(svc) ?? "—") : "all services"}
                      </div>
                    </div>
                    <span
                      className={
                        a.bucket === "expired"
                          ? "text-sm text-amber-700"
                          : "text-sm text-slate-500"
                      }
                    >
                      {fmtDate(a.expiryDate)} · {whenLabel(a.daysLeft)}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
