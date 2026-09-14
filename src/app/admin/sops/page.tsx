import Link from "next/link";
import { requireManager, canEditContent } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { reviewState } from "@/lib/sop-review";
import { procedureCategories } from "@/lib/policy-categories";
import { AdminListFilters } from "../_filters/list-filters";
import { sopReviewStatusMap } from "@/lib/sop-review-status";

export const dynamic = "force-dynamic";

type SopRow = {
  id: string;
  name: string;
  category_id: string | null;
  signoff_type: string;
  priority: number | null;
  body: string | null;
  published_body: string | null;
  published_version: number | null;
  service_id: string | null;
  next_review_date: string | null;
  latest_decision: "stands" | "needs_revision" | null;
};

function statusOf(s: SopRow): { label: string; tone: "grey" | "amber" | "green" | "blue" } {
  if (!s.published_version) {
    if (!s.body || !s.body.trim()) return { label: "Needs content", tone: "grey" };
    return { label: "Draft", tone: "blue" };
  }
  if ((s.body ?? "") !== (s.published_body ?? ""))
    return { label: "Published · unpublished changes", tone: "amber" };
  return { label: "Published", tone: "green" };
}

const TONE: Record<string, string> = {
  grey: "bg-slate-100 text-slate-500",
  amber: "bg-amber-100 text-amber-800",
  green: "bg-green-100 text-green-700",
  blue: "bg-blue-100 text-blue-700",
};

const STATUS_OPTIONS = [
  { value: "published", label: "Published" },
  { value: "draft", label: "Draft" },
  { value: "needs_content", label: "Needs content" },
  { value: "review_overdue", label: "Review overdue" },
];

// Escape the characters ILIKE treats specially so a search for "50% off" or
// "note_1" does not turn into an accidental wildcard.
function escapeIlike(s: string): string {
  return s.replace(/[%_\\]/g, (c) => `\\${c}`);
}

export default async function AdminSopsPage({
  searchParams,
}: {
  searchParams: { category?: string; q?: string; status?: string };
}) {
  const me = await requireManager();
  const canEdit = canEditContent(me.access_tier);
  const supabase = createClient();

  const q = (searchParams.q ?? "").trim();
  const categoryFilter = searchParams.category ?? "";
  const statusFilter = searchParams.status ?? "";

  // Server-side: search (trigram-indexed), category and the published/draft
  // axis are plain column filters, done in the query itself - not fetched in
  // full and narrowed in the browser. review_overdue is derived from
  // sop_review_status (a view over last_reviewed_at/review_period_months,
  // not a stored column), so it narrows via a second lean query rather than
  // a computed WHERE clause; the review status map is fetched either way,
  // for the badges every row already shows.
  let query = supabase
    .from("sops")
    .select(
      "id, name, category_id, signoff_type, priority, body, published_body, published_version, service_id",
    );
  if (q) query = query.ilike("name", `%${escapeIlike(q)}%`);
  if (categoryFilter) query = query.eq("category_id", categoryFilter);
  if (statusFilter === "published") query = query.not("published_version", "is", null);
  if (statusFilter === "draft") query = query.is("published_version", null);
  if (statusFilter === "needs_content") query = query.is("published_version", null);
  query = query.order("name");

  const [{ data: sops }, { data: services }, { data: roleLinks }, categories, reviewStatus] =
    await Promise.all([
      query,
      supabase.from("services").select("id, name"),
      supabase.from("job_role_sops").select("sop_id"),
      procedureCategories(supabase),
      sopReviewStatusMap(supabase),
    ]);

  const serviceName = new Map((services ?? []).map((s) => [s.id, s.name]));
  const categoryName = new Map(categories.map((c) => [c.id, c.name]));
  const roleCount = new Map<string, number>();
  for (const l of roleLinks ?? [])
    roleCount.set(l.sop_id, (roleCount.get(l.sop_id) ?? 0) + 1);

  let rows = (sops ?? []).map((s) => ({
    ...s,
    next_review_date: reviewStatus.get(s.id as string)?.nextReviewDate ?? null,
    latest_decision: reviewStatus.get(s.id as string)?.latestDecision ?? null,
  })) as SopRow[];

  // draft/needs_content both start from published_version is null; the split
  // between them is whether there is real body text, which is not a single
  // clean column condition (empty string vs null) - resolved here, against
  // the already-narrowed (search + category + published_version) result set,
  // not the full table.
  if (statusFilter === "draft") {
    rows = rows.filter((s) => !!(s.body && s.body.trim()));
  } else if (statusFilter === "needs_content") {
    rows = rows.filter((s) => !s.body || !s.body.trim());
  } else if (statusFilter === "review_overdue") {
    rows = rows.filter(
      (s) => s.published_version && reviewState(s.next_review_date).status === "overdue",
    );
  }

  const publishedCount = rows.filter((s) => s.published_version).length;
  const needsContent = rows.filter((s) => statusOf(s).label === "Needs content").length;
  const reviewOverdue = rows.filter(
    (s) => s.published_version && reviewState(s.next_review_date).status === "overdue",
  ).length;
  const needsRevision = rows.filter((s) => s.latest_decision === "needs_revision").length;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Procedures</h1>
        <div className="flex flex-wrap gap-2">
          <AdminListFilters
            basePath="/admin/sops"
            categories={categories}
            statusOptions={STATUS_OPTIONS}
          />
          {canEdit && (
            <>
              <Link
                href="/admin/sops/bulk"
                className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Bulk upload
              </Link>
              <Link
                href="/admin/sops/new"
                className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white"
              >
                New Procedure
              </Link>
            </>
          )}
        </div>
      </div>

      <p className="mt-1 text-sm text-slate-500">
        {rows.length} procedure{rows.length === 1 ? "" : "s"}
        {(q || categoryFilter || statusFilter) && " matching the current filters"}
        {" · "}
        {publishedCount} published
        {needsContent > 0 && ` · ${needsContent} still need content`}
        {reviewOverdue > 0 && (
          <span className="text-red-700"> · {reviewOverdue} overdue for review</span>
        )}
        {needsRevision > 0 && (
          <span className="text-red-700"> · {needsRevision} needing revision</span>
        )}
      </p>

      {rows.length === 0 ? (
        <p className="mt-6 text-sm text-slate-500">No procedures match those filters.</p>
      ) : (
        <ul className="mt-6 divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
          {rows.map((s) => {
            const st = statusOf(s);
            const roles = roleCount.get(s.id) ?? 0;
            const rev = s.published_version ? reviewState(s.next_review_date) : null;
            return (
              <li key={s.id}>
                <Link
                  href={`/admin/sops/${s.id}`}
                  className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-slate-50"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-medium">
                      {s.name}
                      {s.signoff_type === "self_and_manager" && (
                        <span className="ml-2 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-800">
                          Manager co-sign
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 text-xs text-slate-400">
                      {s.category_id
                        ? (categoryName.get(s.category_id) ?? "—")
                        : "no category"}
                      {s.service_id
                        ? ` · ${serviceName.get(s.service_id) ?? "one site"} only`
                        : ""}
                      {roles > 0
                        ? ` · ${roles} job role${roles === 1 ? "" : "s"}`
                        : " · not in any role"}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {s.latest_decision === "needs_revision" && (
                      <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                        Needs revision
                      </span>
                    )}
                    {rev && (rev.status === "overdue" || rev.status === "soon") && (
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          rev.status === "overdue"
                            ? "bg-red-100 text-red-700"
                            : "bg-amber-100 text-amber-800"
                        }`}
                      >
                        {rev.status === "overdue" ? "Review overdue" : "Review due"}
                      </span>
                    )}
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${TONE[st.tone]}`}
                    >
                      {st.label}
                    </span>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
