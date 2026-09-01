import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { type AccessTier, isManager, isAdmin, canEditContent } from "@/lib/roles";

export * from "@/lib/roles";

export type Profile = {
  id: string;
  organisation_id: string | null;
  service_id: string | null;
  job_role_id: string | null;
  full_name: string;
  email: string;
  access_tier: AccessTier;
  hr_verifier: boolean;
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
      "id, organisation_id, service_id, job_role_id, full_name, email, access_tier, hr_verifier",
    )
    .eq("id", user.id)
    .maybeSingle();

  return (data as Profile) ?? null;
}

// May verify onboarding documents: an admin, or anyone with the HR sign-off flag.
export function canVerify(profile: Profile | null): boolean {
  return Boolean(profile && (profile.access_tier === "admin" || profile.hr_verifier));
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
  if (!isManager(profile.access_tier) && !profile.hr_verifier) redirect("/sops");
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
