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

  const [{ data: allSops }, { data: links }, { data: staff }] =
    await Promise.all([
      supabase
        .from("sops")
        .select("id, name, published_version")
        .order("name"),
      supabase.from("job_role_sops").select("sop_id").eq("job_role_id", params.id),
      supabase
        .from("profiles")
        .select("id, full_name, is_active")
        .eq("job_role_id", params.id),
    ]);

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
        staff={
          ((staff ?? []) as { id: string; full_name: string; is_active: boolean }[])
            .filter((s) => s.is_active)
            .map((s) => ({ id: s.id, name: s.full_name }))
        }
      />
    </div>
  );
}
