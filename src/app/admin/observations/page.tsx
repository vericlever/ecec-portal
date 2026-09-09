import Link from "next/link";
import { requireManager } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { reviewState } from "@/lib/sop-review";

export const dynamic = "force-dynamic";

export default async function ObservationsPage() {
  const me = await requireManager();
  const supabase = createClient();

  const [{ data: sops }, { data: obs }] = await Promise.all([
    supabase
      .from("sops")
      .select(
        "id, name, signoff_type, needs_review, next_review_date, published_version",
      )
      .not("published_version", "is", null)
      .order("name"),
    supabase
      .from("sop_observations")
      .select("sop_id, outcome, created_at")
      .order("created_at", { ascending: false }),
  ]);

  const lastObs = new Map<string, { at: string; outcome: string }>();
  const obsCount = new Map<string, number>();
  for (const o of obs ?? []) {
    obsCount.set(o.sop_id as string, (obsCount.get(o.sop_id as string) ?? 0) + 1);
    if (!lastObs.has(o.sop_id as string)) {
      lastObs.set(o.sop_id as string, {
        at: o.created_at as string,
        outcome: o.outcome as string,
      });
    }
  }

  const rows = (sops ?? []).map((s) => ({
    id: s.id as string,
    name: s.name as string,
    highRisk: s.signoff_type === "self_and_manager",
    needsReview: Boolean(s.needs_review),
    review: reviewState(s.next_review_date as string | null),
    count: obsCount.get(s.id as string) ?? 0,
    last: lastObs.get(s.id as string) ?? null,
  }));

  // High-risk SOPs first, then anything already flagged, then the rest.
  rows.sort((a, b) => {
    const rank = (r: typeof a) =>
      (r.needsReview ? 0 : r.highRisk ? 1 : 2);
    return rank(a) - rank(b) || a.name.localeCompare(b.name);
  });

  const flagged = rows.filter((r) => r.needsReview).length;

  return (
    <div>
      <h1 className="text-xl font-semibold">Procedure Outcomes</h1>
      <p className="mt-1 max-w-prose text-sm text-slate-500">
        Record what you saw when a procedure was carried out, and whether it
        needs a review. High-risk SOPs (the ones needing a manager co-sign) are
        listed first.
        {flagged > 0 && (
          <span className="text-red-700">
            {" "}
            {flagged} SOP{flagged === 1 ? "" : "s"} currently flagged for review.
          </span>
        )}
      </p>

      <ul className="mt-6 divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
        {rows.map((r) => (
          <li key={r.id}>
            <Link
              href={`/admin/observations/${r.id}`}
              className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-slate-50"
            >
              <div className="min-w-0">
                <div className="text-sm font-medium">
                  {r.name}
                  {r.highRisk && (
                    <span className="ml-2 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-800">
                      High risk
                    </span>
                  )}
                </div>
                <div className="mt-0.5 text-xs text-slate-400">
                  {r.count > 0
                    ? `${r.count} observation${r.count === 1 ? "" : "s"}`
                    : "No observations yet"}
                  {r.last &&
                    ` · last ${new Date(r.last.at).toLocaleDateString("en-AU", { dateStyle: "medium" })}`}
                  {r.review.status !== "none" && ` · ${r.review.label}`}
                </div>
              </div>
              {r.needsReview && (
                <span className="shrink-0 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                  Needs review
                </span>
              )}
            </Link>
          </li>
        ))}
        {rows.length === 0 && (
          <li className="px-4 py-6 text-sm text-slate-500">
            No published SOPs to observe against yet.
          </li>
        )}
      </ul>
    </div>
  );
}
