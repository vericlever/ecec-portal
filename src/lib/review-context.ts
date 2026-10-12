// Step 59, B7: the three additions at the top of the review form - linked
// records/flags, the automatic trigger, and the AI-proposed reason line.
// Kept as one module since all three need the same underlying queries
// (confirmed-but-unattached outcome links, open staff flags, and whether the
// review date moved since the last review).

import type { SupabaseClient } from "@supabase/supabase-js";
import { generateText } from "@/lib/ai/client";

export type ReviewTrigger = "scheduled" | "outcome_data" | "staff_feedback" | "management_decision";

export type LinkedItem = {
  kind: "outcome_record" | "staff_flag";
  id: string;
  summary: string;
};

export type ReviewContext = {
  trigger: ReviewTrigger;
  reason: string;
  linkedItems: LinkedItem[];
  linkedRecordIds: string[];
  linkedFlagIds: string[];
};

const SOURCE_TYPE_LABEL: Record<string, string> = {
  incident_reports: "Incident Reports",
  staff_feedback: "Staff Feedback",
  parent_feedback: "Parent Feedback",
  regulator: "Regulator Report / Documents",
  other: "Other",
};

const NO_DATA_REASON = "Scheduled review. No outcome data or staff feedback in the period.";

export async function buildReviewContext(
  supabase: SupabaseClient,
  organisationId: string,
  sopId: string,
  lastReviewedAt: string | null,
): Promise<ReviewContext> {
  const [{ data: links }, { data: flags }, { data: dateChanges }] = await Promise.all([
    supabase
      .from("outcome_record_links")
      .select("id, record_id, reason, evidence")
      .eq("sop_id", sopId)
      .eq("status", "confirmed")
      .is("review_id", null),
    supabase
      .from("sop_outcome_flags")
      .select("id, reflection")
      .eq("sop_id", sopId)
      .is("resolved_at", null),
    supabase
      .from("review_date_changes")
      .select("id")
      .eq("item_type", "sop")
      .eq("item_id", sopId)
      .gt("changed_at", lastReviewedAt ?? "1970-01-01"),
  ]);

  const recordIds = [...new Set((links ?? []).map((l) => l.record_id as string))];
  const { data: records } = recordIds.length
    ? await supabase.from("outcome_records").select("id, source_type, period_start, period_end").in("id", recordIds)
    : { data: [] as { id: string; source_type: string; period_start: string; period_end: string }[] };
  const recordById = new Map((records ?? []).map((r) => [r.id as string, r]));

  const linkedItems: LinkedItem[] = [];
  for (const l of links ?? []) {
    const record = recordById.get(l.record_id as string);
    if (!record) continue;
    const excerpts = ((l.evidence as { line: number; excerpt: string }[] | null) ?? [])
      .map((e) => `"${e.excerpt}"`)
      .join("; ");
    const label = SOURCE_TYPE_LABEL[record.source_type as string] ?? (record.source_type as string);
    linkedItems.push({
      kind: "outcome_record",
      id: l.id as string,
      summary: `${label} (${record.period_start} to ${record.period_end}): ${excerpts || (l.reason as string | null) || "no cited evidence"}`,
    });
  }
  for (const f of flags ?? []) {
    linkedItems.push({ kind: "staff_flag", id: f.id as string, summary: f.reflection as string });
  }

  const dateChanged = (dateChanges ?? []).length > 0;
  const hasRecords = recordIds.length > 0;
  const hasFlags = (flags ?? []).length > 0;

  let trigger: ReviewTrigger;
  if (dateChanged) trigger = "management_decision";
  else if (hasRecords) trigger = "outcome_data";
  else if (hasFlags) trigger = "staff_feedback";
  else trigger = "scheduled";

  let reason: string;
  if (linkedItems.length === 0) {
    reason = NO_DATA_REASON;
  } else {
    const summary = linkedItems.map((i) => `- ${i.summary}`).join("\n");
    try {
      reason = (
        await generateText({
          feature: "review_reason",
          organisationId,
          systemPrompt:
            "You write one short sentence summarising why a workplace procedure is being reviewed, based on the outcome records and staff feedback linked to it. Plain, factual, no speculation beyond what's given.",
          userMessage: summary,
          maxTokens: 100,
        })
      ).trim();
    } catch (e) {
      console.error("proposeReasonLine failed:", e);
      reason = `Review prompted by ${linkedItems.length} linked item${linkedItems.length === 1 ? "" : "s"}.`;
    }
  }

  return {
    trigger,
    reason,
    linkedItems,
    linkedRecordIds: (links ?? []).map((l) => l.id as string),
    linkedFlagIds: (flags ?? []).map((f) => f.id as string),
  };
}
