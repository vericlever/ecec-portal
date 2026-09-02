import { createClient } from "@/lib/supabase/server";

type ServerClient = ReturnType<typeof createClient>;

export type CredentialKind =
  | "WWCC"
  | "Teacher registration"
  | "Training"
  | "Working rights";

export type CredentialStatus = "expired" | "expiring";

export type CredentialAlert = {
  profileId: string;
  kind: CredentialKind;
  label: string; // human label, e.g. "First Aid" or "Working with Children Check"
  expiryDate: string; // ISO date
  daysLeft: number; // negative when already expired
  status: CredentialStatus;
};

// Everything with an expiry that has passed or is close. RLS already limits the
// three source tables to staff the caller manages (or the caller themselves),
// so the result is the caller's real watch list. A director sees their site,
// an admin sees the organisation.
//
// For each person we keep only the current record of each kind: the WWCC with
// the latest expiry, the teacher registration with the latest expiry, and the
// latest expiry per training type. An older superseded record never raises an
// alert.
export async function expiringCredentials(
  supabase: ServerClient,
  opts: { withinDays?: number } = {},
): Promise<CredentialAlert[]> {
  const withinDays = opts.withinDays ?? 60;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [{ data: wwcc }, { data: teacher }, { data: training }, { data: visa }] =
    await Promise.all([
      supabase
        .from("wwcc_checks")
        .select("profile_id, expiry_date")
        .not("expiry_date", "is", null),
      supabase
        .from("teacher_registrations")
        .select("profile_id, expiry_date")
        .not("expiry_date", "is", null),
      supabase
        .from("training_records")
        .select("profile_id, training_type, other_description, expiry_date")
        .not("expiry_date", "is", null),
      supabase
        .from("worker_details")
        .select("profile_id, visa_expiry")
        .not("visa_expiry", "is", null),
    ]);

  // key -> latest expiry row for that (person, kind[, training type])
  const latest = new Map<
    string,
    { profileId: string; kind: CredentialKind; label: string; expiry: string }
  >();

  const consider = (
    key: string,
    profileId: string,
    kind: CredentialKind,
    label: string,
    expiry: string | null,
  ) => {
    if (!expiry) return;
    const existing = latest.get(key);
    if (!existing || expiry > existing.expiry) {
      latest.set(key, { profileId, kind, label, expiry });
    }
  };

  for (const r of wwcc ?? []) {
    consider(
      `${r.profile_id}|wwcc`,
      r.profile_id as string,
      "WWCC",
      "Working with Children Check",
      r.expiry_date as string | null,
    );
  }
  for (const r of teacher ?? []) {
    consider(
      `${r.profile_id}|teacher`,
      r.profile_id as string,
      "Teacher registration",
      "Teacher registration",
      r.expiry_date as string | null,
    );
  }
  for (const r of training ?? []) {
    const type = String(r.training_type);
    const label =
      type === "Other" && r.other_description
        ? String(r.other_description)
        : type;
    consider(
      `${r.profile_id}|training|${type}|${r.other_description ?? ""}`,
      r.profile_id as string,
      "Training",
      label,
      r.expiry_date as string | null,
    );
  }
  for (const r of visa ?? []) {
    consider(
      `${r.profile_id}|visa`,
      r.profile_id as string,
      "Working rights",
      "Visa",
      r.visa_expiry as string | null,
    );
  }

  const cutoff = new Date(today);
  cutoff.setDate(cutoff.getDate() + withinDays);

  const alerts: CredentialAlert[] = [];
  for (const row of latest.values()) {
    const expiry = new Date(row.expiry + "T00:00:00");
    if (expiry > cutoff) continue;
    const daysLeft = Math.round(
      (expiry.getTime() - today.getTime()) / 86_400_000,
    );
    alerts.push({
      profileId: row.profileId,
      kind: row.kind,
      label: row.label,
      expiryDate: row.expiry,
      daysLeft,
      status: daysLeft < 0 ? "expired" : "expiring",
    });
  }

  // Soonest first, expired before expiring.
  alerts.sort((a, b) => a.daysLeft - b.daysLeft);
  return alerts;
}

// The same expired / expiring classification for a single person, from records
// already loaded (the staff record page). Keeps only the latest expiry of each
// kind, so a renewal supersedes the older entry.
export function classifyPersonCredentials(
  input: {
    wwcc: { expiry_date: string | null }[];
    teacher: { expiry_date: string | null }[];
    training: {
      training_type: string;
      other_description: string | null;
      expiry_date: string | null;
    }[];
    visaExpiry?: string | null;
  },
  opts: { withinDays?: number } = {},
): Omit<CredentialAlert, "profileId">[] {
  const withinDays = opts.withinDays ?? 60;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const cutoff = new Date(today);
  cutoff.setDate(cutoff.getDate() + withinDays);

  const latest = new Map<
    string,
    { kind: CredentialKind; label: string; expiry: string }
  >();
  const consider = (
    key: string,
    kind: CredentialKind,
    label: string,
    expiry: string | null,
  ) => {
    if (!expiry) return;
    const existing = latest.get(key);
    if (!existing || expiry > existing.expiry) latest.set(key, { kind, label, expiry });
  };

  for (const r of input.wwcc) {
    consider("wwcc", "WWCC", "Working with Children Check", r.expiry_date);
  }
  for (const r of input.teacher) {
    consider("teacher", "Teacher registration", "Teacher registration", r.expiry_date);
  }
  for (const r of input.training) {
    const type = String(r.training_type);
    const label = type === "Other" && r.other_description ? r.other_description : type;
    consider(`training|${type}|${r.other_description ?? ""}`, "Training", label, r.expiry_date);
  }
  consider("visa", "Working rights", "Visa", input.visaExpiry ?? null);

  const out: Omit<CredentialAlert, "profileId">[] = [];
  for (const row of latest.values()) {
    const expiry = new Date(row.expiry + "T00:00:00");
    if (expiry > cutoff) continue;
    const daysLeft = Math.round((expiry.getTime() - today.getTime()) / 86_400_000);
    out.push({
      kind: row.kind,
      label: row.label,
      expiryDate: row.expiry,
      daysLeft,
      status: daysLeft < 0 ? "expired" : "expiring",
    });
  }
  out.sort((a, b) => a.daysLeft - b.daysLeft);
  return out;
}

// Per-person count of expired or expiring credentials, for list and dashboard
// roll-ups.
export function credentialAlertsByProfile(
  alerts: CredentialAlert[],
): Map<string, number> {
  const m = new Map<string, number>();
  for (const a of alerts) m.set(a.profileId, (m.get(a.profileId) ?? 0) + 1);
  return m;
}
