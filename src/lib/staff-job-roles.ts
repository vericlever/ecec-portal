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
