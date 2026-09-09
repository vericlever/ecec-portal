import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  type AccessTier,
  isManager,
  isAdmin,
  canEditContent,
  canViewReports,
} from "@/lib/roles";

export * from "@/lib/roles";

export type Profile = {
  id: string;
  organisation_id: string | null;
  service_id: string | null;
  job_role_id: string | null;
  full_name: string;
  email: string;
  access_tier: AccessTier;
  hr_manager: boolean;
};

export async function getProfile(): Promise<Profile | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("profiles")
    .select(
      "id, organisation_id, service_id, job_role_id, full_name, email, access_tier, hr_manager",
    )
    .eq("id", user.id)
    .maybeSingle();

  return (data as Profile) ?? null;
}

// An HR manager: an admin, or anyone with the hr_manager flag. Gates document
// sighting, contract upload, and the payroll and screening sections.
export function isHrManager(profile: Profile | null): boolean {
  return Boolean(profile && (profile.access_tier === "admin" || profile.hr_manager));
}

export async function requireProfile(): Promise<Profile> {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  return profile;
}

// A manager (either kind) or an admin.
export async function requireManager(): Promise<Profile> {
  const profile = await requireProfile();
  if (!isManager(profile.access_tier)) redirect("/sops");
  return profile;
}

// Anyone who can work through onboarding: a manager, an admin, or an HR verifier.
export async function requireStaffAccess(): Promise<Profile> {
  const profile = await requireProfile();
  if (!isManager(profile.access_tier) && !profile.hr_manager) redirect("/sops");
  return profile;
}

export async function requireAdmin(): Promise<Profile> {
  const profile = await requireProfile();
  if (!isAdmin(profile.access_tier)) redirect("/sops");
  return profile;
}

// May add and edit policies and SOPs: Manager (policy) or Admin.
export async function requireContentEditor(): Promise<Profile> {
  const profile = await requireProfile();
  if (!canEditContent(profile.access_tier)) redirect("/policies");
  return profile;
}

// The Reports page and its report routes (Step 30): Admin or Manager
// (policy) only. Staff and Manager (staff) never see the nav item and are
// redirected here if they hit the URL directly.
export async function requireReportsAccess(): Promise<Profile> {
  const profile = await requireProfile();
  if (!canViewReports(profile.access_tier)) redirect("/sops");
  return profile;
}

// Same gate for a route handler, which returns a Response instead of
// redirecting. Every report-generation endpoint calls this first.
export async function reportsProfileOrResponse(): Promise<
  { ok: true; profile: Profile } | { ok: false; response: Response }
> {
  const profile = await getProfile();
  if (!profile) return { ok: false, response: new Response("Sign in", { status: 401 }) };
  if (!canViewReports(profile.access_tier)) {
    return { ok: false, response: new Response("Forbidden", { status: 403 }) };
  }
  return { ok: true, profile };
}
