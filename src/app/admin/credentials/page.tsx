import Link from "next/link";
import { requireStaffAccess, isAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { expiringCredentials } from "@/lib/credentials";

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

export default async function CredentialsPage() {
  const me = await requireStaffAccess();
  const supabase = createClient();

  const [alerts, { data: profiles }, { data: services }] = await Promise.all([
    expiringCredentials(supabase, { withinDays: 60 }),
    supabase.from("profiles").select("id, full_name, service_id, is_active"),
    supabase.from("services").select("id, name"),
  ]);

  const nameOf = new Map((profiles ?? []).map((p) => [p.id, p.full_name]));
  const activeOf = new Map((profiles ?? []).map((p) => [p.id, p.is_active]));
  const serviceOf = new Map((profiles ?? []).map((p) => [p.id, p.service_id]));
  const serviceName = new Map((services ?? []).map((s) => [s.id, s.name]));

  // Group by person, active staff only, soonest expiry first.
  const byPerson = new Map<string, typeof alerts>();
  for (const a of alerts) {
    if (activeOf.get(a.profileId) === false) continue;
    const list = byPerson.get(a.profileId) ?? [];
    list.push(a);
    byPerson.set(a.profileId, list);
  }
  const people = Array.from(byPerson.entries())
    .map(([profileId, items]) => ({
      profileId,
      items,
      soonest: Math.min(...items.map((i) => i.daysLeft)),
    }))
    .sort((a, b) => a.soonest - b.soonest);

  const expiredTotal = alerts.filter((a) => a.status === "expired").length;

  return (
    <div>
      <Link
        href="/admin"
        className="text-sm text-slate-500 hover:text-slate-900"
      >
        ← Overview
      </Link>
      <h1 className="mt-3 text-xl font-semibold">Expiring credentials</h1>
      <p className="mt-1 max-w-prose text-sm text-slate-500">
        Working with Children Checks, teacher registrations and training that
        have expired or expire within 60 days, for{" "}
        {isAdmin(me.access_tier)
          ? "staff across your organisation"
          : "staff at your service"}
        . Only the current record of each kind is shown, a renewed check clears
        the older one.
      </p>

      {people.length === 0 ? (
        <p className="mt-6 text-sm text-slate-500">
          Nothing has expired and nothing expires in the next 60 days.
        </p>
      ) : (
        <>
          <p className="mt-4 text-sm text-slate-600">
            {people.length} {people.length === 1 ? "person" : "people"}
            {expiredTotal > 0 && (
              <span className="text-amber-700">
                {" "}
                · {expiredTotal} {expiredTotal === 1 ? "credential" : "credentials"}{" "}
                already expired
              </span>
            )}
          </p>
          <ul className="mt-4 space-y-3">
            {people.map((p) => {
              const svc = serviceOf.get(p.profileId);
              return (
                <li
                  key={p.profileId}
                  className="rounded-lg border border-slate-200 bg-white p-4"
                >
                  <div className="flex items-center justify-between gap-4">
                    <Link
                      href={`/admin/staff/${p.profileId}`}
                      className="text-sm font-medium text-slate-900 hover:underline"
                    >
                      {nameOf.get(p.profileId) ?? "Unknown"}
                    </Link>
                    <span className="text-xs text-slate-400">
                      {svc ? (serviceName.get(svc) ?? "—") : "all services"}
                    </span>
                  </div>
                  <ul className="mt-2 space-y-1">
                    {p.items.map((it, i) => (
                      <li
                        key={i}
                        className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm"
                      >
                        <span className="text-slate-700">{it.label}</span>
                        <span
                          className={
                            it.status === "expired"
                              ? "text-amber-700"
                              : "text-slate-500"
                          }
                        >
                          {fmtDate(it.expiryDate)} · {whenLabel(it.daysLeft)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
