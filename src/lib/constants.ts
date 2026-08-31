// Hardcoded identifiers for step 3: no auth yet. The app runs as one user,
// zeke@readyset.au (educator, Ready Set Go, Timboon), seeded in
// supabase/seed/0002_dev_user.sql. Replaced by the real authenticated session
// in step 4.

export const RSG_ORGANISATION_ID = "a0000000-0000-4000-8000-000000000001";

export const DEV_USER_ID = "c0000000-0000-4000-8000-000000000001";
export const DEV_USER_SITE_ID = "b0000000-0000-4000-8000-000000000001"; // Timboon
export const DEV_USER_NAME = "Zeke Pottage";
export const DEV_USER_ROLE = "Educator";
export const DEV_USER_SITE_NAME = "Timboon";

export const SOP_TIER_LABELS: Record<string, string> = {
  educator: "Educator",
  room_leader: "Room Leader",
  educational_leader: "Educational Leader",
  director: "Director",
  finance_admin: "Finance & Admin",
};

export const SOP_TIER_ORDER = [
  "educator",
  "room_leader",
  "educational_leader",
  "director",
  "finance_admin",
];
