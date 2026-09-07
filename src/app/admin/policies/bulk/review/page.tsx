import Link from "next/link";
import { requireContentEditor } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { policyCategories } from "@/lib/policy-categories";
import { PolicyBulkReview } from "./policy-bulk-review";

export const dynamic = "force-dynamic";

export default async function PolicyBulkReviewPage({
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
          href="/admin/policies/bulk"
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

  const categories = await policyCategories(supabase);

  const [{ data: policies }, { data: sops }, { data: catLinks }, { data: sopLinks }] =
    await Promise.all([
      supabase
        .from("policies")
        .select(
          "id, name, organisation_id, body, review_period_months, published_version",
        )
        .in("id", ids),
      supabase
        .from("sops")
        .select("id, name")
        .eq("organisation_id", me.organisation_id)
        .order("name"),
      supabase
        .from("policy_category_links")
        .select("policy_id, category_id")
        .in("policy_id", ids),
      supabase
        .from("policy_sop_links")
        .select("policy_id, sop_id")
        .in("policy_id", ids),
    ]);

  const catsByPolicy = new Map<string, string[]>();
  for (const l of catLinks ?? []) {
    const list = catsByPolicy.get(l.policy_id as string) ?? [];
    list.push(l.category_id as string);
    catsByPolicy.set(l.policy_id as string, list);
  }
  const sopsByPolicy = new Map<string, string[]>();
  for (const l of sopLinks ?? []) {
    const list = sopsByPolicy.get(l.policy_id as string) ?? [];
    list.push(l.sop_id as string);
    sopsByPolicy.set(l.policy_id as string, list);
  }

  const rows = (policies ?? [])
    .filter((p) => p.organisation_id === me.organisation_id)
    .sort((a, b) => (a.name as string).localeCompare(b.name as string))
    .map((p) => ({
      id: p.id as string,
      name: p.name as string,
      hasText: !!(p.body && String(p.body).trim()),
      alreadyPublished: (p.published_version as number | null) != null,
      categoryIds: catsByPolicy.get(p.id as string) ?? [],
      reviewPeriod: (p.review_period_months as number | null) ?? 6,
      linkedSopIds: sopsByPolicy.get(p.id as string) ?? [],
    }));

  const failed = Number(searchParams.failed ?? 0);

  return (
    <div className="max-w-3xl">
      <Link
        href="/admin/policies/bulk"
        className="text-sm text-slate-500 hover:text-slate-900"
      >
        ← Bulk upload
      </Link>
      <h1 className="mt-3 text-xl font-semibold">Review and publish</h1>
      <p className="mt-1 max-w-prose text-sm text-slate-500">
        Step 2 of 2. Everything with readable text is set to publish. Adjust the
        categories, review period and any SOP links, then publish the lot in one
        step. A policy with no readable text stays a draft for you to fix.
      </p>
      {failed > 0 && (
        <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          {failed} file{failed === 1 ? "" : "s"} could not be uploaded and{" "}
          {failed === 1 ? "is" : "are"} not listed here.
        </p>
      )}

      <PolicyBulkReview
        rows={rows}
        categories={categories}
        sops={(sops ?? []) as { id: string; name: string }[]}
      />
    </div>
  );
}
