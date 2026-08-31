import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin, ROLE_LABELS, type Role } from "@/lib/auth";

export const dynamic = "force-dynamic";

type StaffRow = {
  id: string;
  full_name: string;
  email: string;
  role: Role;
  is_active: boolean;
  site_id: string | null;
};

export default async function StaffPage() {
  await requireAdmin();
  const supabase = createClient();

  // RLS scopes this to the admin's own organisation.
  const [{ data: staff, error }, { data: sites }] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, full_name, email, role, is_active, site_id")
      .order("full_name"),
    supabase.from("sites").select("id, name"),
  ]);

  if (error) {
    return <p className="text-red-600">Could not load staff: {error.message}</p>;
  }

  const siteName = new Map(
    (sites ?? []).map((s) => [s.id as string, s.name as string]),
  );

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Staff</h1>
        <Link
          href="/admin/staff/new"
          className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white"
        >
          Add staff member
        </Link>
      </div>

      <ul className="mt-6 divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
        {((staff ?? []) as StaffRow[]).map((p) => (
          <li key={p.id} className="px-4 py-3">
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="text-sm font-medium">{p.full_name}</div>
                <div className="text-xs text-slate-500">{p.email}</div>
              </div>
              <div className="text-right text-xs text-slate-500">
                <div>{ROLE_LABELS[p.role]}</div>
                <div>
                  {p.site_id ? (siteName.get(p.site_id) ?? "—") : "All sites"}
                  {!p.is_active && " · inactive"}
                </div>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
