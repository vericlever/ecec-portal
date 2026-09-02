import Link from "next/link";
import { notFound } from "next/navigation";
import { requireContentEditor } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { SopEditor } from "./sop-editor";

export const dynamic = "force-dynamic";

export default async function SopDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const me = await requireContentEditor();
  const supabase = createClient();

  const [{ data: sop }, { data: services }, { data: jobRoles }] =
    await Promise.all([
      supabase.from("sops").select("*").eq("id", params.id).maybeSingle(),
      supabase.from("services").select("id, name").order("name"),
      supabase.from("job_roles").select("id, name, is_placeholder").order("name"),
    ]);

  if (!sop || sop.organisation_id !== me.organisation_id) notFound();

  const [{ data: sourceDoc }, { data: links }, { count: signCount }] =
    await Promise.all([
      sop.source_document_id
        ? supabase
            .from("documents")
            .select("id, file_name, byte_size, extraction_note")
            .eq("id", sop.source_document_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      supabase.from("job_role_sops").select("job_role_id").eq("sop_id", params.id),
      supabase
        .from("sign_offs")
        .select("id", { count: "exact", head: true })
        .eq("sop_id", params.id),
    ]);

  const linkedRoleIds = new Set((links ?? []).map((l) => l.job_role_id));

  return (
    <div className="max-w-2xl">
      <Link href="/admin/sops" className="text-sm text-slate-500 hover:text-slate-900">
        ← SOPs
      </Link>

      <SopEditor
        sop={{
          id: sop.id,
          name: sop.name,
          target_tier: sop.target_tier ?? "",
          signoff_type: sop.signoff_type,
          priority: sop.priority,
          notes: sop.notes ?? "",
          service_id: sop.service_id,
          body: sop.body ?? "",
          published_body: sop.published_body ?? "",
          published_version: sop.published_version,
          published_at: sop.published_at,
        }}
        services={(services ?? []) as { id: string; name: string }[]}
        jobRoles={
          (jobRoles ?? []) as {
            id: string;
            name: string;
            is_placeholder: boolean;
          }[]
        }
        linkedRoleIds={Array.from(linkedRoleIds) as string[]}
        signOffCount={signCount ?? 0}
        sourceDoc={
          sourceDoc
            ? {
                id: sourceDoc.id,
                file_name: sourceDoc.file_name,
                byte_size: sourceDoc.byte_size,
                extraction_note: sourceDoc.extraction_note,
              }
            : null
        }
      />
    </div>
  );
}
