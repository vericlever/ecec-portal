import { createClient } from "@/lib/supabase/server";

type ServerClient = ReturnType<typeof createClient>;

export type AssignedRole = { id: string; name: string };

// Every job role a person holds (source of truth: profile_job_roles,
// migration 0054). A person can hold more than one - an "ed leader" might
// need both the Educator and Room Leader suites.
export async function assignedJobRoles(
  supabase: ServerClient,
  profileId: string,
): Promise<AssignedRole[]> {
  const ids = await assignedJobRoleIds(supabase, profileId);
  if (ids.length === 0) return [];
  const { data: roles } = await supabase
    .from("job_roles")
    .select("id, name")
    .in("id", ids);
  return (roles ?? [])
    .map((r) => ({ id: r.id as string, name: r.name as string }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function assignedJobRoleIds(
  supabase: ServerClient,
  profileId: string,
): Promise<string[]> {
  const { data } = await supabase
    .from("profile_job_roles")
    .select("job_role_id")
    .eq("profile_id", profileId);
  return (data ?? []).map((l) => l.job_role_id as string);
}

// job_role_id -> when this person was assigned that role. The signing clock
// (Step 44) starts here for every procedure in that role's suite.
export async function assignedRoleDates(
  supabase: ServerClient,
  profileId: string,
): Promise<Map<string, string>> {
  const { data } = await supabase
    .from("profile_job_roles")
    .select("job_role_id, assigned_at")
    .eq("profile_id", profileId);
  return new Map((data ?? []).map((l) => [l.job_role_id as string, l.assigned_at as string]));
}

export type SigningPause = {
  paused: boolean;
  pausedAt: string | null;
  reason: string | null;
  until: string | null;
  daysBanked: number;
};

// Step 44 pause/leave. Fetches the raw state; src/lib/signoff-clock.ts turns
// it into due-date math (daysBanked) and display state (paused).
export async function signingPauseFor(
  supabase: ServerClient,
  profileId: string,
): Promise<SigningPause> {
  const { data } = await supabase
    .from("profiles")
    .select("signing_paused_at, signing_paused_reason, signing_paused_until, signing_paused_days_banked")
    .eq("id", profileId)
    .maybeSingle();
  return {
    paused: Boolean(data?.signing_paused_at),
    pausedAt: (data?.signing_paused_at as string | null) ?? null,
    reason: (data?.signing_paused_reason as string | null) ?? null,
    until: (data?.signing_paused_until as string | null) ?? null,
    daysBanked: (data?.signing_paused_days_banked as number | null) ?? 0,
  };
}

// The published SOPs covered by any of the given roles, deduplicated - the
// suite a person with these roles must sign, whether they hold one role or
// several.
export async function sopSuiteIdsForRoles(
  supabase: ServerClient,
  jobRoleIds: string[],
): Promise<string[]> {
  if (jobRoleIds.length === 0) return [];
  const { data } = await supabase
    .from("job_role_sops")
    .select("sop_id")
    .in("job_role_id", jobRoleIds);
  return Array.from(new Set((data ?? []).map((r) => r.sop_id as string)));
}
