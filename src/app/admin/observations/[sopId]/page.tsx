import Link from "next/link";
import { notFound } from "next/navigation";
import { requireManager } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { reviewDateFromNow, reviewState } from "@/lib/sop-review";
import { cleanReviewPeriod } from "@/lib/constants";
import { ObservationForm } from "./observation-form";

export const dynamic = "force-dynamic";

export default async function ObservationDetailPage({
  params,
}: {
  params: { sopId: string };
}) {
  const me = await requireManager();
  const supabase = createClient();

  const { data: sop } = await supabase
    .from("sops")
    .select(
      "id, name, organisation_id, signoff_type, needs_review, suggested_evidence, review_period_months, next_review_date, published_version, published_body",
    )
    .eq("id", params.sopId)
    .maybeSingle();
  if (!sop || sop.organisation_id !== me.organisation_id) notFound();

  const { data: observations } = await supabase
    .from("sop_observations")
    .select(
      "id, evidence, outcome, review_clock_reset, created_at, observed_by_profile_id, evidence_document_id",
    )
    .eq("sop_id", params.sopId)
    .order("created_at", { ascending: false });

  const observerIds = [
    ...new Set(
      (observations ?? [])
        .map((o) => o.observed_by_profile_id)
        .filter(Boolean),
    ),
  ] as string[];
  const { data: observers } = observerIds.length
    ? await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", observerIds)
    : { data: [] as { id: string; full_name: string }[] };
  const observerName = new Map(
    (observers ?? []).map((p) => [p.id as string, p.full_name as string]),
  );

  const period = cleanReviewPeriod(sop.review_period_months);
  const review = reviewState(sop.next_review_date as string | null);

  return (
    <div className="max-w-2xl">
      <Link
        href="/admin/observations"
        className="text-sm text-slate-500 hover:text-slate-900"
      >
        ← Practice observations
      </Link>

      <h1 className="mt-3 text-xl font-semibold">
        {sop.name}
        {sop.signoff_type === "self_and_manager" && (
          <span className="ml-2 rounded-full bg-amber-100 px-1.5 py-0.5 align-middle text-[10px] font-medium uppercase tracking-wide text-amber-800">
            High risk
          </span>
        )}
      </h1>
      <p className="mt-1 text-sm text-slate-500">
        {review.label}
        {sop.needs_review && (
          <span className="text-red-700"> · currently flagged for review</span>
        )}
      </p>

      <section className="mt-6 rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Log an observation
        </h2>
        <ObservationForm
          sopId={sop.id as string}
          resetDate={reviewDateFromNow(period)}
          keepDate={review.dueDate}
          suggestedEvidence={(sop.suggested_evidence as string | null) ?? null}
        />
      </section>

      <section className="mt-6 rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Previous observations
        </h2>
        {(observations ?? []).length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">None recorded yet.</p>
        ) : (
          <ul className="mt-2 divide-y divide-slate-100 text-sm">
            {(observations ?? []).map((o) => (
              <li key={o.id as string} className="py-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      o.outcome === "needs_review"
                        ? "bg-red-100 text-red-700"
                        : "bg-green-100 text-green-700"
                    }`}
                  >
                    {o.outcome === "needs_review"
                      ? "Needs review"
                      : "Continue as is"}
                  </span>
                  <span className="text-xs text-slate-400">
                    {new Date(o.created_at as string).toLocaleDateString("en-AU", {
                      dateStyle: "medium",
                    })}{" "}
                    ·{" "}
                    {o.observed_by_profile_id
                      ? (observerName.get(o.observed_by_profile_id as string) ??
                        "A manager")
                      : "A manager"}
                  </span>
                </div>
                <p className="mt-1 whitespace-pre-wrap text-slate-700">
                  {o.evidence as string}
                </p>
                {o.evidence_document_id && (
                  <p className="mt-1 text-xs">
                    <a
                      href={`/api/documents/${o.evidence_document_id}`}
                      className="text-slate-600 underline"
                    >
                      Evidence file
                    </a>
                  </p>
                )}
                <p className="mt-1 text-xs text-slate-400">
                  {o.review_clock_reset
                    ? "Review clock was reset"
                    : "Review clock left unchanged"}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-6 rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Current procedure
        </h2>
        <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap rounded-md bg-slate-50 p-3 font-mono text-xs text-slate-700">
          {(sop.published_body as string) ?? ""}
        </pre>
      </section>
    </div>
  );
}
