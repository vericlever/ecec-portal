import Link from "next/link";
import { requireManager, canEditContent } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { SOP_TIER_LABELS } from "@/lib/constants";
import { reviewState } from "@/lib/sop-review";
import { sopReviewStatusMap } from "@/lib/sop-review-status";

export const dynamic = "force-dynamic";

type SopRow = {
  id: string;
  name: string;
  target_tier: string | null;
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

export default async function AdminSopsPage() {
  const me = await requireManager();
  const canEdit = canEditContent(me.access_tier);
  const supabase = createClient();

  const [{ data: sops }, { data: services }, { data: roleLinks }, reviewStatus] =
    await Promise.all([
      supabase
        .from("sops")
        .select(
          "id, name, target_tier, signoff_type, priority, body, published_body, published_version, service_id",
        )
        .order("name"),
      supabase.from("services").select("id, name"),
      supabase.from("job_role_sops").select("sop_id"),
      sopReviewStatusMap(supabase),
    ]);

  const serviceName = new Map((services ?? []).map((s) => [s.id, s.name]));
  const roleCount = new Map<string, number>();
  for (const l of roleLinks ?? [])
    roleCount.set(l.sop_id, (roleCount.get(l.sop_id) ?? 0) + 1);

  const rows = (sops ?? []).map((s) => ({
    ...s,
    next_review_date: reviewStatus.get(s.id as string)?.nextReviewDate ?? null,
    latest_decision: reviewStatus.get(s.id as string)?.latestDecision ?? null,
  })) as SopRow[];
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
        {canEdit && (
          <div className="flex gap-2">
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
          </div>
        )}
      </div>

      <p className="mt-1 text-sm text-slate-500">
        {rows.length} procedures · {publishedCount} published
        {needsContent > 0 && ` · ${needsContent} still need content`}
        {reviewOverdue > 0 && (
          <span className="text-red-700">
            {" "}
            · {reviewOverdue} overdue for review
          </span>
        )}
        {needsRevision > 0 && (
          <span className="text-red-700">
            {" "}
            · {needsRevision} needing revision
          </span>
        )}
      </p>

      <ul className="mt-6 divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
        {rows.map((s) => {
          const st = statusOf(s);
          const roles = roleCount.get(s.id) ?? 0;
          const rev = s.published_version
            ? reviewState(s.next_review_date)
            : null;
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
                    {s.target_tier
                      ? (SOP_TIER_LABELS[s.target_tier] ?? s.target_tier)
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
    </div>
  );
}
