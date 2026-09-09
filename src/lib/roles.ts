// Pure role helpers and labels. No server imports, so this is safe to use from
// client components. Server-only auth lives in auth.ts.

export type AccessTier = "staff" | "manager_staff" | "manager_policy" | "admin";

export const TIER_LABELS: Record<AccessTier, string> = {
  staff: "Staff",
  manager_staff: "Manager (staff)",
  manager_policy: "Manager (staff, policy and procedures)",
  admin: "Admin",
};

export const ASSIGNABLE_TIERS: { value: AccessTier; label: string }[] = [
  { value: "staff", label: "Staff" },
  { value: "manager_staff", label: "Manager (staff)" },
  { value: "manager_policy", label: "Manager (staff, policy and procedures)" },
  { value: "admin", label: "Admin" },
];

export function isManager(tier: AccessTier | null | undefined): boolean {
  return tier === "manager_staff" || tier === "manager_policy" || tier === "admin";
}

export function isAdmin(tier: AccessTier | null | undefined): boolean {
  return tier === "admin";
}

export function canEditContent(tier: AccessTier | null | undefined): boolean {
  return tier === "manager_policy" || tier === "admin";
}

// The Reports page and every report route (Step 30): Admin and Manager
// (policy) only. Deliberately its own check rather than reusing
// canEditContent - the spec names these two tiers explicitly, and this stays
// correct even if canEditContent's set ever widens for an unrelated reason.
export function canViewReports(tier: AccessTier | null | undefined): boolean {
  return tier === "manager_policy" || tier === "admin";
}
