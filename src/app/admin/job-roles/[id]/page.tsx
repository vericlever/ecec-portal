import Link from "next/link";
import { notFound } from "next/navigation";
import { requireContentEditor } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { RoleEditor } from "./role-editor";

export const dynamic = "force-dynamic";

export default async function JobRoleDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const me = await requireContentEditor();
  const supabase = createClient();

  const { data: role } = await supabase
    .from("job_roles")
    .select("id, name, organisation_id, is_placeholder")
    .eq("id", params.id)
    .maybeSingle();
  if (!role || role.organisation_id !== me.organisation_id) notFound();

  const [{ data: allSops }, { data: links }, { data: everyone }, { data: roleHolders }] =
    await Promise.all([
      supabase
        .from("sops")
        .select("id, name, published_version")
        .order("name"),
      supabase.from("job_role_sops").select("sop_id").eq("job_role_id", params.id),
      supabase
        .from("profiles")
        .select("id, full_name, is_active")
        .neq("access_tier", "admin")
        .order("full_name"),
      supabase.from("profile_job_roles").select("profile_id").eq("job_role_id", params.id),
    ]);

  const holderIds = new Set((roleHolders ?? []).map((r) => r.profile_id as string));
  const activePeople = (everyone ?? []).filter((p) => p.is_active);
  const staff = activePeople.filter((p) => holderIds.has(p.id as string));
  const candidates = activePeople.filter((p) => !holderIds.has(p.id as string));

  const linkedIds = new Set((links ?? []).map((l) => l.sop_id));

  return (
    <div className="max-w-2xl">
      <Link
        href="/admin/job-roles"
        className="text-sm text-slate-500 hover:text-slate-900"
      >
        ← Job roles
      </Link>

      <RoleEditor
        role={{ id: role.id, name: role.name }}
        allSops={
          (allSops ?? []) as {
            id: string;
            name: string;
            published_version: number | null;
          }[]
        }
        linkedSopIds={Array.from(linkedIds) as string[]}
        staff={staff.map((s) => ({ id: s.id as string, name: s.full_name as string }))}
        candidates={candidates.map((s) => ({
          id: s.id as string,
          name: s.full_name as string,
        }))}
      />
    </div>
  );
}
