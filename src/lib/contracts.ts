import { createClient } from "@/lib/supabase/server";

type ServerClient = ReturnType<typeof createClient>;

export type ContractPeriodType = "fixed" | "no_fixed_period";

export type ContractRow = {
  id: string;
  profile_id: string;
  start_date: string;
  period_type: ContractPeriodType;
  duration_months: number | null;
  expiry_date: string | null;
  document_id: string | null;
  notes: string | null;
  superseded_at: string | null;
  signed_at: string | null;
  signed_name: string | null;
  signed_by: string | null;
  signed_content_hash: string | null;
  is_deed: boolean;
  countersigned_at: string | null;
  countersigned_name: string | null;
  countersigned_by: string | null;
  countersigned_content_hash: string | null;
  created_at: string;
};

// Fully executed = both signature slots filled. A deed is reported as
// "signed on paper" rather than unsigned or executed - it never goes through
// either in-app slot (Step 39).
export type ExecutionState = "deed" | "unsigned" | "awaiting_countersign" | "executed";

export function executionState(contract: ContractRow | null): ExecutionState {
  if (!contract) return "unsigned";
  if (contract.is_deed) return "deed";
  if (!contract.signed_at) return "unsigned";
  if (!contract.countersigned_at) return "awaiting_countersign";
  return "executed";
}

// Renewal escalation buckets. "due" covers the 4/3/2/1 week run-up, "expired"
// once the date has passed. Only fixed-period contracts ever leave "none".
export type RenewalBucket = "none" | "ok" | "due" | "expired";

export type RenewalState = {
  bucket: RenewalBucket;
  daysLeft: number | null; // null when there is no expiry
  weeksOut: 4 | 3 | 2 | 1 | null; // which weekly step we are in, during the run-up
};

const DAY = 86_400_000;

export function renewalState(contract: ContractRow | null): RenewalState {
  if (
    !contract ||
    contract.period_type !== "fixed" ||
    !contract.expiry_date ||
    contract.superseded_at
  ) {
    return { bucket: "none", daysLeft: null, weeksOut: null };
  }
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const expiry = new Date(contract.expiry_date + "T00:00:00");
  const daysLeft = Math.round((expiry.getTime() - today.getTime()) / DAY);

  if (daysLeft < 0) return { bucket: "expired", daysLeft, weeksOut: null };
  if (daysLeft > 28) return { bucket: "ok", daysLeft, weeksOut: null };
  const weeksOut = (Math.min(4, Math.ceil(daysLeft / 7)) || 1) as 4 | 3 | 2 | 1;
  return { bucket: "due", daysLeft, weeksOut };
}

// The active contract from a person's contract rows (the one not yet
// superseded), or null if they have none on file.
export function activeContract(rows: ContractRow[]): ContractRow | null {
  return rows.find((r) => !r.superseded_at) ?? null;
}

// Calculate the expiry date of a fixed-period contract: start date plus a whole
// number of months. Returned as an ISO date string (no time).
export function calcExpiry(startDate: string, durationMonths: number): string {
  const d = new Date(startDate + "T00:00:00");
  const day = d.getDate();
  d.setMonth(d.getMonth() + durationMonths);
  // If the target month is shorter, setMonth rolls over; pull back to the last
  // day of the intended month.
  if (d.getDate() !== day) d.setDate(0);
  return d.toISOString().slice(0, 10);
}

export type ContractAlert = {
  profileId: string;
  bucket: Extract<RenewalBucket, "due" | "expired">;
  expiryDate: string;
  daysLeft: number;
};

// Every staff member whose active contract is in the 4-week run-up or already
// expired. RLS scopes contracts to the caller's staff (or the caller). Soonest
// first.
export async function contractAlerts(
  supabase: ServerClient,
): Promise<ContractAlert[]> {
  const { data } = await supabase
    .from("contracts")
    .select(
      "id, profile_id, start_date, period_type, duration_months, expiry_date, document_id, notes, superseded_at, signed_at, signed_name, created_at",
    )
    .is("superseded_at", null)
    .eq("period_type", "fixed");

  const alerts: ContractAlert[] = [];
  for (const row of (data ?? []) as ContractRow[]) {
    const state = renewalState(row);
    if (state.bucket === "due" || state.bucket === "expired") {
      alerts.push({
        profileId: row.profile_id,
        bucket: state.bucket,
        expiryDate: row.expiry_date as string,
        daysLeft: state.daysLeft as number,
      });
    }
  }
  alerts.sort((a, b) => a.daysLeft - b.daysLeft);
  return alerts;
}

export function contractAlertsByProfile(
  alerts: ContractAlert[],
): Map<string, ContractAlert> {
  const m = new Map<string, ContractAlert>();
  for (const a of alerts) m.set(a.profileId, a);
  return m;
}
