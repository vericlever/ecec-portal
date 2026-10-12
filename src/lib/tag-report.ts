// Shared metrics for the Child safety standards report and the Quality area
// report. One function (tagReportData) returns everything for a kind, a
// service selection and a period; the on-screen preview and the PDF both read
// its result, so the numbers always match.
//
// Principles carried from the build spec (Fix Reports section):
// - Outcomes data (staff flags, bulk uploads) is evidence of the cycle, never
//   a score. Nothing here classifies it as good or bad.
// - Procedure review status is the only place a gap appears.
// - Every reviewed procedure counts, whatever triggered the review.
// - Whole-of-service totals count each procedure once, however many areas it
//   is tagged to.
// - Flag counts of 0 to 3 are masked to "0-3" in this layer, before anything
//   is rendered, so a raw small count can never reach the PDF or the preview.
//   The same goes for the QIP statement, which is generated here.

import type { SupabaseClient } from "@supabase/supabase-js";
import { NQS_QUALITY_AREAS, CHILD_SAFE_STANDARDS, type TagOption } from "@/lib/tags";
import { fmtDateLong } from "@/lib/format-date";

type Client = SupabaseClient;

export type TagReportKind = "quality_area" | "child_safe_standard";

export const ALL_SERVICES_LABEL = "All Services";
export const WHOLE_OF_ORG_LABEL = "Whole-of-organisation upload";

// ---------------------------------------------------------------------------
// Small count rule
// ---------------------------------------------------------------------------

export type SmallCount = number | "0-3";

export function maskFlagCount(n: number): SmallCount {
  return n <= 3 ? "0-3" : n;
}

// ---------------------------------------------------------------------------
// Dates (plain calendar dates as YYYY-MM-DD strings, compared as strings)
// ---------------------------------------------------------------------------

function isoInZone(value: string | Date, timezone: string): string {
  return new Date(value).toLocaleDateString("en-CA", { timeZone: timezone });
}

function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

function addMonths(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1 + n, 1));
  const lastDay = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  first.setUTCDate(Math.min(d, lastDay));
  return first.toISOString().slice(0, 10);
}

function monthLabel(value: string, timezone: string): string {
  return new Date(value).toLocaleDateString("en-AU", { month: "long", year: "numeric", timeZone: timezone });
}

// ---------------------------------------------------------------------------
// Output types
// ---------------------------------------------------------------------------

export type ProcedureCounts = {
  aligned: number;
  reviewed: number;
  overdue: number;
  dueSoon: number;
  neverReviewed: number;
};

export type SignOffByRole = { role: string; counts: number[] };

export type UploadListing = {
  typeLabel: string;
  month: string;
  // Set when the upload is not tied to a service. Shown as a label in the
  // single service view, per the spec.
  wholeOfOrg: boolean;
  serviceName: string | null;
};

export type ProcedureRow = {
  id: string;
  name: string;
  roles: string[];
  policyNames: string[];
  lastReviewed: string | null; // long date, null when never reviewed
  nextDue: string | null; // long date, null when none set
  overdue: boolean;
  signOffPct: number | null; // null when no staff are required to sign
};

export type AreaReport = {
  option: TagOption;
  // Section 1, one entry per column.
  section1: ProcedureCounts[];
  // Section 2.
  section2: {
    pct: (number | null)[];
    signed: number[];
    required: number[];
    byRole: SignOffByRole[];
  };
  // Section 3, one entry per column except where noted.
  section3: {
    uploads: number[];
    flags: SmallCount[];
    uploadListing: UploadListing[]; // for the whole selection
    reflected: number[];
    reviewsDrew: number[];
  };
  // Section 4, for the whole selection.
  procedures: ProcedureRow[];
  // Section 5, auto-drafted. Editable before export.
  statement: string;
};

export type SummaryRow = { label: string; counts: ProcedureCounts };

export type TagReport = {
  kind: TagReportKind;
  title: string;
  serviceLabel: string;
  isAllServices: boolean;
  columns: string[]; // service names, then ALL_SERVICES_LABEL in the All Services view
  period: { start: string; end: string; months: number };
  asOf: string;
  summary: SummaryRow[]; // one per area, then a final row counting each procedure once
  areas: AreaReport[];
};

// ---------------------------------------------------------------------------
// Fetch helper (Supabase caps a response at 1000 rows)
// ---------------------------------------------------------------------------

async function fetchAll<T>(
  build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build(from, from + 999);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

const OUTCOME_TYPE_LABEL: Record<string, string> = {
  incident_reports: "Incident Reports",
  staff_feedback: "Staff Feedback",
  parent_feedback: "Parent Feedback",
  regulator: "Regulator Report / Documents",
  other: "Other",
};

// ---------------------------------------------------------------------------
// Pure helpers (exported for the check script)
// ---------------------------------------------------------------------------

export type ProcedureFacts = {
  reviewDates: string[]; // every recorded review, local YYYY-MM-DD
  nextDue: string | null;
};

export function countProcedures(
  procedures: ProcedureFacts[],
  asOf: string,
  period: { start: string; end: string },
): ProcedureCounts {
  const soonEnd = addDays(asOf, 90);
  const out: ProcedureCounts = { aligned: procedures.length, reviewed: 0, overdue: 0, dueSoon: 0, neverReviewed: 0 };
  for (const p of procedures) {
    if (p.reviewDates.some((d) => d >= period.start && d <= period.end)) out.reviewed += 1;
    if (p.reviewDates.length === 0) out.neverReviewed += 1;
    if (p.nextDue) {
      if (p.nextDue <= asOf) out.overdue += 1;
      else if (p.nextDue <= soonEnd) out.dueSoon += 1;
    }
  }
  return out;
}

function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many;
}

function joinList(items: string[]): string {
  // No Oxford comma.
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

export function buildStatement(input: {
  asOf: string;
  scopeLabel: string; // "All Services" or a service name
  periodMonths: number;
  code: string;
  counts: ProcedureCounts;
  hasFlags: boolean; // raw presence only, the number is never used
  uploadTypes: string[]; // labels, distinct
  reflected: number;
  reviewsDrew: number;
}): string {
  const { counts: c } = input;
  const place = input.scopeLabel === ALL_SERVICES_LABEL ? `across ${ALL_SERVICES_LABEL}` : `at ${input.scopeLabel}`;
  const head = `As at ${fmtDateLong(input.asOf)}, ${place}, `;
  if (c.aligned === 0) return `${head}no procedures are aligned to ${input.code}.`;

  const months = input.periodMonths === 12 ? "12 months" : `${input.periodMonths} months`;
  const parts = [
    `${head}${c.aligned} ${plural(c.aligned, "procedure is", "procedures are")} aligned to ${input.code}.`,
    `${c.reviewed} ${plural(c.reviewed, "was", "were")} reviewed in the past ${months}.`,
    `${c.overdue} ${plural(c.overdue, "is", "are")} overdue for review and ${c.dueSoon} ${plural(c.dueSoon, "falls", "fall")} due in the next 90 days.`,
  ];

  const items: { text: string; plural: boolean }[] = [];
  if (input.hasFlags) items.push({ text: "staff flags", plural: true });
  for (const t of input.uploadTypes) {
    const lower = t.toLowerCase();
    items.push({ text: lower, plural: /reports|documents/.test(lower) });
  }
  if (items.length > 0) {
    const names = joinList(items.map((i) => i.text));
    const subject = names.charAt(0).toUpperCase() + names.slice(1);
    const verb = items.length > 1 || items[0].plural ? "were" : "was";
    const steps = ["collected"];
    if (input.reflected > 0) steps.push("reflected on");
    if (input.reviewsDrew > 0) {
      steps.push(`used to inform ${input.reviewsDrew} procedure ${plural(input.reviewsDrew, "review", "reviews")}`);
    }
    parts.push(`${subject} ${verb} ${joinList(steps)}.`);
  }
  return parts.join(" ");
}

// ---------------------------------------------------------------------------
// The shared data function
// ---------------------------------------------------------------------------

type SopRow = { id: string; name: string; service_id: string | null; published_version: number; signoff_type: string };
type StatusRow = { sop_id: string; last_reviewed_at: string | null; next_review_date: string | null };
type PersonRow = { id: string; service_id: string | null };

export async function tagReportData(
  supabase: Client,
  params: {
    kind: TagReportKind;
    organisationId: string;
    timezone: string;
    // null = All Services.
    serviceId: string | null;
    periodMonths?: number;
    asOf?: string; // YYYY-MM-DD, defaults to today in the organisation's timezone
  },
): Promise<TagReport> {
  const { kind, organisationId: org, timezone } = params;
  const periodMonths = params.periodMonths ?? 12;
  const asOf = params.asOf ?? isoInZone(new Date(), timezone);
  const period = { start: addDays(addMonths(asOf, -periodMonths), 1), end: asOf, months: periodMonths };
  const options = kind === "quality_area" ? NQS_QUALITY_AREAS : CHILD_SAFE_STANDARDS;
  const tagTable = kind === "quality_area" ? "document_quality_areas" : "document_child_safe_standards";
  const tagColumn = kind === "quality_area" ? "quality_area_id" : "standard_id";

  const [
    { data: serviceRows },
    { data: sopRows },
    { data: statusRows },
    reviewRows,
    sopTagRows,
    policyTagRows,
    { data: linkRows },
    { data: policyRows },
    { data: peopleRows },
    { data: personRoleRows },
    { data: roleRows },
    { data: roleSopRows },
    signOffRows,
    { data: flagRows },
    { data: recordRows },
    { data: outcomeLinkRows },
    { data: policyFlagRows },
  ] = await Promise.all([
    supabase.from("services").select("id, name").eq("organisation_id", org).order("name"),
    supabase
      .from("sops")
      .select("id, name, service_id, published_version, signoff_type")
      .eq("organisation_id", org)
      .not("published_version", "is", null),
    supabase.from("sop_review_status").select("sop_id, last_reviewed_at, next_review_date").eq("organisation_id", org),
    fetchAll<{ id: string; sop_id: string; reviewed_at: string }>((from, to) =>
      supabase.from("sop_reviews").select("id, sop_id, reviewed_at").eq("organisation_id", org).range(from, to),
    ),
    fetchAll<Record<string, unknown>>((from, to) =>
      supabase.from(tagTable).select(`document_id, ${tagColumn}`).eq("organisation_id", org).eq("document_type", "sop").range(from, to),
    ),
    fetchAll<Record<string, unknown>>((from, to) =>
      supabase.from(tagTable).select(`document_id, ${tagColumn}`).eq("organisation_id", org).eq("document_type", "policy").range(from, to),
    ),
    supabase.from("policy_sop_links").select("policy_id, sop_id").eq("organisation_id", org),
    supabase.from("policies").select("id, name").eq("organisation_id", org),
    supabase.from("profiles").select("id, service_id").eq("organisation_id", org).eq("is_active", true),
    supabase.from("profile_job_roles").select("profile_id, job_role_id").eq("organisation_id", org),
    supabase.from("job_roles").select("id, name").eq("organisation_id", org),
    supabase.from("job_role_sops").select("job_role_id, sop_id").eq("organisation_id", org),
    fetchAll<{ user_id: string; sop_id: string; sop_version: number; verified_at: string | null }>((from, to) =>
      supabase.from("sign_offs").select("user_id, sop_id, sop_version, verified_at").eq("organisation_id", org).range(from, to),
    ),
    supabase.from("sop_outcome_flags").select("sop_id, created_at").eq("organisation_id", org),
    supabase.from("outcome_records").select("id, service_id, source_type, uploaded_at").eq("organisation_id", org).is("archived_at", null),
    supabase.from("outcome_record_links").select("record_id, sop_id, status, decided_at").eq("organisation_id", org),
    supabase
      .from("policy_flags")
      .select("policy_id, outcome_record_id, raised_at")
      .eq("organisation_id", org)
      .eq("source", "manager")
      .not("outcome_record_id", "is", null),
  ]);

  const services = (serviceRows ?? []) as { id: string; name: string }[];
  const singleService = params.serviceId ? services.find((s) => s.id === params.serviceId) : undefined;
  if (params.serviceId && !singleService) throw new Error("That service could not be found.");
  const isAllServices = !singleService;
  const serviceLabel = singleService ? singleService.name : ALL_SERVICES_LABEL;

  // Columns: one per service in scope, plus the combined "All Services" column
  // in the All Services view.
  type Column = { label: string; serviceId: string | null };
  const columns: Column[] = isAllServices
    ? [...services.map((s) => ({ label: s.name, serviceId: s.id })), { label: ALL_SERVICES_LABEL, serviceId: null }]
    : [{ label: singleService!.name, serviceId: singleService!.id }];
  const selectedIdx = columns.length - 1; // the selection itself: combined, or the one service
  const serviceName = new Map(services.map((s) => [s.id, s.name]));

  // ---- procedures ---------------------------------------------------------
  const sops = (sopRows ?? []) as SopRow[];
  const sopById = new Map(sops.map((s) => [s.id, s]));
  const statusBySop = new Map((statusRows ?? []).map((r) => [(r as StatusRow).sop_id, r as StatusRow]));
  const reviewsBySop = new Map<string, { id: string; reviewedAt: string; date: string }[]>();
  for (const r of reviewRows) {
    const list = reviewsBySop.get(r.sop_id) ?? [];
    list.push({ id: r.id, reviewedAt: r.reviewed_at, date: isoInZone(r.reviewed_at, timezone) });
    reviewsBySop.set(r.sop_id, list);
  }
  const facts = new Map<string, ProcedureFacts>();
  for (const s of sops) {
    const dates = (reviewsBySop.get(s.id) ?? []).map((r) => r.date);
    const last = statusBySop.get(s.id)?.last_reviewed_at;
    // sops.last_reviewed_at carries reviews recorded under the old model, so
    // it counts as a recorded review too (it is what "Last reviewed" shows).
    if (last) dates.push(isoInZone(last, timezone));
    facts.set(s.id, { reviewDates: dates, nextDue: statusBySop.get(s.id)?.next_review_date ?? null });
  }

  const appliesTo = (s: SopRow, serviceId: string | null) => serviceId === null || s.service_id === null || s.service_id === serviceId;

  const sopIdsByArea = new Map<number, Set<string>>();
  for (const r of sopTagRows) {
    const id = r.document_id as string;
    if (!sopById.has(id)) continue;
    const tag = r[tagColumn] as number;
    const set = sopIdsByArea.get(tag) ?? new Set<string>();
    set.add(id);
    sopIdsByArea.set(tag, set);
  }
  const policyIdsByArea = new Map<number, Set<string>>();
  for (const r of policyTagRows) {
    const tag = r[tagColumn] as number;
    const set = policyIdsByArea.get(tag) ?? new Set<string>();
    set.add(r.document_id as string);
    policyIdsByArea.set(tag, set);
  }

  // ---- policies, roles ----------------------------------------------------
  const policyName = new Map((policyRows ?? []).map((p) => [p.id as string, p.name as string]));
  const policyNamesBySop = new Map<string, string[]>();
  for (const l of linkRows ?? []) {
    const name = policyName.get(l.policy_id as string);
    if (!name) continue;
    const list = policyNamesBySop.get(l.sop_id as string) ?? [];
    list.push(name);
    policyNamesBySop.set(l.sop_id as string, list);
  }
  const roleName = new Map((roleRows ?? []).map((r) => [r.id as string, r.name as string]));
  const suiteByRole = new Map<string, Set<string>>();
  const rolesBySop = new Map<string, string[]>();
  for (const rs of roleSopRows ?? []) {
    const roleId = rs.job_role_id as string;
    const sopId = rs.sop_id as string;
    const set = suiteByRole.get(roleId) ?? new Set<string>();
    set.add(sopId);
    suiteByRole.set(roleId, set);
    const name = roleName.get(roleId);
    if (name) rolesBySop.set(sopId, [...(rolesBySop.get(sopId) ?? []), name]);
  }
  const roleIdsByPerson = new Map<string, string[]>();
  for (const r of personRoleRows ?? []) {
    const list = roleIdsByPerson.get(r.profile_id as string) ?? [];
    list.push(r.job_role_id as string);
    roleIdsByPerson.set(r.profile_id as string, list);
  }

  // ---- sign-offs. Same rule as staffStatsByProfile (the Service overview):
  // a person is required to sign the published procedures in the suite of any
  // of their job roles, and a self_and_manager procedure only counts once the
  // manager has countersigned (verified_at set).
  const signedByUser = new Map<string, Map<string, boolean>>();
  for (const s of signOffRows) {
    const m = signedByUser.get(s.user_id) ?? new Map<string, boolean>();
    m.set(`${s.sop_id}:${s.sop_version}`, Boolean(s.verified_at));
    signedByUser.set(s.user_id, m);
  }
  const people = (peopleRows ?? []) as PersonRow[];
  const isSigned = (personId: string, sop: SopRow): boolean => {
    const verified = signedByUser.get(personId)?.get(`${sop.id}:${sop.published_version}`);
    if (verified === undefined) return false;
    return sop.signoff_type === "self_and_manager" ? verified : true;
  };
  const requiredFor = (personId: string): Set<string> => {
    const out = new Set<string>();
    for (const roleId of roleIdsByPerson.get(personId) ?? []) {
      for (const sopId of suiteByRole.get(roleId) ?? []) if (sopById.has(sopId)) out.add(sopId);
    }
    return out;
  };
  const requiredByPerson = new Map(people.map((p) => [p.id, requiredFor(p.id)]));

  function signStats(serviceId: string | null, sopIds: Set<string>) {
    const scoped = people.filter((p) => serviceId === null || p.service_id === serviceId);
    let required = 0;
    let signed = 0;
    const byRole = new Map<string, number>();
    const perSop = new Map<string, { required: number; signed: number }>();
    for (const p of scoped) {
      const roles = [...(roleIdsByPerson.get(p.id) ?? [])]
        .map((id) => ({ id, name: roleName.get(id) ?? "Other" }))
        .sort((a, b) => a.name.localeCompare(b.name));
      for (const sopId of requiredByPerson.get(p.id) ?? []) {
        if (!sopIds.has(sopId)) continue;
        const sop = sopById.get(sopId)!;
        const row = perSop.get(sopId) ?? { required: 0, signed: 0 };
        row.required += 1;
        required += 1;
        if (isSigned(p.id, sop)) {
          row.signed += 1;
          signed += 1;
          // Attribute each sign-off to one role (the first, by name, that
          // grants the procedure) so the role counts add up to the total.
          const role = roles.find((r) => suiteByRole.get(r.id)?.has(sopId));
          byRole.set(role?.name ?? "Other", (byRole.get(role?.name ?? "Other") ?? 0) + 1);
        }
        perSop.set(sopId, row);
      }
    }
    return { required, signed, byRole, perSop };
  }

  // ---- outcomes data ------------------------------------------------------
  type Rec = { id: string; serviceId: string | null; type: string; uploadedAt: string; uploadedDate: string };
  const records = new Map<string, Rec>();
  for (const r of recordRows ?? []) {
    records.set(r.id as string, {
      id: r.id as string,
      serviceId: (r.service_id as string | null) ?? null,
      type: r.source_type as string,
      uploadedAt: r.uploaded_at as string,
      uploadedDate: isoInZone(r.uploaded_at as string, timezone),
    });
  }
  const inPeriod = (date: string) => date >= period.start && date <= period.end;
  // A record is in a column's scope when it is whole-of-organisation or
  // belongs to that service. The combined column takes everything.
  const recordInScope = (rec: Rec, serviceId: string | null) => serviceId === null || rec.serviceId === null || rec.serviceId === serviceId;

  const flags = (flagRows ?? []).map((f) => ({
    sopId: f.sop_id as string,
    createdAt: f.created_at as string,
    date: isoInZone(f.created_at as string, timezone),
  }));
  const links = (outcomeLinkRows ?? [])
    .filter((l) => records.has(l.record_id as string))
    .map((l) => ({
      recordId: l.record_id as string,
      sopId: l.sop_id as string,
      status: l.status as string,
      decidedAt: (l.decided_at as string | null) ?? null,
    }));
  const policyFlags = (policyFlagRows ?? [])
    .filter((f) => records.has(f.outcome_record_id as string))
    .map((f) => ({
      policyId: f.policy_id as string,
      recordId: f.outcome_record_id as string,
      date: isoInZone(f.raised_at as string, timezone),
    }));

  // ---- per area -----------------------------------------------------------
  const allTaggedSopIds = new Set<string>();
  const areas: AreaReport[] = options.map((option) => {
    const tagged = sopIdsByArea.get(option.id) ?? new Set<string>();
    for (const id of tagged) allTaggedSopIds.add(id);
    const areaSops = [...tagged].map((id) => sopById.get(id)!);

    const inColumn = (col: Column) => areaSops.filter((s) => appliesTo(s, col.serviceId));
    const section1 = columns.map((col) =>
      countProcedures(inColumn(col).map((s) => facts.get(s.id)!), asOf, period),
    );

    const signCols = columns.map((col) => signStats(col.serviceId, new Set(inColumn(col).map((s) => s.id))));
    const roleNames = [...new Set(signCols.flatMap((c) => [...c.byRole.keys()]))].sort((a, b) => a.localeCompare(b));
    const section2 = {
      pct: signCols.map((c) => (c.required > 0 ? Math.round((c.signed / c.required) * 100) : null)),
      signed: signCols.map((c) => c.signed),
      required: signCols.map((c) => c.required),
      byRole: roleNames.map((role) => ({ role, counts: signCols.map((c) => c.byRole.get(role) ?? 0) })),
    };

    // Section 3. Uploads relate to this area through links (suggested or
    // confirmed, never dismissed) to a procedure tagged to it.
    const areaLinks = links.filter((l) => tagged.has(l.sopId) && l.status !== "dismissed");
    const areaPolicies = policyIdsByArea.get(option.id) ?? new Set<string>();
    const uploads: number[] = [];
    const flagCounts: SmallCount[] = [];
    const reflected: number[] = [];
    const reviewsDrew: number[] = [];
    for (const col of columns) {
      const colSopIds = new Set(inColumn(col).map((s) => s.id));
      const recIds = new Set(
        areaLinks
          .map((l) => records.get(l.recordId)!)
          .filter((r) => inPeriod(r.uploadedDate) && recordInScope(r, col.serviceId))
          .map((r) => r.id),
      );
      uploads.push(recIds.size);

      // Staff flags carry no service, so each one is whole-of-organisation.
      flagCounts.push(maskFlagCount(flags.filter((f) => colSopIds.has(f.sopId) && inPeriod(f.date)).length));

      const confirmed = links.filter(
        (l) =>
          l.status === "confirmed" &&
          colSopIds.has(l.sopId) &&
          l.decidedAt &&
          inPeriod(isoInZone(l.decidedAt, timezone)) &&
          recordInScope(records.get(l.recordId)!, col.serviceId),
      ).length;
      const flaggedPolicies = policyFlags.filter(
        (f) => areaPolicies.has(f.policyId) && inPeriod(f.date) && recordInScope(records.get(f.recordId)!, col.serviceId),
      ).length;
      reflected.push(confirmed + flaggedPolicies);

      // Reviews in the period of a procedure that had a staff flag, or a
      // confirmed upload link, dated before the review.
      let drew = 0;
      for (const sopId of colSopIds) {
        for (const rev of reviewsBySop.get(sopId) ?? []) {
          if (!inPeriod(rev.date)) continue;
          const t = new Date(rev.reviewedAt).getTime();
          const fromFlag = flags.some((f) => f.sopId === sopId && new Date(f.createdAt).getTime() < t);
          const fromLink = links.some(
            (l) =>
              l.sopId === sopId &&
              l.status === "confirmed" &&
              l.decidedAt &&
              new Date(l.decidedAt).getTime() < t &&
              recordInScope(records.get(l.recordId)!, col.serviceId),
          );
          if (fromFlag || fromLink) drew += 1;
        }
      }
      reviewsDrew.push(drew);
    }

    const selCol = columns[selectedIdx];
    const selSopIds = new Set(inColumn(selCol).map((s) => s.id));
    const listedRecords = [
      ...new Map(
        areaLinks
          .map((l) => records.get(l.recordId)!)
          .filter((r) => inPeriod(r.uploadedDate) && recordInScope(r, selCol.serviceId))
          .map((r) => [r.id, r] as const),
      ).values(),
    ].sort((a, b) => a.uploadedAt.localeCompare(b.uploadedAt));
    const uploadListing: UploadListing[] = listedRecords.map((r) => ({
      typeLabel: OUTCOME_TYPE_LABEL[r.type] ?? r.type,
      month: monthLabel(r.uploadedAt, timezone),
      wholeOfOrg: r.serviceId === null,
      serviceName: r.serviceId ? (serviceName.get(r.serviceId) ?? null) : null,
    }));

    // Section 4.
    const selStats = signCols[selectedIdx];
    const procedures: ProcedureRow[] = [...selSopIds].map((id) => {
      const s = sopById.get(id)!;
      const f = facts.get(id)!;
      const last = statusBySop.get(id)?.last_reviewed_at ?? null;
      const per = selStats.perSop.get(id);
      return {
        id,
        name: s.name,
        roles: [...new Set(rolesBySop.get(id) ?? [])].sort((a, b) => a.localeCompare(b)),
        policyNames: [...new Set(policyNamesBySop.get(id) ?? [])].sort((a, b) => a.localeCompare(b)),
        lastReviewed: last ? fmtDateLong(isoInZone(last, timezone)) : f.reviewDates.length > 0 ? fmtDateLong([...f.reviewDates].sort().pop()!) : null,
        nextDue: f.nextDue ? fmtDateLong(f.nextDue) : null,
        overdue: Boolean(f.nextDue && f.nextDue <= asOf),
        signOffPct: per && per.required > 0 ? Math.round((per.signed / per.required) * 100) : null,
      };
    });
    // Overdue first, then by next due date (none last), then by name.
    const dueKey = (id: string) => facts.get(id)!.nextDue ?? "9999-12-31";
    procedures.sort((a, b) => {
      if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
      const d = dueKey(a.id).localeCompare(dueKey(b.id));
      return d !== 0 ? d : a.name.localeCompare(b.name);
    });

    const rawFlagsInSelection = flags.filter((f) => selSopIds.has(f.sopId) && inPeriod(f.date)).length;
    const statement = buildStatement({
      asOf,
      scopeLabel: serviceLabel,
      periodMonths,
      code: option.code,
      counts: section1[selectedIdx],
      hasFlags: rawFlagsInSelection > 0,
      uploadTypes: [...new Set(uploadListing.map((u) => u.typeLabel))],
      reflected: reflected[selectedIdx],
      reviewsDrew: reviewsDrew[selectedIdx],
    });

    return { option, section1, section2, section3: { uploads, flags: flagCounts, uploadListing, reflected, reviewsDrew }, procedures, statement };
  });

  // Summary: the selection's section 1 counts per area, then a total that
  // counts each procedure once however many areas it is tagged to.
  const selCol = columns[selectedIdx];
  const summary: SummaryRow[] = areas.map((a) => ({
    label: `${a.option.code} ${a.option.name}`,
    counts: a.section1[selectedIdx],
  }));
  const uniqueSops = [...allTaggedSopIds].map((id) => sopById.get(id)!).filter((s) => appliesTo(s, selCol.serviceId));
  summary.push({
    label: "All areas (each procedure counted once)",
    counts: countProcedures(uniqueSops.map((s) => facts.get(s.id)!), asOf, period),
  });

  return {
    kind,
    title: kind === "quality_area" ? "Quality area report" : "Child safety standards report",
    serviceLabel,
    isAllServices,
    columns: columns.map((c) => c.label),
    period,
    asOf,
    summary,
    areas,
  };
}
