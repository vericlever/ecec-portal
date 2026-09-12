import Link from "next/link";
import { notFound } from "next/navigation";
import { requireManager } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { documentTags } from "@/lib/document-tags";
import { CHILD_SAFE_STANDARDS, NQS_QUALITY_AREAS } from "@/lib/tags";
import { fmtReviewDate } from "@/lib/sop-review";
import { ReviewForm } from "./review-form";

export const dynamic = "force-dynamic";

export default async function ReviewSopPage({
  params,
}: {
  params: { id: string };
}) {
  const me = await requireManager();
  const supabase = createClient();

  const { data: sop } = await supabase
    .from("sops")
    .select("id, name, organisation_id, published_version")
    .eq("id", params.id)
    .maybeSingle();
  if (!sop || sop.organisation_id !== me.organisation_id) notFound();
  if (sop.published_version == null) {
    return (
      <div className="max-w-2xl">
        <Link href={`/admin/sops/${sop.id}`} className="text-sm text-slate-500 hover:text-slate-900">
          ← {sop.name}
        </Link>
        <p className="mt-4 text-sm text-slate-600">
          This procedure is not published yet, so there is nothing to review.
        </p>
      </div>
    );
  }

  const [{ data: links }, tags, { data: staff }, { data: previousReviews }, { data: openFlags }] =
    await Promise.all([
      supabase.from("policy_sop_links").select("policy_id").eq("sop_id", sop.id),
      documentTags(supabase, "sop", sop.id),
      supabase
        .from("profiles")
        .select("id, full_name")
        .eq("organisation_id", me.organisation_id)
        .eq("is_active", true)
        .order("full_name"),
      supabase
        .from("sop_reviews")
        .select("id, reviewed_at, practice_reflection, outcome_reflection, decision")
        .eq("sop_id", sop.id)
        .order("reviewed_at", { ascending: false })
        .limit(1),
      supabase
        .from("sop_outcome_flags")
        .select("id, reflection, created_at, flagged_by")
        .eq("sop_id", sop.id)
        .is("resolved_at", null)
        .order("created_at", { ascending: false }),
    ]);

  const flaggerIds = [...new Set((openFlags ?? []).map((f) => f.flagged_by as string))];
  const { data: flaggers } = flaggerIds.length
    ? await supabase.from("profiles").select("id, full_name").in("id", flaggerIds)
    : { data: [] as { id: string; full_name: string }[] };
  const flaggerName = new Map((flaggers ?? []).map((p) => [p.id as string, p.full_name as string]));
  const outcomeFlags = (openFlags ?? []).map((f) => ({
    id: f.id as string,
    reflection: f.reflection as string,
    at: f.created_at as string,
    by: flaggerName.get(f.flagged_by as string) ?? "A staff member",
  }));

  const policyIds = (links ?? []).map((l) => l.policy_id as string);
  const { data: policyRows } = policyIds.length
    ? await supabase.from("policies").select("id, name").in("id", policyIds)
    : { data: [] as { id: string; name: string }[] };
  const policyNames = (policyRows ?? []).map((p) => p.name as string).sort();

  const standardNames = tags.childSafeStandards
    .map((id) => CHILD_SAFE_STANDARDS.find((o) => o.id === id))
    .filter((o): o is (typeof CHILD_SAFE_STANDARDS)[number] => Boolean(o))
    .map((o) => `${o.code} ${o.name}`);
  const qualityAreaNames = tags.qualityAreas
    .map((id) => NQS_QUALITY_AREAS.find((o) => o.id === id))
    .filter((o): o is (typeof NQS_QUALITY_AREAS)[number] => Boolean(o))
    .map((o) => `${o.code} ${o.name}`);

  const previous = (previousReviews ?? [])[0] ?? null;
  let previousActions: {
    id: string;
    description: string;
    ownerName: string;
    dueDate: string;
    status: string;
  }[] = [];
  if (previous) {
    const { data: actionRows } = await supabase
      .from("sop_review_actions")
      .select("id, description, owner_id, due_date, status")
      .eq("review_id", previous.id);
    const ownerIds = [...new Set((actionRows ?? []).map((a) => a.owner_id as string))];
    const { data: owners } = ownerIds.length
      ? await supabase.from("profiles").select("id, full_name").in("id", ownerIds)
      : { data: [] as { id: string; full_name: string }[] };
    const ownerName = new Map((owners ?? []).map((o) => [o.id as string, o.full_name as string]));
    previousActions = (actionRows ?? []).map((a) => ({
      id: a.id as string,
      description: a.description as string,
      ownerName: ownerName.get(a.owner_id as string) ?? "Someone",
      dueDate: fmtReviewDate(a.due_date as string),
      status: a.status as string,
    }));
  }

  return (
    <div className="max-w-2xl">
      <Link href={`/admin/sops/${sop.id}`} className="text-sm text-slate-500 hover:text-slate-900">
        ← {sop.name}
      </Link>
      <h1 className="mt-3 text-xl font-semibold">Review: {sop.name}</h1>

      {outcomeFlags.length > 0 && (
        <section className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-amber-800">
            Staff outcome flags ({outcomeFlags.length})
          </h2>
          <p className="mt-1 text-xs text-amber-700">
            Raised by staff on this procedure since the last review. Consider these
            alongside your own reflections below - they resolve automatically once
            you save this review.
          </p>
          <ul className="mt-3 space-y-2">
            {outcomeFlags.map((f) => (
              <li key={f.id} className="border-t border-amber-200 pt-2 first:border-t-0 first:pt-0">
                <p className="text-slate-800">{f.reflection}</p>
                <p className="mt-0.5 text-xs text-amber-700">
                  {f.by} · {fmtReviewDate(f.at)}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-4 rounded-lg border border-slate-200 bg-white p-4 text-sm">
        <p className="text-slate-700">
          <span className="font-medium">Serves:</span>{" "}
          {policyNames.length ? policyNames.join(", ") : "no policy linked"}
        </p>
        {(standardNames.length > 0 || qualityAreaNames.length > 0) && (
          <p className="mt-1 text-slate-700">
            <span className="font-medium">Tagged to:</span>{" "}
            {[...standardNames, ...qualityAreaNames].join(", ")}
          </p>
        )}

        {previous ? (
          <div className="mt-4 border-t border-slate-100 pt-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Previous review · {fmtReviewDate(previous.reviewed_at as string)} ·{" "}
              {previous.decision === "needs_revision" ? "Needed revision" : "Stood as written"}
            </p>
            <p className="mt-2 text-xs font-semibold text-slate-500">Practice (level 3)</p>
            <p className="text-slate-700">{previous.practice_reflection as string}</p>
            <p className="mt-2 text-xs font-semibold text-slate-500">Outcomes (level 4)</p>
            <p className="text-slate-700">{previous.outcome_reflection as string}</p>
            {previousActions.length > 0 && (
              <div className="mt-2">
                <p className="text-xs font-semibold text-slate-500">Actions from that review</p>
                <ul className="mt-1 space-y-1">
                  {previousActions.map((a) => (
                    <li key={a.id} className="text-slate-700">
                      {a.description} — {a.ownerName}, due {a.dueDate}{" "}
                      <span
                        className={
                          a.status === "open"
                            ? "text-amber-700"
                            : a.status === "done"
                              ? "text-green-700"
                              : "text-slate-400"
                        }
                      >
                        ({a.status})
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ) : (
          <p className="mt-4 border-t border-slate-100 pt-3 text-slate-500">
            This procedure has not been reviewed before.
          </p>
        )}
      </section>

      <ReviewForm sopId={sop.id} staff={(staff ?? []) as { id: string; full_name: string }[]} />
    </div>
  );
}
