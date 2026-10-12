import Link from "next/link";
import { notFound } from "next/navigation";
import { requireContentEditor } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { policyCategories } from "@/lib/policy-categories";
import { documentTags } from "@/lib/document-tags";
import { fmtReviewDate } from "@/lib/sop-review";
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
  const tags = await documentTags(supabase, "policy", params.id);

  // Step 59, B7a: policies have no review page, so open flags show at the
  // top of the editor instead - same position/style a procedure review gives
  // its linked items.
  const { data: openFlags } = await supabase
    .from("policy_flags")
    .select("id, note, source, raised_by, raised_at")
    .eq("policy_id", params.id)
    .is("cleared_at", null)
    .order("raised_at", { ascending: false });
  const raiserIds = [...new Set((openFlags ?? []).map((f) => f.raised_by as string))];
  const { data: raisers } = raiserIds.length
    ? await supabase.from("profiles").select("id, full_name").in("id", raiserIds)
    : { data: [] as { id: string; full_name: string }[] };
  const raiserName = new Map((raisers ?? []).map((p) => [p.id as string, p.full_name as string]));

  return (
    <div className="max-w-2xl">
      <Link
        href="/admin/policies"
        className="text-sm text-slate-500 hover:text-slate-900"
      >
        ← Our Policies
      </Link>

      {(openFlags ?? []).length > 0 && (
        <section className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-amber-800">
            Policy flags ({(openFlags ?? []).length})
          </h2>
          <p className="mt-1 text-xs text-amber-700">
            Clears when this policy is next published as a new version.
          </p>
          <ul className="mt-3 space-y-2">
            {(openFlags ?? []).map((f) => (
              <li key={f.id as string} className="border-t border-amber-200 pt-2 first:border-t-0 first:pt-0">
                <p className="text-slate-800">{f.note as string}</p>
                <p className="mt-0.5 text-xs text-amber-700">
                  {raiserName.get(f.raised_by as string) ?? "A manager"} · {fmtReviewDate(f.raised_at as string)} ·{" "}
                  {f.source === "procedure_review" ? "from a procedure review" : "raised directly"}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}

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
        qualityAreaIds={tags.qualityAreas}
        childSafeStandardIds={tags.childSafeStandards}
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
          name: sopName.get(id) ?? "Procedure",
        }))}
        timezone={me.organisation_timezone}
      />
    </div>
  );
}
