import Link from "next/link";
import { requireContentEditor } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { SopBulkReview } from "./sop-bulk-review";

export const dynamic = "force-dynamic";

export default async function SopBulkReviewPage({
  searchParams,
}: {
  searchParams: { batch?: string; failed?: string };
}) {
  const me = await requireContentEditor();
  const supabase = createClient();

  const batchId = searchParams.batch ?? "";

  if (!batchId) {
    return (
      <div className="max-w-2xl">
        <Link
          href="/admin/sops/bulk"
          className="text-sm text-slate-500 hover:text-slate-900"
        >
          ← Bulk upload
        </Link>
        <p className="mt-4 text-sm text-slate-600">
          Nothing to review. Start from the upload page.
        </p>
      </div>
    );
  }

  const [
    { data: staged },
    { data: policies },
    { data: jobRoles },
    { data: services },
    { data: categories },
  ] = await Promise.all([
    supabase
      .from("bulk_upload_staging")
      .select(
        "id, organisation_id, kind, original_filename, derived_title, extracted_text, extraction_note, duplicate_of_id, duplicate_of_name, duplicate_score, filename_flag, blank_flag, needs_review, status",
      )
      .eq("batch_id", batchId)
      .eq("kind", "sop")
      .eq("status", "pending")
      .order("derived_title"),
    supabase
      .from("policies")
      .select("id, name")
      .eq("organisation_id", me.organisation_id)
      .order("name"),
    supabase
      .from("job_roles")
      .select("id, name")
      .eq("organisation_id", me.organisation_id)
      .order("name"),
    supabase.from("services").select("id, name").eq("organisation_id", me.organisation_id),
    supabase
      .from("policy_categories")
      .select("id, name")
      .eq("organisation_id", me.organisation_id)
      .eq("applies_to_procedures", true)
      .order("name"),
  ]);

  const rows = (staged ?? [])
    .filter((s) => s.organisation_id === me.organisation_id)
    .map((s) => ({
      stagingId: s.id as string,
      fileName: s.original_filename as string,
      title: s.derived_title as string,
      hasText: !!(s.extracted_text && String(s.extracted_text).trim()),
      extractionNote: s.extraction_note as string | null,
      duplicateOfId: s.duplicate_of_id as string | null,
      duplicateOfName: s.duplicate_of_name as string | null,
      duplicateScore: s.duplicate_score as number | null,
      filenameFlag: s.filename_flag as boolean,
      blankFlag: s.blank_flag as boolean,
      needsReview: s.needs_review as boolean,
    }));

  const failed = Number(searchParams.failed ?? 0);

  return (
    <div className="max-w-3xl">
      <Link
        href="/admin/sops/bulk"
        className="text-sm text-slate-500 hover:text-slate-900"
      >
        ← Bulk upload
      </Link>
      <h1 className="mt-3 text-xl font-semibold">Review and publish</h1>
      <p className="mt-1 max-w-prose text-sm text-slate-500">
        Step 2 of 2. Nothing is created until you commit below. Check the
        title, job roles, category, site and any flags first - a likely
        duplicate, a filename-style title, or no readable text are all
        called out so you can decide before anything is written.
      </p>
      {failed > 0 && (
        <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          {failed} file{failed === 1 ? "" : "s"} could not be parsed and{" "}
          {failed === 1 ? "is" : "are"} not listed here.
        </p>
      )}
      {rows.length === 0 && failed === 0 && (
        <p className="mt-4 text-sm text-slate-600">
          Nothing left to review in this batch - already committed or discarded.
        </p>
      )}

      <SopBulkReview
        rows={rows}
        batchId={batchId}
        policies={(policies ?? []) as { id: string; name: string }[]}
        jobRoles={(jobRoles ?? []) as { id: string; name: string }[]}
        services={(services ?? []) as { id: string; name: string }[]}
        categories={(categories ?? []) as { id: string; name: string }[]}
      />
    </div>
  );
}
