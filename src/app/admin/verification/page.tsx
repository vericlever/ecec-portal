import Link from "next/link";
import { requireStaffAccess, isHrManager } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { pendingSightingsByProfile } from "@/lib/verification";

export const dynamic = "force-dynamic";

export default async function VerificationPage() {
  const me = await requireStaffAccess();
  const supabase = createClient();

  const [counts, { data: profiles }] = await Promise.all([
    pendingSightingsByProfile(supabase, me.id),
    supabase.from("profiles").select("id, full_name, is_active"),
  ]);

  const nameOf = new Map((profiles ?? []).map((p) => [p.id, p.full_name]));
  const activeOf = new Map((profiles ?? []).map((p) => [p.id, p.is_active]));

  const rows = Array.from(counts.entries())
    .map(([profileId, count]) => ({
      profileId,
      count,
      name: nameOf.get(profileId) ?? "Unknown",
      active: activeOf.get(profileId) ?? true,
    }))
    .filter((r) => r.active)
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

  return (
    <div>
      <h1 className="text-xl font-semibold">Document verification</h1>
      <p className="mt-1 max-w-prose text-sm text-slate-500">
        Staff at your service with documents they have entered but that have not
        been sighted yet.
      </p>

      {!isHrManager(me) && (
        <p className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          You can see what is outstanding, but only an HR manager can
          record a sighting.
        </p>
      )}

      {rows.length === 0 ? (
        <p className="mt-6 text-sm text-slate-500">Nothing is waiting to be sighted.</p>
      ) : (
        <ul className="mt-6 divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
          {rows.map((r) => (
            <li key={r.profileId}>
              <Link
                href={`/admin/staff/${r.profileId}`}
                className="flex items-center justify-between px-4 py-3 hover:bg-slate-50"
              >
                <span className="text-sm">{r.name}</span>
                <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                  {r.count} to sight
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
