import { createClient } from "@/lib/supabase/server";

type ServerClient = ReturnType<typeof createClient>;

// The document tables a leader sights during onboarding verification.
const SIGHTABLE_TABLES = [
  "wwcc_checks",
  "teacher_registrations",
  "qualifications",
  "training_records",
  "identity_documents",
] as const;

// How many unsighted documents are waiting, per staff member. RLS already limits
// the rows to workers the caller manages, so this is the caller's real queue.
// The caller's own documents are never their own to sight, so they are excluded.
export async function pendingSightingsByProfile(
  supabase: ServerClient,
  excludeProfileId: string,
): Promise<Map<string, number>> {
  const results = await Promise.all(
    SIGHTABLE_TABLES.map((table) =>
      supabase.from(table).select("profile_id").is("sighted_at", null),
    ),
  );

  const counts = new Map<string, number>();
  for (const { data } of results) {
    for (const row of data ?? []) {
      const pid = row.profile_id as string;
      if (pid === excludeProfileId) continue;
      counts.set(pid, (counts.get(pid) ?? 0) + 1);
    }
  }
  return counts;
}
