// Step 55: training status page. One row per staff member per procedure
// assigned to them through a job role, batched across a whole scope (a
// service, or the organisation) rather than one profile at a time - the
// per-profile helpers in staff-job-roles.ts and signoff-clock.ts do the same
// due-date maths, but a page listing every assignment in scope needs it
// computed set-based, the same reasoning staffStatsByProfile is built on.

import { createClient } from "@/lib/supabase/server";
import { earliestRoleStartBySop, sopDueDate, signingState, type SigningState } from "@/lib/signoff-clock";
import { cleanSigningWindow } from "@/lib/constants";

type ServerClient = ReturnType<typeof createClient>;

export type TrainingStatus = "not_started" | "in_progress" | "complete";

export type TrainingRow = {
  profileId: string;
  fullName: string;
  serviceId: string | null;
  serviceName: string;
  jobRoleNames: string[];
  sopId: string;
  sopName: string;
  publishedVersion: number;
  status: TrainingStatus;
  assignedAt: string;
  completedAt: string | null;
  dueDate: string | null; // ISO
  clockState: SigningState | null; // null once status is "complete"
  daysOverdue: number | null;
  attemptCount: number;
  hasPassedAttempt: boolean;
  lastReminded: string | null;
};

export type NoAssignmentRow = {
  profileId: string;
  fullName: string;
  serviceId: string | null;
  serviceName: string;
  reason: "no_job_role" | "role_has_no_procedures";
};

export type TrainingStatusData = {
  rows: TrainingRow[];
  noAssignment: NoAssignmentRow[];
};

const DAY_MS = 86_400_000;

export async function trainingStatusData(
  supabase: ServerClient,
  opts: { serviceId: string | null; includeInactive: boolean },
): Promise<TrainingStatusData> {
  let profileQuery = supabase
    .from("profiles")
    .select(
      "id, full_name, service_id, is_active, signing_paused_at, signing_paused_days_banked",
    );
  if (!opts.includeInactive) profileQuery = profileQuery.eq("is_active", true);
  if (opts.serviceId) profileQuery = profileQuery.eq("service_id", opts.serviceId);

  const [{ data: profiles }, { data: services }, { data: jobRoles }] = await Promise.all([
    profileQuery,
    supabase.from("services").select("id, name"),
    supabase.from("job_roles").select("id, name"),
  ]);

  const people = (profiles ?? []) as {
    id: string;
    full_name: string;
    service_id: string | null;
    is_active: boolean;
    signing_paused_at: string | null;
    signing_paused_days_banked: number;
  }[];
  const serviceName = new Map((services ?? []).map((s) => [s.id as string, s.name as string]));
  const jobRoleName = new Map((jobRoles ?? []).map((r) => [r.id as string, r.name as string]));

  if (people.length === 0) return { rows: [], noAssignment: [] };
  const peopleIds = people.map((p) => p.id);

  const [{ data: roleLinks }, { data: signOffs }, { data: attempts }, { data: notifications }] =
    await Promise.all([
      supabase
        .from("profile_job_roles")
        .select("profile_id, job_role_id, assigned_at")
        .in("profile_id", peopleIds),
      supabase
        .from("sign_offs")
        .select("user_id, sop_id, sop_version, signed_at, verified_at")
        .in("user_id", peopleIds),
      supabase
        .from("comprehension_attempts")
        .select("profile_id, sop_id, passed")
        .in("profile_id", peopleIds),
      supabase
        .from("notification_log")
        .select("recipient_profile_id, sent_at")
        .in("recipient_profile_id", peopleIds)
        .order("sent_at", { ascending: false }),
    ]);

  const roleIdsByProfile = new Map<string, string[]>();
  const roleAssignedAtByProfile = new Map<string, Map<string, string>>();
  const roleLinkList = (roleLinks ?? []) as {
    profile_id: string;
    job_role_id: string;
    assigned_at: string;
  }[];
  for (const l of roleLinkList) {
    const roles = roleIdsByProfile.get(l.profile_id) ?? [];
    roles.push(l.job_role_id);
    roleIdsByProfile.set(l.profile_id, roles);
    const m = roleAssignedAtByProfile.get(l.profile_id) ?? new Map<string, string>();
    m.set(l.job_role_id, l.assigned_at);
    roleAssignedAtByProfile.set(l.profile_id, m);
  }

  const allRoleIds = Array.from(new Set(roleLinkList.map((l) => l.job_role_id)));
  const { data: roleSops } = allRoleIds.length
    ? await supabase.from("job_role_sops").select("job_role_id, sop_id").in("job_role_id", allRoleIds)
    : { data: [] as { job_role_id: string; sop_id: string }[] };
  const sopIdsByRole = new Map<string, string[]>();
  for (const rs of roleSops ?? []) {
    const list = sopIdsByRole.get(rs.job_role_id as string) ?? [];
    list.push(rs.sop_id as string);
    sopIdsByRole.set(rs.job_role_id as string, list);
  }

  const allSopIds = Array.from(new Set((roleSops ?? []).map((rs) => rs.sop_id as string)));
  const { data: sops } = allSopIds.length
    ? await supabase
        .from("sops")
        .select("id, name, published_version, published_at, signoff_type, signing_window")
        .in("id", allSopIds)
        .not("published_version", "is", null)
    : { data: [] as Record<string, unknown>[] };
  type SopRow = {
    id: string;
    name: string;
    published_version: number;
    published_at: string | null;
    signoff_type: string;
    signing_window: unknown;
  };
  const sopById = new Map((sops ?? []).map((s) => [(s as SopRow).id, s as SopRow]));

  const signedByUser = new Map<string, Map<string, { signed_at: string; verified_at: string | null }>>();
  for (const s of signOffs ?? []) {
    const m = signedByUser.get(s.user_id as string) ?? new Map();
    m.set(`${s.sop_id}:${s.sop_version}`, {
      signed_at: s.signed_at as string,
      verified_at: s.verified_at as string | null,
    });
    signedByUser.set(s.user_id as string, m);
  }

  const attemptsByPersonSop = new Map<string, { count: number; passed: boolean }>();
  for (const a of attempts ?? []) {
    const key = `${a.profile_id}:${a.sop_id}`;
    const cur = attemptsByPersonSop.get(key) ?? { count: 0, passed: false };
    cur.count += 1;
    if (a.passed) cur.passed = true;
    attemptsByPersonSop.set(key, cur);
  }

  const lastRemindedByProfile = new Map<string, string>();
  for (const n of notifications ?? []) {
    const pid = n.recipient_profile_id as string | null;
    if (pid && !lastRemindedByProfile.has(pid)) {
      lastRemindedByProfile.set(pid, n.sent_at as string);
    }
  }

  const now = new Date();
  const rows: TrainingRow[] = [];
  const noAssignment: NoAssignmentRow[] = [];

  for (const p of people) {
    const roleIds = roleIdsByProfile.get(p.id) ?? [];
    const svcName = p.service_id ? (serviceName.get(p.service_id) ?? "Unknown service") : "All sites";

    if (roleIds.length === 0) {
      noAssignment.push({
        profileId: p.id,
        fullName: p.full_name,
        serviceId: p.service_id,
        serviceName: svcName,
        reason: "no_job_role",
      });
      continue;
    }

    const suite = Array.from(
      new Set(roleIds.flatMap((rid) => sopIdsByRole.get(rid) ?? [])),
    ).filter((sopId) => sopById.has(sopId));

    if (suite.length === 0) {
      noAssignment.push({
        profileId: p.id,
        fullName: p.full_name,
        serviceId: p.service_id,
        serviceName: svcName,
        reason: "role_has_no_procedures",
      });
      continue;
    }

    // Which named role(s) pull each sop into this person's suite, and the
    // earliest of those roles' start dates - the point that sop's clock
    // starts for this person specifically (mirrors the staff-facing sop page).
    const personRoleLinks = roleIds.flatMap((rid) =>
      (sopIdsByRole.get(rid) ?? []).map((sopId) => ({ job_role_id: rid, sop_id: sopId })),
    );
    const roleStartBySop = earliestRoleStartBySop(
      personRoleLinks,
      roleAssignedAtByProfile.get(p.id) ?? new Map(),
    );
    const rolesForSop = new Map<string, Set<string>>();
    for (const l of personRoleLinks) {
      const set = rolesForSop.get(l.sop_id) ?? new Set<string>();
      set.add(jobRoleName.get(l.job_role_id) ?? "—");
      rolesForSop.set(l.sop_id, set);
    }

    for (const sopId of suite) {
      const sop = sopById.get(sopId)!;
      const needsManager = sop.signoff_type === "self_and_manager";
      const signed = signedByUser.get(p.id)?.get(`${sopId}:${sop.published_version}`);
      const complete = signed ? (needsManager ? Boolean(signed.verified_at) : true) : false;
      const status: TrainingStatus = complete
        ? "complete"
        : signed
          ? "in_progress"
          : "not_started";
      const completedAt = complete ? (needsManager ? signed!.verified_at : signed!.signed_at) : null;

      const roleStart = roleStartBySop.get(sopId);
      const dueDate = roleStart
        ? sopDueDate(
            roleStart,
            sop.published_at,
            cleanSigningWindow(sop.signing_window),
            p.signing_paused_days_banked,
          )
        : null;
      const paused = Boolean(p.signing_paused_at);
      const clockState = complete || !dueDate ? null : signingState(dueDate, { paused, now });
      const daysOverdue =
        clockState === "overdue" && dueDate
          ? Math.floor((now.getTime() - dueDate.getTime()) / DAY_MS)
          : null;

      const attempt = attemptsByPersonSop.get(`${p.id}:${sopId}`) ?? { count: 0, passed: false };

      rows.push({
        profileId: p.id,
        fullName: p.full_name,
        serviceId: p.service_id,
        serviceName: svcName,
        jobRoleNames: Array.from(rolesForSop.get(sopId) ?? []).sort(),
        sopId,
        sopName: sop.name,
        publishedVersion: sop.published_version,
        status,
        assignedAt: roleStart ?? "",
        completedAt,
        dueDate: dueDate ? dueDate.toISOString().slice(0, 10) : null,
        clockState,
        daysOverdue,
        attemptCount: attempt.count,
        hasPassedAttempt: attempt.passed,
        lastReminded: lastRemindedByProfile.get(p.id) ?? null,
      });
    }
  }

  return { rows, noAssignment };
}
