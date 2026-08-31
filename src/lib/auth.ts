import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { type AccessTier, isManager, isAdmin } from "@/lib/roles";

export * from "@/lib/roles";

export type Profile = {
  id: string;
  organisation_id: string | null;
  service_id: string | null;
  job_role_id: string | null;
  full_name: string;
  email: string;
  access_tier: AccessTier;
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
      "id, organisation_id, service_id, job_role_id, full_name, email, access_tier",
    )
    .eq("id", user.id)
    .maybeSingle();

  return (data as Profile) ?? null;
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

export async function requireAdmin(): Promise<Profile> {
  const profile = await requireProfile();
  if (!isAdmin(profile.access_tier)) redirect("/sops");
  return profile;
}
