import Link from "next/link";
import { requireContentEditor } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { NewRoleInline } from "./new-role";

export const dynamic = "force-dynamic";

export default async function JobRolesPage() {
  await requireContentEditor();
  const supabase = createClient();

  const [{ data: roles }, { data: sopLinks }, { data: profiles }] =
    await Promise.all([
      supabase.from("job_roles").select("id, name, is_placeholder").order("name"),
      supabase.from("job_role_sops").select("job_role_id"),
      supabase.from("profiles").select("job_role_id, is_active"),
    ]);

  const sopCount = new Map<string, number>();
  for (const l of sopLinks ?? [])
    sopCount.set(l.job_role_id, (sopCount.get(l.job_role_id) ?? 0) + 1);
  const staffCount = new Map<string, number>();
  for (const p of profiles ?? []) {
    if (!p.job_role_id || !p.is_active) continue;
    staffCount.set(p.job_role_id, (staffCount.get(p.job_role_id) ?? 0) + 1);
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Job roles</h1>
      </div>
      <p className="mt-1 max-w-prose text-sm text-slate-500">
        Each job role has a suite of SOPs attached. Assigning a staff member a
        job role gives them that whole suite to sign off.
      </p>

      <ul className="mt-6 divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
        {(roles ?? []).map((r) => (
          <li key={r.id}>
            <Link
              href={`/admin/job-roles/${r.id}`}
              className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-slate-50"
            >
              <span className="text-sm font-medium">{r.name}</span>
              <span className="text-xs text-slate-500">
                {sopCount.get(r.id) ?? 0} SOPs · {staffCount.get(r.id) ?? 0} staff
              </span>
            </Link>
          </li>
        ))}
      </ul>

      <div className="mt-4">
        <NewRoleInline />
      </div>
    </div>
  );
}
