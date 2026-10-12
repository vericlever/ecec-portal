import Link from "next/link";
import { requireManager } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fmtReviewDate } from "@/lib/sop-review";
import { sopReviewStatusMap } from "@/lib/sop-review-status";
import { ToSortItem } from "./to-sort-item";
import { ArchiveRecordButton } from "./archive-record-button";
import { EditableReviewDate } from "./editable-review-date";
import { UnlinkedRecordItem } from "./unlinked-record-item";
import { CollapsibleSection } from "./collapsible-section";

export const dynamic = "force-dynamic";

const SOURCE_TYPE_LABEL: Record<string, string> = {
  incident_reports: "Incident Reports",
  staff_feedback: "Staff Feedback",
  parent_feedback: "Parent Feedback",
  regulator: "Regulator Report / Documents",
  other: "Other",
};

export default async function OurOutcomesPage(props: {
  searchParams: Promise<{ showArchived?: string; sourceType?: string; serviceId?: string }>;
}) {
  await requireManager();
  const searchParams = await props.searchParams;
  const showArchived = searchParams.showArchived === "1";
  const supabase = createClient();

  // --- To sort: suggested links awaiting a decision ---
  const { data: suggestedLinks } = await supabase
    .from("outcome_record_links")
    .select("id, record_id, sop_id, reason, ai_suggested_sop_id, evidence")
    .eq("status", "suggested")
    .order("id", { ascending: false });

  const recordIds = [...new Set((suggestedLinks ?? []).map((l) => l.record_id as string))];
  const sopIdsInLinks = [...new Set((suggestedLinks ?? []).map((l) => l.sop_id as string))];

  const [{ data: linkedRecords }, { data: linkedSops }] = await Promise.all([
    recordIds.length
      ? supabase.from("outcome_records").select("id, service_id, source_type, period_start, period_end").in("id", recordIds)
      : Promise.resolve({ data: [] as { id: string; service_id: string | null; source_type: string; period_start: string; period_end: string }[] }),
    sopIdsInLinks.length
      ? supabase.from("sops").select("id, name").in("id", sopIdsInLinks)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
  ]);
  const recordById = new Map((linkedRecords ?? []).map((r) => [r.id as string, r]));
  const sopNameById = new Map((linkedSops ?? []).map((s) => [s.id as string, s.name as string]));
  const toSortServiceIds = [...new Set((linkedRecords ?? []).map((r) => r.service_id as string | null).filter(Boolean))] as string[];
  const { data: toSortServices } = toSortServiceIds.length
    ? await supabase.from("services").select("id, name").in("id", toSortServiceIds)
    : { data: [] as { id: string; name: string }[] };
  const toSortServiceName = new Map((toSortServices ?? []).map((s) => [s.id as string, s.name as string]));

  const toSort = (suggestedLinks ?? [])
    .map((l) => {
      const record = recordById.get(l.record_id as string);
      if (!record) return null;
      return {
        linkId: l.id as string,
        recordId: l.record_id as string,
        sopId: l.sop_id as string,
        sopName: sopNameById.get(l.sop_id as string) ?? "Unknown procedure",
        reason: l.reason as string | null,
        sourceType: record.source_type as string,
        serviceLabel: record.service_id ? toSortServiceName.get(record.service_id as string) ?? "" : "All services",
        periodStart: record.period_start as string,
        periodEnd: record.period_end as string,
        evidence: ((l.evidence as { line: number; excerpt: string }[] | null) ?? []),
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  // --- To sort, part two: active records with no link of any status ---
  // (the AI nominated nothing usable). A dismissed link still counts as a
  // decision, so only records with no link rows at all appear here.
  const { data: activeRecords } = await supabase
    .from("outcome_records")
    .select("id, service_id, source_type, period_start, period_end, redacted_body")
    .is("archived_at", null)
    .order("uploaded_at", { ascending: false });
  const activeIds = (activeRecords ?? []).map((r) => r.id as string);
  const { data: anyLinks } = activeIds.length
    ? await supabase.from("outcome_record_links").select("record_id").in("record_id", activeIds)
    : { data: [] as { record_id: string }[] };
  const linkedRecordIds = new Set((anyLinks ?? []).map((l) => l.record_id as string));
  const unlinked = (activeRecords ?? []).filter((r) => !linkedRecordIds.has(r.id as string));
  const unlinkedServiceIds = [...new Set(unlinked.map((r) => r.service_id as string | null).filter(Boolean))] as string[];
  const { data: unlinkedServices } = unlinkedServiceIds.length
    ? await supabase.from("services").select("id, name").in("id", unlinkedServiceIds)
    : { data: [] as { id: string; name: string }[] };
  const unlinkedServiceName = new Map((unlinkedServices ?? []).map((s) => [s.id as string, s.name as string]));

  // --- Data outcome flags: confirmed links no review has absorbed yet ---
  // Same set the procedure's review form lists as linked records.
  const { data: dataLinks } = await supabase
    .from("outcome_record_links")
    .select("id, record_id, sop_id, reason, evidence, decided_at")
    .eq("status", "confirmed")
    .is("review_id", null)
    .order("decided_at", { ascending: false });
  const dataLinkRecordIds = [...new Set((dataLinks ?? []).map((l) => l.record_id as string))];
  const dataLinkSopIds = [...new Set((dataLinks ?? []).map((l) => l.sop_id as string))];
  const [{ data: dataLinkRecords }, { data: dataLinkSops }] = await Promise.all([
    dataLinkRecordIds.length
      ? supabase.from("outcome_records").select("id, service_id, source_type, period_start, period_end").in("id", dataLinkRecordIds)
      : Promise.resolve({ data: [] as { id: string; service_id: string | null; source_type: string; period_start: string; period_end: string }[] }),
    dataLinkSopIds.length
      ? supabase.from("sops").select("id, name").in("id", dataLinkSopIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
  ]);
  const dataLinkServiceIds = [...new Set((dataLinkRecords ?? []).map((r) => r.service_id as string | null).filter(Boolean))] as string[];
  const { data: dataLinkServices } = dataLinkServiceIds.length
    ? await supabase.from("services").select("id, name").in("id", dataLinkServiceIds)
    : { data: [] as { id: string; name: string }[] };
  const dataLinkServiceName = new Map((dataLinkServices ?? []).map((x) => [x.id as string, x.name as string]));
  const dataLinkRecordById = new Map((dataLinkRecords ?? []).map((r) => [r.id as string, r]));
  const dataLinkSopName = new Map((dataLinkSops ?? []).map((x) => [x.id as string, x.name as string]));
  const dataFlags = (dataLinks ?? [])
    .map((l) => {
      const r = dataLinkRecordById.get(l.record_id as string);
      if (!r) return null;
      return {
        id: l.id as string,
        sopId: l.sop_id as string,
        sopName: dataLinkSopName.get(l.sop_id as string) ?? "Unknown procedure",
        reason: l.reason as string | null,
        evidence: ((l.evidence as { line: number; excerpt: string }[] | null) ?? []),
        sourceLabel: SOURCE_TYPE_LABEL[r.source_type as string] ?? (r.source_type as string),
        serviceLabel: r.service_id ? dataLinkServiceName.get(r.service_id as string) ?? "" : "All services",
        periodStart: r.period_start as string,
        periodEnd: r.period_end as string,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  // --- Staff outcome flags: unchanged from the previous page ---
  const { data: flags } = await supabase
    .from("sop_outcome_flags")
    .select("id, sop_id, reflection, created_at, flagged_by")
    .is("resolved_at", null)
    .order("created_at", { ascending: false });
  const flagSopIds = [...new Set((flags ?? []).map((f) => f.sop_id as string))];
  const flaggerIds = [...new Set((flags ?? []).map((f) => f.flagged_by as string))];
  const [{ data: flagSops }, { data: flaggers }] = await Promise.all([
    flagSopIds.length
      ? supabase.from("sops").select("id, name").in("id", flagSopIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    flaggerIds.length
      ? supabase.from("profiles").select("id, full_name").in("id", flaggerIds)
      : Promise.resolve({ data: [] as { id: string; full_name: string }[] }),
  ]);
  const flagSopName = new Map((flagSops ?? []).map((s) => [s.id as string, s.name as string]));
  const flaggerName = new Map((flaggers ?? []).map((p) => [p.id as string, p.full_name as string]));

  // --- Policy flags: open, newest first ---
  const { data: policyFlags } = await supabase
    .from("policy_flags")
    .select("id, policy_id, note, source, raised_by, raised_at")
    .is("cleared_at", null)
    .order("raised_at", { ascending: false });
  const flagPolicyIds = [...new Set((policyFlags ?? []).map((f) => f.policy_id as string))];
  const flagRaiserIds = [...new Set((policyFlags ?? []).map((f) => f.raised_by as string))];
  const [{ data: flagPolicies }, { data: flagRaisers }] = await Promise.all([
    flagPolicyIds.length
      ? supabase.from("policies").select("id, name").in("id", flagPolicyIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    flagRaiserIds.length
      ? supabase.from("profiles").select("id, full_name").in("id", flagRaiserIds)
      : Promise.resolve({ data: [] as { id: string; full_name: string }[] }),
  ]);
  const flagPolicyName = new Map((flagPolicies ?? []).map((p) => [p.id as string, p.name as string]));
  const flagRaiserName = new Map((flagRaisers ?? []).map((p) => [p.id as string, p.full_name as string]));

  // --- Outcome records: all, filterable, archived hidden by default ---
  let recordsQuery = supabase
    .from("outcome_records")
    .select("id, service_id, source_type, period_start, period_end, uploaded_at, archived_at")
    .order("uploaded_at", { ascending: false });
  if (!showArchived) recordsQuery = recordsQuery.is("archived_at", null);
  const typeFilter = searchParams.sourceType && SOURCE_TYPE_LABEL[searchParams.sourceType] ? searchParams.sourceType : null;
  if (typeFilter) recordsQuery = recordsQuery.eq("source_type", typeFilter);
  if (searchParams.serviceId) recordsQuery = recordsQuery.eq("service_id", searchParams.serviceId);
  const { data: allRecords } = await recordsQuery;
  const serviceIds = [...new Set((allRecords ?? []).map((r) => r.service_id as string).filter(Boolean))];
  const { data: services } = serviceIds.length
    ? await supabase.from("services").select("id, name").in("id", serviceIds)
    : { data: [] as { id: string; name: string }[] };
  const serviceName = new Map((services ?? []).map((s) => [s.id as string, s.name as string]));

  // Which procedures each listed record has been linked to (confirmed only -
  // a suggestion or a dismissal is not a link). review_id set means a review
  // has already absorbed it.
  const listedRecordIds = (allRecords ?? []).map((r) => r.id as string);
  const { data: confirmedLinks } = listedRecordIds.length
    ? await supabase
        .from("outcome_record_links")
        .select("record_id, sop_id, review_id")
        .eq("status", "confirmed")
        .in("record_id", listedRecordIds)
    : { data: [] as { record_id: string; sop_id: string; review_id: string | null }[] };
  const confirmedSopIds = [...new Set((confirmedLinks ?? []).map((l) => l.sop_id as string))];
  const { data: confirmedSops } = confirmedSopIds.length
    ? await supabase.from("sops").select("id, name").in("id", confirmedSopIds)
    : { data: [] as { id: string; name: string }[] };
  const confirmedSopName = new Map((confirmedSops ?? []).map((x) => [x.id as string, x.name as string]));
  const linksByRecord = new Map<string, { name: string; reviewed: boolean }[]>();
  for (const l of confirmedLinks ?? []) {
    const k = l.record_id as string;
    const list = linksByRecord.get(k) ?? [];
    list.push({ name: confirmedSopName.get(l.sop_id as string) ?? "Unknown procedure", reviewed: Boolean(l.review_id) });
    linksByRecord.set(k, list);
  }

  // --- Procedure schedule: every procedure, sorted by next review date ---
  const { data: sops } = await supabase
    .from("sops")
    .select("id, name, published_version")
    .not("published_version", "is", null)
    .order("name");
  const statusMap = await sopReviewStatusMap(supabase);

  const { data: allLinks } = await supabase
    .from("outcome_record_links")
    .select("sop_id, status")
    .eq("status", "confirmed")
    .is("review_id", null);
  const { data: allOpenFlags } = await supabase
    .from("sop_outcome_flags")
    .select("sop_id")
    .is("resolved_at", null);
  const linkedCountBySop = new Map<string, number>();
  for (const l of allLinks ?? []) {
    const k = l.sop_id as string;
    linkedCountBySop.set(k, (linkedCountBySop.get(k) ?? 0) + 1);
  }
  for (const f of allOpenFlags ?? []) {
    const k = f.sop_id as string;
    linkedCountBySop.set(k, (linkedCountBySop.get(k) ?? 0) + 1);
  }

  const schedule = (sops ?? [])
    .map((s) => ({
      id: s.id as string,
      name: s.name as string,
      nextReviewDate: statusMap.get(s.id as string)?.nextReviewDate ?? null,
      waitingCount: linkedCountBySop.get(s.id as string) ?? 0,
    }))
    .sort((a, b) => {
      if (!a.nextReviewDate) return 1;
      if (!b.nextReviewDate) return -1;
      return a.nextReviewDate.localeCompare(b.nextReviewDate);
    });

  return (
    <div className="max-w-4xl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Our Outcomes</h1>
          <p className="mt-1 text-sm text-slate-500">
            Outcome data and staff feedback for reviewing our procedures.
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/admin/our-outcomes/upload"
            className="rounded-md bg-ink px-3 py-1.5 text-xs font-medium text-white"
          >
            Upload outcome data
          </Link>
          <Link
            href="/admin/our-outcomes/review-policies"
            className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700"
          >
            Review policies
          </Link>
        </div>
      </div>

      {/* To sort */}
      <CollapsibleSection id="to-sort" title="To sort" count={toSort.length + unlinked.length} defaultOpen={toSort.length + unlinked.length > 0}>
        {toSort.length === 0 && unlinked.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">Nothing waiting on a link decision.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {unlinked.map((r) => (
              <UnlinkedRecordItem
                key={r.id as string}
                recordId={r.id as string}
                sourceTypeLabel={SOURCE_TYPE_LABEL[r.source_type as string] ?? (r.source_type as string)}
                serviceLabel={r.service_id ? unlinkedServiceName.get(r.service_id as string) ?? "" : "All services"}
                periodStart={r.period_start as string}
                periodEnd={r.period_end as string}
                preview={(r.redacted_body as string).slice(0, 200)}
              />
            ))}
            {toSort.map((item) => (
              <ToSortItem
                key={item.linkId}
                linkId={item.linkId}
                sopId={item.sopId}
                sopName={item.sopName}
                reason={item.reason}
                sourceTypeLabel={SOURCE_TYPE_LABEL[item.sourceType] ?? item.sourceType}
                serviceLabel={item.serviceLabel}
                periodStart={item.periodStart}
                periodEnd={item.periodEnd}
                evidence={item.evidence}
              />
            ))}
          </ul>
        )}
      </CollapsibleSection>

      {/* Data outcome flags: one per procedure an upload has been confirmed against */}
      <CollapsibleSection id="data-flags" title="Data outcome flags" count={dataFlags.length} defaultOpen>
        {dataFlags.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">Nothing outstanding.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {dataFlags.map((d) => (
              <li key={d.id} className="rounded-lg border border-slate-200 bg-white p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <Link href={`/admin/sops/${d.sopId}/review`} className="text-sm font-medium text-slate-800 underline">
                    {d.sopName}
                  </Link>
                  <span className="text-xs text-slate-400">
                    {d.sourceLabel} · {d.serviceLabel} · {fmtReviewDate(d.periodStart)} to {fmtReviewDate(d.periodEnd)}
                  </span>
                </div>
                {d.reason ? <p className="mt-1.5 text-sm italic text-slate-600">&ldquo;{d.reason}&rdquo;</p> : null}
                {d.evidence.length > 0 ? (
                  <ul className="mt-2 space-y-1 border-l-2 border-slate-200 pl-3">
                    {d.evidence.map((e, i) => (
                      <li key={i} className="text-xs text-slate-600">
                        <span className="text-slate-400">Line {e.line}: </span>&ldquo;{e.excerpt}&rdquo;
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-1.5 text-xs text-slate-400">Linked by hand, no cited excerpts.</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </CollapsibleSection>

      {/* Staff outcome flags */}
      <CollapsibleSection id="staff-flags" title="Staff outcome flags" count={(flags ?? []).length}>
        {(flags ?? []).length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">Nothing outstanding.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {(flags ?? []).map((f) => (
              <li key={f.id as string} className="rounded-lg border border-slate-200 bg-white p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <Link href={`/admin/sops/${f.sop_id}/review`} className="text-sm font-medium text-slate-800 underline">
                    {flagSopName.get(f.sop_id as string) ?? "Unknown procedure"}
                  </Link>
                  <span className="text-xs text-slate-400">
                    {flaggerName.get(f.flagged_by as string) ?? "A staff member"} · {fmtReviewDate(f.created_at as string)}
                  </span>
                </div>
                <p className="mt-1.5 text-sm text-slate-700">{f.reflection as string}</p>
              </li>
            ))}
          </ul>
        )}
      </CollapsibleSection>

      {/* Policy flags */}
      <CollapsibleSection
        id="policy-flags"
        title="Policy flags"
        count={(policyFlags ?? []).length}
        actions={
          <Link href="/admin/our-outcomes/flag-policy" className="text-xs font-medium text-ink underline">
            Flag a policy
          </Link>
        }
      >
        {(policyFlags ?? []).length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">No open policy flags.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {(policyFlags ?? []).map((f) => (
              <li key={f.id as string} className="rounded-lg border border-slate-200 bg-white p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-sm font-medium text-slate-800">
                    {flagPolicyName.get(f.policy_id as string) ?? "Unknown policy"}
                  </span>
                  <span className="text-xs text-slate-400">
                    {flagRaiserName.get(f.raised_by as string) ?? "A manager"} · {fmtReviewDate(f.raised_at as string)} ·{" "}
                    {f.source === "procedure_review" ? "from a procedure review" : "raised directly"}
                  </span>
                </div>
                <p className="mt-1.5 text-sm text-slate-700">{f.note as string}</p>
              </li>
            ))}
          </ul>
        )}
      </CollapsibleSection>

      {/* Procedure schedule */}
      <CollapsibleSection id="procedure-schedule" title="Procedure schedule">
        <ul className="mt-3 space-y-2">
          {schedule.map((s) => (
            <li
              key={s.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white p-3 text-sm"
            >
              <Link href={`/admin/sops/${s.id}/review`} className="font-medium text-slate-800 underline">
                {s.name}
              </Link>
              <div className="flex items-center gap-3 text-xs text-slate-500">
                <span>{s.waitingCount > 0 ? `${s.waitingCount} waiting` : "Nothing waiting"}</span>
                <EditableReviewDate itemType="sop" itemId={s.id} currentDate={s.nextReviewDate} />
              </div>
            </li>
          ))}
        </ul>
      </CollapsibleSection>

      {/* Data uploads: the uploaded files themselves, as saved */}
      <CollapsibleSection
        id="data-uploads"
        title="Data uploads"
        count={(allRecords ?? []).length}
        actions={
          <Link
            href={`?showArchived=${showArchived ? "0" : "1"}`}
            className="text-xs font-medium text-slate-500 underline"
          >
            {showArchived ? "Hide archived" : "Show archived"}
          </Link>
        }
      >
        <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
          {[["", "All types"], ...Object.entries(SOURCE_TYPE_LABEL)].map(([value, label]) => {
            const params = new URLSearchParams();
            if (showArchived) params.set("showArchived", "1");
            if (value) params.set("sourceType", value);
            if (searchParams.serviceId) params.set("serviceId", searchParams.serviceId);
            const active = (typeFilter ?? "") === value;
            return (
              <Link
                key={value || "all"}
                href={`?${params.toString()}`}
                className={`rounded-full border px-2.5 py-0.5 ${active ? "border-ink bg-ink text-white" : "border-slate-300 text-slate-600"}`}
              >
                {label}
              </Link>
            );
          })}
        </div>
        {(allRecords ?? []).length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">No data uploads yet.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {(allRecords ?? []).map((r) => (
              <li
                key={r.id as string}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white p-3 text-sm"
              >
                <div>
                  <span className="font-medium text-slate-800">
                    {SOURCE_TYPE_LABEL[r.source_type as string] ?? (r.source_type as string)}
                  </span>
                  <span className="ml-2 text-slate-400">
                    {r.service_id ? serviceName.get(r.service_id as string) ?? "" : "All services"} ·{" "}
                    {fmtReviewDate(r.period_start as string)} to {fmtReviewDate(r.period_end as string)}
                  </span>
                  {r.archived_at ? <span className="ml-2 text-xs text-slate-400">(archived)</span> : null}
                  <p className="mt-1 text-xs text-slate-500">
                    {(linksByRecord.get(r.id as string) ?? []).length === 0
                      ? "Not linked to any procedure"
                      : "Linked to: " +
                        (linksByRecord.get(r.id as string) ?? [])
                          .map((l) => (l.reviewed ? `${l.name} (reviewed)` : l.name))
                          .join(", ")}
                  </p>
                </div>
                {!r.archived_at && <ArchiveRecordButton recordId={r.id as string} />}
              </li>
            ))}
          </ul>
        )}
      </CollapsibleSection>

    </div>
  );
}
