import type { SupabaseClient } from "@supabase/supabase-js";

export const QUARANTINE_BUCKET = "outcome-quarantine";
const MAX_AGE_MS = 60 * 60 * 1000; // one hour, per Step 59 B5.7

// Deletes quarantined uploads older than an hour. The files in this bucket are
// the ORIGINAL, unredacted uploads, and the app deletes each one on save and on
// cancel already; this catches the ones that never got there (closed tab,
// crash).
//
// Vercel's Hobby plan only allows daily cron jobs, so the hourly cron the spec
// asked for is not available. This runs from the daily cron (every
// organisation) and also whenever someone starts an upload (that
// organisation's folder), so the one-hour rule is held whenever the feature is
// in use and an abandoned file lives at most a day if it is not.
//
// Storage's list() is per-prefix, not global, hence the folder walk. Pass an
// organisation id to sweep only that organisation's folder.
export async function sweepStaleQuarantineFiles(
  admin: SupabaseClient,
  organisationId?: string,
): Promise<{ removed: number; errors: string[] }> {
  const cutoff = Date.now() - MAX_AGE_MS;
  const errors: string[] = [];
  let removed = 0;

  let folders: string[];
  if (organisationId) {
    folders = [organisationId];
  } else {
    const { data, error } = await admin.storage.from(QUARANTINE_BUCKET).list("");
    if (error) return { removed: 0, errors: [error.message] };
    folders = (data ?? []).map((f) => f.name).filter(Boolean);
  }

  for (const folder of folders) {
    const { data: files, error: listError } = await admin.storage.from(QUARANTINE_BUCKET).list(folder);
    if (listError) {
      errors.push(`${folder}: ${listError.message}`);
      continue;
    }
    const stale = (files ?? [])
      .filter((f) => f.created_at && new Date(f.created_at).getTime() < cutoff)
      .map((f) => `${folder}/${f.name}`);
    if (stale.length === 0) continue;

    const { error: removeError } = await admin.storage.from(QUARANTINE_BUCKET).remove(stale);
    if (removeError) {
      errors.push(`${folder}: ${removeError.message}`);
      continue;
    }
    removed += stale.length;
  }

  return { removed, errors };
}
