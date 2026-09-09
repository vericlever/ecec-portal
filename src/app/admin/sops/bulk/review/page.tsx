import Link from "next/link";
import { requireContentEditor } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { SopBulkReview } from "./sop-bulk-review";

export const dynamic = "force-dynamic";

export default async function SopBulkReviewPage({
  searchParams,
}: {
  searchParams: { ids?: string; failed?: string };
}) {
  const me = await requireContentEditor();
  const supabase = createClient();

  const ids = (searchParams.ids ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (ids.length === 0) {
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
    { data: sops },
    { data: policies },
    { data: links },
    { data: roleLinks },
    { data: jobRoles },
  ] = await Promise.all([
    supabase
      .from("sops")
      .select(
        "id, name, organisation_id, body, review_period_months, next_review_date, published_version",
      )
      .in("id", ids),
    supabase
      .from("policies")
      .select("id, name")
      .eq("organisation_id", me.organisation_id)
      .order("name"),
    supabase.from("policy_sop_links").select("sop_id, policy_id").in("sop_id", ids),
    supabase.from("job_role_sops").select("sop_id, job_role_id").in("sop_id", ids),
    supabase
      .from("job_roles")
      .select("id, name")
      .eq("organisation_id", me.organisation_id)
      .order("name"),
  ]);

  const linkedBySop = new Map<string, string[]>();
  for (const l of links ?? []) {
    const list = linkedBySop.get(l.sop_id as string) ?? [];
    list.push(l.policy_id as string);
    linkedBySop.set(l.sop_id as string, list);
  }
  const rolesBySop = new Map<string, string[]>();
  for (const l of roleLinks ?? []) {
    const list = rolesBySop.get(l.sop_id as string) ?? [];
    list.push(l.job_role_id as string);
    rolesBySop.set(l.sop_id as string, list);
  }

  const rows = (sops ?? [])
    .filter((s) => s.organisation_id === me.organisation_id)
    .sort((a, b) => (a.name as string).localeCompare(b.name as string))
    .map((s) => ({
      id: s.id as string,
      name: s.name as string,
      hasText: !!(s.body && String(s.body).trim()),
      alreadyPublished: (s.published_version as number | null) != null,
      reviewPeriod: (s.review_period_months as number | null) ?? 6,
      nextReviewDate: (s.next_review_date as string | null) ?? null,
      linkedPolicyIds: linkedBySop.get(s.id as string) ?? [],
      jobRoleIds: rolesBySop.get(s.id as string) ?? [],
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
        Step 2 of 2. Everything with readable text is set to publish. Check the
        job roles, the next review date and any policy links, then publish the
        lot in one step. A procedure with no readable text stays a draft for you to
        fix.
      </p>
      {failed > 0 && (
        <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          {failed} file{failed === 1 ? "" : "s"} could not be uploaded and{" "}
          {failed === 1 ? "is" : "are"} not listed here.
        </p>
      )}

      <SopBulkReview
        rows={rows}
        policies={(policies ?? []) as { id: string; name: string }[]}
        jobRoles={(jobRoles ?? []) as { id: string; name: string }[]}
      />
    </div>
  );
}
