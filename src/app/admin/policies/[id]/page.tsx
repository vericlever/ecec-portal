import Link from "next/link";
import { notFound } from "next/navigation";
import { requireContentEditor } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { policyCategories } from "@/lib/policy-categories";
import { PolicyEditor } from "./policy-editor";

export const dynamic = "force-dynamic";

export default async function PolicyDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const me = await requireContentEditor();
  const supabase = createClient();

  const [{ data: policy }, { data: services }, { data: allSops }] =
    await Promise.all([
      supabase.from("policies").select("*").eq("id", params.id).maybeSingle(),
      supabase.from("services").select("id, name").order("name"),
      supabase.from("sops").select("id, name").order("name"),
    ]);

  if (!policy || policy.organisation_id !== me.organisation_id) notFound();

  const [{ data: sourceDoc }, { data: links }, { data: catLinks }, categories] =
    await Promise.all([
      policy.source_document_id
        ? supabase
            .from("documents")
            .select("id, file_name, byte_size, extraction_note, created_at")
            .eq("id", policy.source_document_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      supabase
        .from("policy_sop_links")
        .select("sop_id")
        .eq("policy_id", params.id),
      supabase
        .from("policy_category_links")
        .select("category_id")
        .eq("policy_id", params.id),
      policyCategories(supabase),
    ]);

  const linkedSopIds = new Set((links ?? []).map((l) => l.sop_id));
  const sopName = new Map((allSops ?? []).map((s) => [s.id, s.name]));

  return (
    <div className="max-w-2xl">
      <Link
        href="/admin/policies"
        className="text-sm text-slate-500 hover:text-slate-900"
      >
        ← Policies
      </Link>

      <PolicyEditor
        policy={{
          id: policy.id,
          name: policy.name,
          is_parent_facing: policy.is_parent_facing,
          service_id: policy.service_id,
          body: policy.body ?? "",
          published_body: policy.published_body ?? "",
          published_version: policy.published_version,
          published_at: policy.published_at,
          review_period_months: policy.review_period_months ?? 6,
          next_review_date: policy.next_review_date ?? null,
        }}
        categories={categories}
        linkedCategoryIds={
          (catLinks ?? []).map((l) => l.category_id as string)
        }
        services={(services ?? []) as { id: string; name: string }[]}
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
        allSops={(allSops ?? []) as { id: string; name: string }[]}
        linkedSops={Array.from(linkedSopIds).map((id) => ({
          id: id as string,
          name: sopName.get(id) ?? "SOP",
        }))}
      />
    </div>
  );
}
