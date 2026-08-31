import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type Role =
  | "platform_superuser"
  | "approved_provider"
  | "centre_director"
  | "educator";

export type Profile = {
  id: string;
  organisation_id: string | null;
  site_id: string | null;
  full_name: string;
  email: string;
  role: Role;
};

export function isAdmin(role: Role | undefined | null): boolean {
  return (
    role === "approved_provider" ||
    role === "centre_director" ||
    role === "platform_superuser"
  );
}

export const ROLE_LABELS: Record<Role, string> = {
  platform_superuser: "Platform superuser",
  approved_provider: "Approved provider",
  centre_director: "Centre director",
  educator: "Educator",
};

// The signed-in user's profile, or null if not signed in / no profile row.
export async function getProfile(): Promise<Profile | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("profiles")
    .select("id, organisation_id, site_id, full_name, email, role")
    .eq("id", user.id)
    .maybeSingle();

  return (data as Profile) ?? null;
}

// Use in a page/action that requires a signed-in user with a profile.
export async function requireProfile(): Promise<Profile> {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  return profile;
}

// Use in an admin-only page/action.
export async function requireAdmin(): Promise<Profile> {
  const profile = await requireProfile();
  if (!isAdmin(profile.role)) redirect("/sops");
  return profile;
}
