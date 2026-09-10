import Link from "next/link";
import { notFound } from "next/navigation";
import { requireManager, canEditContent } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { documentTags } from "@/lib/document-tags";
import { sopReviewStatusFor } from "@/lib/sop-review-status";
import { SopEditor } from "./sop-editor";

export const dynamic = "force-dynamic";

export default async function SopDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const me = await requireManager();
  const canEdit = canEditContent(me.access_tier);
  const supabase = createClient();

  const [{ data: sop }, { data: services }, { data: jobRoles }] =
    await Promise.all([
      supabase.from("sops").select("*").eq("id", params.id).maybeSingle(),
      supabase.from("services").select("id, name").order("name"),
      supabase.from("job_roles").select("id, name, is_placeholder").order("name"),
    ]);

  if (!sop || sop.organisation_id !== me.organisation_id) notFound();

  const [
    { data: sourceDoc },
    { data: links },
    { count: signCount },
    { data: editHistory },
    { data: reviewHistory },
    { data: openActions },
  ] = await Promise.all([
    sop.source_document_id
      ? supabase
          .from("documents")
          .select("id, file_name, byte_size, extraction_note")
          .eq("id", sop.source_document_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from("job_role_sops").select("job_role_id").eq("sop_id", params.id),
    supabase
      .from("sign_offs")
      .select("id", { count: "exact", head: true })
      .eq("sop_id", params.id),
    supabase
      .from("sop_history")
      .select("id, event_type, note, created_at, actor_profile_id")
      .eq("sop_id", params.id)
      .neq("event_type", "period_change")
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("sop_reviews")
      .select("id, reviewed_at, decision, reviewed_by")
      .eq("sop_id", params.id)
      .order("reviewed_at", { ascending: false })
      .limit(50),
    supabase
      .from("sop_review_actions")
      .select("id, description, owner_id, due_date, status")
      .eq("sop_id", params.id)
      .eq("status", "open")
      .order("due_date", { ascending: true }),
  ]);

  const actorIds = [
    ...new Set([
      ...(editHistory ?? []).map((h) => h.actor_profile_id).filter(Boolean),
      ...(reviewHistory ?? []).map((h) => h.reviewed_by).filter(Boolean),
      ...(openActions ?? []).map((a) => a.owner_id).filter(Boolean),
    ]),
  ] as string[];
  const { data: actors } = actorIds.length
    ? await supabase.from("profiles").select("id, full_name").in("id", actorIds)
    : { data: [] as { id: string; full_name: string }[] };
  const actorName = new Map(
    (actors ?? []).map((a) => [a.id as string, a.full_name as string]),
  );

  // One timeline, event-typed: reviewed, revised, republished (no
  // period_change rows - those stay in the audit log, not the report or this
  // view). "Revised" and "republished" both live in sop_history ("edit" /
  // "published"); "reviewed" lives in sop_reviews, a separate table since
  // migration 0039 - merged here by timestamp.
  const historyRows = [
    ...(editHistory ?? []).map((h) => ({
      id: h.id as string,
      eventType: h.event_type as string,
      note: (h.note as string | null) ?? "",
      at: h.created_at as string,
      actor: h.actor_profile_id
        ? (actorName.get(h.actor_profile_id as string) ?? "Someone")
        : "System",
    })),
    ...(reviewHistory ?? []).map((r) => ({
      id: r.id as string,
      eventType: "reviewed",
      note:
        r.decision === "needs_revision"
          ? "Decided the procedure needs revision"
          : "Decided the procedure stands as written",
      at: r.reviewed_at as string,
      actor: r.reviewed_by
        ? (actorName.get(r.reviewed_by as string) ?? "Someone")
        : "Someone",
    })),
  ].sort((a, b) => b.at.localeCompare(a.at));

  const openActionRows = (openActions ?? []).map((a) => ({
    id: a.id as string,
    description: a.description as string,
    ownerName: a.owner_id ? (actorName.get(a.owner_id as string) ?? "Someone") : "Someone",
    dueDate: a.due_date as string,
  }));

  const linkedRoleIds = new Set((links ?? []).map((l) => l.job_role_id));
  const tags = await documentTags(supabase, "sop", params.id);
  const reviewStatus = await sopReviewStatusFor(supabase, params.id);

  return (
    <div className="max-w-2xl">
      <Link href="/admin/sops" className="text-sm text-slate-500 hover:text-slate-900">
        ← Procedures
      </Link>

      <SopEditor
        sop={{
          id: sop.id,
          name: sop.name,
          target_tier: sop.target_tier ?? "",
          signoff_type: sop.signoff_type,
          priority: sop.priority,
          notes: sop.notes ?? "",
          service_id: sop.service_id,
          body: sop.body ?? "",
          published_body: sop.published_body ?? "",
          published_version: sop.published_version,
          published_at: sop.published_at,
          review_period_months: sop.review_period_months ?? 6,
          next_review_date: reviewStatus.nextReviewDate,
          last_reviewed_at: reviewStatus.lastReviewedAt,
          latest_decision: reviewStatus.latestDecision,
          suggested_evidence: sop.suggested_evidence ?? "",
        }}
        canEdit={canEdit}
        history={historyRows}
        openActions={openActionRows}
        services={(services ?? []) as { id: string; name: string }[]}
        jobRoles={
          (jobRoles ?? []) as {
            id: string;
            name: string;
            is_placeholder: boolean;
          }[]
        }
        linkedRoleIds={Array.from(linkedRoleIds) as string[]}
        qualityAreaIds={tags.qualityAreas}
        childSafeStandardIds={tags.childSafeStandards}
        signOffCount={signCount ?? 0}
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
      />
    </div>
  );
}
