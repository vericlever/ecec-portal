// Data-gathering for the Reports page (Steps 30-38). Each function returns
// plain data a PDF template or the coverage page can render; nothing here
// talks React or PDF. Every query goes through the caller's RLS-scoped
// client, so a Manager (policy) never sees rows outside their reach even if a
// route forgets to apply resolveReportScope.

import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/auth";
import { isAdmin } from "@/lib/roles";
import { documentTagsFor } from "@/lib/document-tags";
import {
  NQS_QUALITY_AREAS,
  CHILD_SAFE_STANDARDS,
  type TagOption,
} from "@/lib/tags";
import { reviewState } from "@/lib/sop-review";
import { expiringCredentials, type CredentialAlert } from "@/lib/credentials";
import { contractAlerts, renewalState, type ContractRow } from "@/lib/contracts";
import { staffStatsByProfile, summariseTeam } from "@/lib/staff-stats";
import { unsignedAgreementsByProfile } from "@/lib/agreements";

type ServerClient = ReturnType<typeof createClient>;

// ---------------------------------------------------------------------------
// Service scope. Admin may request any service or "all" (null); every other
// tier with reports access is hard-scoped to their own service regardless of
// what the request asks for - the toggle in the UI is either hidden or
// restricted for them, and this is the API-layer enforcement of that.
// ---------------------------------------------------------------------------

export async function organisationName(
  supabase: ServerClient,
  organisationId: string | null,
): Promise<string> {
  if (!organisationId) return "VeriClever";
  const { data } = await supabase
    .from("organisations")
    .select("name")
    .eq("id", organisationId)
    .maybeSingle();
  return (data?.name as string | undefined) ?? "VeriClever";
}

export function resolveReportScope(
  profile: Profile,
  requestedServiceId: string | null,
): { serviceId: string | null; restricted: boolean } {
  if (isAdmin(profile.access_tier)) {
    return { serviceId: requestedServiceId, restricted: false };
  }
  return { serviceId: profile.service_id, restricted: true };
}

// ---------------------------------------------------------------------------
// Step 30: coverage / orphan report
// ---------------------------------------------------------------------------

export type OrphanDoc = { id: string; name: string };
export type OrphanTag = { option: TagOption; kind: "quality_area" | "child_safe_standard" };
export type OrphanPolicyTag = OrphanTag & { policies: OrphanDoc[] };

export type CoverageReport = {
  orphanPolicies: OrphanDoc[];
  orphanSops: OrphanDoc[];
  orphanTagsSopLevel: OrphanTag[];
  orphanTagsPolicyLevel: OrphanPolicyTag[];
  totalPublishedPolicies: number;
  totalPublishedSops: number;
};

export async function coverageReport(supabase: ServerClient): Promise<CoverageReport> {
  const [{ data: pubPolicies }, { data: pubSops }, { data: links }] =
    await Promise.all([
      supabase
        .from("policies")
        .select("id, name")
        .not("published_version", "is", null),
      supabase
        .from("sops")
        .select("id, name")
        .not("published_version", "is", null),
      supabase.from("policy_sop_links").select("policy_id, sop_id"),
    ]);

  const linkedPolicyIds = new Set((links ?? []).map((l) => l.policy_id as string));
  const linkedSopIds = new Set((links ?? []).map((l) => l.sop_id as string));

  const orphanPolicies = (pubPolicies ?? [])
    .filter((p) => !linkedPolicyIds.has(p.id as string))
    .map((p) => ({ id: p.id as string, name: p.name as string }));
  const orphanSops = (pubSops ?? [])
    .filter((s) => !linkedSopIds.has(s.id as string))
    .map((s) => ({ id: s.id as string, name: s.name as string }));

  // Case 3 and 4 need every tag on every SOP and every policy, org-wide (no id
  // filter), so both cases can be checked against the full tag set.
  const [sopTags, policyTags] = await Promise.all([
    documentTagsFor(supabase, "sop"),
    documentTagsFor(supabase, "policy"),
  ]);

  const sopAreaIds = new Set<number>();
  const sopStandardIds = new Set<number>();
  for (const t of sopTags.values()) {
    for (const id of t.qualityAreas) sopAreaIds.add(id);
    for (const id of t.childSafeStandards) sopStandardIds.add(id);
  }

  const orphanTagsSopLevel: OrphanTag[] = [
    ...NQS_QUALITY_AREAS.filter((o) => !sopAreaIds.has(o.id)).map((option) => ({
      option,
      kind: "quality_area" as const,
    })),
    ...CHILD_SAFE_STANDARDS.filter((o) => !sopStandardIds.has(o.id)).map((option) => ({
      option,
      kind: "child_safe_standard" as const,
    })),
  ];

  // Policy id -> the policies (name lookup) for building case-4 detail.
  const policyName = new Map(
    (pubPolicies ?? []).map((p) => [p.id as string, p.name as string]),
  );
  // A policy_id may not be published; still fetch its name for the report so a
  // tagged-but-unpublished policy is not silently dropped from the check.
  const { data: allPolicyNames } = await supabase.from("policies").select("id, name");
  for (const p of allPolicyNames ?? []) {
    if (!policyName.has(p.id as string)) policyName.set(p.id as string, p.name as string);
  }

  const policiesByArea = new Map<number, Set<string>>();
  const policiesByStandard = new Map<number, Set<string>>();
  for (const [policyId, tags] of policyTags) {
    for (const areaId of tags.qualityAreas) {
      const set = policiesByArea.get(areaId) ?? new Set<string>();
      set.add(policyId);
      policiesByArea.set(areaId, set);
    }
    for (const stdId of tags.childSafeStandards) {
      const set = policiesByStandard.get(stdId) ?? new Set<string>();
      set.add(policyId);
      policiesByStandard.set(stdId, set);
    }
  }

  const orphanTagsPolicyLevel: OrphanPolicyTag[] = [];
  for (const option of NQS_QUALITY_AREAS) {
    const policyIds = policiesByArea.get(option.id);
    if (!policyIds || policyIds.size === 0) continue;
    const withNoSop = [...policyIds].filter((pid) => !linkedPolicyIds.has(pid));
    if (withNoSop.length === policyIds.size) {
      orphanTagsPolicyLevel.push({
        option,
        kind: "quality_area",
        policies: withNoSop.map((id) => ({ id, name: policyName.get(id) ?? "Untitled" })),
      });
    }
  }
  for (const option of CHILD_SAFE_STANDARDS) {
    const policyIds = policiesByStandard.get(option.id);
    if (!policyIds || policyIds.size === 0) continue;
    const withNoSop = [...policyIds].filter((pid) => !linkedPolicyIds.has(pid));
    if (withNoSop.length === policyIds.size) {
      orphanTagsPolicyLevel.push({
        option,
        kind: "child_safe_standard",
        policies: withNoSop.map((id) => ({ id, name: policyName.get(id) ?? "Untitled" })),
      });
    }
  }

  return {
    orphanPolicies,
    orphanSops,
    orphanTagsSopLevel,
    orphanTagsPolicyLevel,
    totalPublishedPolicies: (pubPolicies ?? []).length,
    totalPublishedSops: (pubSops ?? []).length,
  };
}

// ---------------------------------------------------------------------------
// Step 31: service overview
// ---------------------------------------------------------------------------

export type ServiceOverview = {
  serviceName: string;
  staffTotal: number;
  fullyCompliant: number;
  sopPct: number | null;
  sopSigned: number;
  sopTotal: number;
  policyPct: number | null;
  policyViewed: number;
  policyTotal: number;
  outstanding: number;
};

export async function serviceOverviewData(
  supabase: ServerClient,
  serviceId: string,
  currentProfileId: string,
): Promise<ServiceOverview> {
  const [{ data: service }, { data: staff }] = await Promise.all([
    supabase.from("services").select("name").eq("id", serviceId).maybeSingle(),
    supabase
      .from("profiles")
      .select("id, job_role_id, service_id, is_active")
      .eq("service_id", serviceId)
      .eq("is_active", true)
      .neq("access_tier", "admin"),
  ]);
  const people = (staff ?? []) as {
    id: string;
    job_role_id: string | null;
    service_id: string | null;
  }[];
  const stats = await staffStatsByProfile(supabase, people, currentProfileId);
  const team = summariseTeam(
    people.map((p) => p.id),
    stats,
  );
  return {
    serviceName: (service?.name as string | undefined) ?? "Unknown service",
    staffTotal: team.total,
    fullyCompliant: team.clear,
    sopPct: team.sopPct,
    sopSigned: team.sopSigned,
    sopTotal: team.sopTotal,
    policyPct: team.policyPct,
    policyViewed: team.policyViewed,
    policyTotal: team.policyTotal,
    outstanding: team.outstanding,
  };
}

// ---------------------------------------------------------------------------
// Steps 32 / 33: child safety standards report and quality area report. Same
// shape - one section per tag, listing the SOPs (procedures) tagged to it,
// their latest review, and what would show it is working.
// ---------------------------------------------------------------------------

export type TagSectionSop = {
  id: string;
  name: string;
  reviewLabel: string;
  reviewOverdue: boolean;
  lastReviewedNote: string | null;
  suggestedEvidence: string | null;
};

export type TagSection = { option: TagOption; sops: TagSectionSop[] };

async function tagSectionsReport(
  supabase: ServerClient,
  options: TagOption[],
  kind: "quality_area" | "child_safe_standard",
): Promise<TagSection[]> {
  const [{ data: sops }, tagsBySop, { data: historyRows }] = await Promise.all([
    supabase
      .from("sops")
      .select("id, name, next_review_date, suggested_evidence")
      .not("published_version", "is", null),
    documentTagsFor(supabase, "sop"),
    supabase
      .from("sop_history")
      .select("sop_id, event_type, note, created_at")
      .eq("event_type", "review")
      .order("created_at", { ascending: false }),
  ]);

  const lastReview = new Map<string, string>();
  for (const h of historyRows ?? []) {
    const id = h.sop_id as string;
    if (!lastReview.has(id)) {
      lastReview.set(
        id,
        `${new Date(h.created_at as string).toLocaleDateString("en-AU", { dateStyle: "medium" })}${h.note ? ` - ${h.note}` : ""}`,
      );
    }
  }

  const sopById = new Map((sops ?? []).map((s) => [s.id as string, s]));

  return options.map((option) => {
    const sopIds = [...tagsBySop.entries()]
      .filter(([, tags]) =>
        kind === "quality_area"
          ? tags.qualityAreas.includes(option.id)
          : tags.childSafeStandards.includes(option.id),
      )
      .map(([sopId]) => sopId)
      .filter((id) => sopById.has(id));

    const sopsOut: TagSectionSop[] = sopIds.map((id) => {
      const s = sopById.get(id)!;
      const rs = reviewState(s.next_review_date as string | null);
      return {
        id,
        name: s.name as string,
        reviewLabel: rs.label,
        reviewOverdue: rs.status === "overdue",
        lastReviewedNote: lastReview.get(id) ?? null,
        suggestedEvidence: (s.suggested_evidence as string | null) ?? null,
      };
    });
    sopsOut.sort((a, b) => a.name.localeCompare(b.name));
    return { option, sops: sopsOut };
  });
}

export const childSafetyStandardsReport = (supabase: ServerClient) =>
  tagSectionsReport(supabase, CHILD_SAFE_STANDARDS, "child_safe_standard");

export const qualityAreaReport = (supabase: ServerClient) =>
  tagSectionsReport(supabase, NQS_QUALITY_AREAS, "quality_area");

// ---------------------------------------------------------------------------
// Step 34: HR expiring items (credentials, WWCC, contracts)
// ---------------------------------------------------------------------------

export type HrExpiringPerson = {
  profileId: string;
  fullName: string;
  serviceName: string;
  credentials: CredentialAlert[];
  contract: { bucket: "due" | "expired"; expiryDate: string; daysLeft: number } | null;
};

export async function hrExpiringItemsData(
  supabase: ServerClient,
  serviceId: string | null,
): Promise<HrExpiringPerson[]> {
  const [{ data: profiles }, { data: services }, credAlerts, contractAlertRows] =
    await Promise.all([
      supabase
        .from("profiles")
        .select("id, full_name, service_id, is_active")
        .eq("is_active", true)
        .neq("access_tier", "admin"),
      supabase.from("services").select("id, name"),
      expiringCredentials(supabase, { withinDays: 60 }),
      contractAlerts(supabase),
    ]);

  const serviceName = new Map((services ?? []).map((s) => [s.id as string, s.name as string]));
  const people = (profiles ?? []).filter(
    (p) => !serviceId || p.service_id === serviceId,
  );

  const credByProfile = new Map<string, CredentialAlert[]>();
  for (const a of credAlerts) {
    const list = credByProfile.get(a.profileId) ?? [];
    list.push(a);
    credByProfile.set(a.profileId, list);
  }
  const contractByProfile = new Map(contractAlertRows.map((a) => [a.profileId, a]));

  const out: HrExpiringPerson[] = [];
  for (const p of people) {
    const creds = credByProfile.get(p.id as string) ?? [];
    const contract = contractByProfile.get(p.id as string) ?? null;
    if (creds.length === 0 && !contract) continue;
    out.push({
      profileId: p.id as string,
      fullName: p.full_name as string,
      serviceName: serviceName.get(p.service_id as string) ?? "Unassigned",
      credentials: creds,
      contract: contract
        ? { bucket: contract.bucket, expiryDate: contract.expiryDate, daysLeft: contract.daysLeft }
        : null,
    });
  }
  out.sort((a, b) => a.fullName.localeCompare(b.fullName));
  return out;
}

// ---------------------------------------------------------------------------
// Step 35: policy and procedure review calendar
// ---------------------------------------------------------------------------

export type ReviewCalendarItem = {
  id: string;
  name: string;
  kind: "Policy" | "Procedure";
  nextReviewDate: string | null;
  label: string;
  overdue: boolean;
};

export async function reviewCalendarData(
  supabase: ServerClient,
  serviceId: string | null,
): Promise<ReviewCalendarItem[]> {
  const [{ data: sops }, { data: policies }] = await Promise.all([
    supabase
      .from("sops")
      .select("id, name, next_review_date, service_id")
      .not("published_version", "is", null),
    supabase
      .from("policies")
      .select("id, name, next_review_date, service_id")
      .not("published_version", "is", null),
  ]);

  const items: ReviewCalendarItem[] = [];
  for (const s of sops ?? []) {
    if (serviceId && s.service_id && s.service_id !== serviceId) continue;
    const rs = reviewState(s.next_review_date as string | null);
    items.push({
      id: s.id as string,
      name: s.name as string,
      kind: "Procedure",
      nextReviewDate: s.next_review_date as string | null,
      label: rs.label,
      overdue: rs.status === "overdue",
    });
  }
  for (const p of policies ?? []) {
    if (serviceId && p.service_id && p.service_id !== serviceId) continue;
    const rs = reviewState(p.next_review_date as string | null);
    items.push({
      id: p.id as string,
      name: p.name as string,
      kind: "Policy",
      nextReviewDate: p.next_review_date as string | null,
      label: rs.label,
      overdue: rs.status === "overdue",
    });
  }
  items.sort((a, b) => {
    if (!a.nextReviewDate && !b.nextReviewDate) return a.name.localeCompare(b.name);
    if (!a.nextReviewDate) return 1;
    if (!b.nextReviewDate) return -1;
    return a.nextReviewDate.localeCompare(b.nextReviewDate);
  });
  return items;
}

// ---------------------------------------------------------------------------
// Step 36: per-staff compliance report
// ---------------------------------------------------------------------------

export type PerStaffCompliance = {
  fullName: string;
  serviceName: string;
  jobRoleName: string | null;
  sopSigned: { id: string; name: string }[];
  sopOutstanding: { id: string; name: string; awaitingCountersign: boolean }[];
  policiesViewed: number;
  policiesOutstanding: { id: string; name: string }[];
  credentials: CredentialAlert[];
  contract: ContractRow | null;
  contractRenewal: ReturnType<typeof renewalState>;
  agreementsUnsigned: number;
};

export async function perStaffComplianceData(
  supabase: ServerClient,
  profileId: string,
): Promise<PerStaffCompliance | null> {
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, full_name, service_id, job_role_id")
    .eq("id", profileId)
    .maybeSingle();
  if (!profile) return null;

  const [{ data: service }, { data: jobRole }, { data: roleSops }, { data: sops }, { data: signOffs }] =
    await Promise.all([
      profile.service_id
        ? supabase.from("services").select("name").eq("id", profile.service_id).maybeSingle()
        : Promise.resolve({ data: null }),
      profile.job_role_id
        ? supabase.from("job_roles").select("name").eq("id", profile.job_role_id).maybeSingle()
        : Promise.resolve({ data: null }),
      profile.job_role_id
        ? supabase.from("job_role_sops").select("sop_id").eq("job_role_id", profile.job_role_id)
        : Promise.resolve({ data: [] as { sop_id: string }[] }),
      supabase.from("sops").select("id, name, published_version, signoff_type").not("published_version", "is", null),
      supabase
        .from("sign_offs")
        .select("sop_id, sop_version, verified_at")
        .eq("user_id", profileId),
    ]);

  const suiteIds = new Set((roleSops ?? []).map((r) => r.sop_id as string));
  const sopById = new Map((sops ?? []).map((s) => [s.id as string, s]));
  const signedByKey = new Map(
    (signOffs ?? []).map((s) => [`${s.sop_id}:${s.sop_version}`, Boolean(s.verified_at)]),
  );

  const sopSigned: { id: string; name: string }[] = [];
  const sopOutstanding: { id: string; name: string; awaitingCountersign: boolean }[] = [];
  for (const id of suiteIds) {
    const s = sopById.get(id);
    if (!s) continue;
    const version = s.published_version as number;
    const verified = signedByKey.get(`${id}:${version}`);
    const needsManager = s.signoff_type === "self_and_manager";
    if (verified === undefined) {
      sopOutstanding.push({ id, name: s.name as string, awaitingCountersign: false });
    } else if (needsManager && !verified) {
      sopOutstanding.push({ id, name: s.name as string, awaitingCountersign: true });
    } else {
      sopSigned.push({ id, name: s.name as string });
    }
  }
  sopSigned.sort((a, b) => a.name.localeCompare(b.name));
  sopOutstanding.sort((a, b) => a.name.localeCompare(b.name));

  const { data: orgPolicies } = await supabase.rpc("org_published_policies");
  const { data: views } = await supabase
    .from("policy_views")
    .select("policy_id, policy_version")
    .eq("user_id", profileId);
  const viewedKeys = new Set((views ?? []).map((v) => `${v.policy_id}:${v.policy_version}`));
  type PubPolicy = { id: string; name: string; published_version: number; service_id: string | null };
  const expected = ((orgPolicies ?? []) as PubPolicy[]).filter(
    (p) => p.service_id == null || p.service_id === profile.service_id,
  );
  const policiesOutstanding = expected
    .filter((p) => !viewedKeys.has(`${p.id}:${p.published_version}`))
    .map((p) => ({ id: p.id, name: p.name }));
  const policiesViewed = expected.length - policiesOutstanding.length;

  const [credAlerts, { data: contractRows }, agreementsUnsigned] = await Promise.all([
    expiringCredentials(supabase, { withinDays: 60 }).then((rows) =>
      rows.filter((r) => r.profileId === profileId),
    ),
    supabase
      .from("contracts")
      .select(
        "id, profile_id, start_date, period_type, duration_months, expiry_date, document_id, notes, superseded_at, signed_at, signed_name, signed_by, signed_content_hash, is_deed, countersigned_at, countersigned_name, countersigned_by, countersigned_content_hash, created_at",
      )
      .eq("profile_id", profileId)
      .is("superseded_at", null)
      .maybeSingle(),
    unsignedAgreementsByProfile(supabase, [
      { id: profileId, job_role_id: profile.job_role_id as string | null },
    ]),
  ]);

  const contract = (contractRows as ContractRow | null) ?? null;

  return {
    fullName: profile.full_name as string,
    serviceName: (service?.name as string | undefined) ?? "Unassigned",
    jobRoleName: (jobRole?.name as string | undefined) ?? null,
    sopSigned,
    sopOutstanding,
    policiesViewed,
    policiesOutstanding,
    credentials: credAlerts,
    contract,
    contractRenewal: renewalState(contract),
    agreementsUnsigned: agreementsUnsigned.get(profileId) ?? 0,
  };
}

// ---------------------------------------------------------------------------
// Step 37: Stakeholder Notification Report (Reg 172). Step 9 is parked, so
// there is no event log yet - this returns an empty result the PDF renders as
// an explicit "nothing recorded yet" state, not an error.
// ---------------------------------------------------------------------------

export type StakeholderNotification = {
  policyName: string;
  policyVersion: number;
  notifiedAt: string;
};

export async function stakeholderNotificationData(): Promise<StakeholderNotification[]> {
  return [];
}

// ---------------------------------------------------------------------------
// Step 38: version and change history report
// ---------------------------------------------------------------------------

export type ChangeHistoryEntry = {
  kind: "Policy" | "Procedure";
  name: string;
  eventLabel: string;
  note: string | null;
  actor: string;
  at: string;
};

export async function versionChangeHistoryData(
  supabase: ServerClient,
): Promise<ChangeHistoryEntry[]> {
  const [{ data: history }, { data: policies }] = await Promise.all([
    // period_change events stay in the audit log but are dropped from every
    // report and history view - a cadence change is not part of the
    // improvement story and dilutes the log a reviewer has to read.
    supabase
      .from("sop_history")
      .select("sop_id, event_type, note, actor_profile_id, created_at")
      .neq("event_type", "period_change")
      .order("created_at", { ascending: false })
      .limit(200),
    // No per-version policy history log exists yet - the latest publish and
    // edit metadata is the best available record for a policy's row.
    supabase
      .from("policies")
      .select("id, name, published_at, published_by, updated_by, published_version")
      .not("published_at", "is", null),
  ]);

  const sopIds = [...new Set((history ?? []).map((h) => h.sop_id as string))];
  const actorIds = [
    ...new Set(
      [
        ...(history ?? []).map((h) => h.actor_profile_id as string | null),
        ...(policies ?? []).flatMap((p) => [p.published_by, p.updated_by] as (string | null)[]),
      ].filter((x): x is string => Boolean(x)),
    ),
  ];
  const [{ data: sops }, { data: actors }] = await Promise.all([
    sopIds.length
      ? supabase.from("sops").select("id, name").in("id", sopIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    actorIds.length
      ? supabase.from("profiles").select("id, full_name").in("id", actorIds)
      : Promise.resolve({ data: [] as { id: string; full_name: string }[] }),
  ]);
  const sopName = new Map((sops ?? []).map((s) => [s.id as string, s.name as string]));
  const actorName = new Map((actors ?? []).map((a) => [a.id as string, a.full_name as string]));

  const HISTORY_LABEL: Record<string, string> = {
    edit: "Content edited",
    period_change: "Review schedule changed",
    review: "Reviewed",
  };

  const entries: ChangeHistoryEntry[] = [];
  for (const h of history ?? []) {
    entries.push({
      kind: "Procedure",
      name: sopName.get(h.sop_id as string) ?? "Unknown procedure",
      eventLabel: HISTORY_LABEL[h.event_type as string] ?? (h.event_type as string),
      note: (h.note as string | null) ?? null,
      actor: h.actor_profile_id ? (actorName.get(h.actor_profile_id as string) ?? "Someone") : "System",
      at: h.created_at as string,
    });
  }
  for (const p of policies ?? []) {
    entries.push({
      kind: "Policy",
      name: p.name as string,
      eventLabel: `Published v${p.published_version}`,
      note: null,
      actor: p.published_by
        ? (actorName.get(p.published_by as string) ?? "Someone")
        : p.updated_by
          ? (actorName.get(p.updated_by as string) ?? "Someone")
          : "System",
      at: p.published_at as string,
    });
  }
  entries.sort((a, b) => b.at.localeCompare(a.at));
  return entries;
}
