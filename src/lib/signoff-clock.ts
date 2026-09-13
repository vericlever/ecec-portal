import { SOP_SIGNING_WINDOW_DAYS, type SopSigningWindow } from "@/lib/constants";
import { fmtDate } from "@/lib/format-date";

const DAY_MS = 86_400_000;

// Contracts have no configurable signing window (Step 44 decision: keep it
// simple, one fixed window for every contract), anchored to when the
// contract was issued, not its business start_date, which can be backdated
// or future.
export const CONTRACT_SIGN_WINDOW_DAYS = 7;

// The date a procedure becomes due for a given person: however many days
// after the later of (a) the role assignment that first required it, or
// (b) the procedure's own publish date - so a newly published mandatory
// procedure doesn't look instantly overdue for people who have held the
// role for years. pausedDaysBanked shifts the result out by however long
// this person has spent paused in the past (Step 44 leave/pause) - it
// restores the remaining runway rather than resetting the clock.
export function sopDueDate(
  roleStart: string | Date,
  publishedAt: string | Date | null,
  signingWindow: SopSigningWindow,
  pausedDaysBanked = 0,
): Date {
  const start = new Date(roleStart);
  const published = publishedAt ? new Date(publishedAt) : null;
  const effectiveStart =
    published && published.getTime() > start.getTime() ? published : start;
  return new Date(
    effectiveStart.getTime() +
      (SOP_SIGNING_WINDOW_DAYS[signingWindow] + pausedDaysBanked) * DAY_MS,
  );
}

export function contractDueDate(createdAt: string | Date, pausedDaysBanked = 0): Date {
  return new Date(
    new Date(createdAt).getTime() + (CONTRACT_SIGN_WINDOW_DAYS + pausedDaysBanked) * DAY_MS,
  );
}

export function isOverdue(due: Date, now: Date = new Date()): boolean {
  return due.getTime() <= now.getTime();
}

// How many whole days a person's signing clock has been paused this pause
// period, given signing_paused_at is set and unpause has not happened yet.
export function pausedDaysSince(pausedAt: string | Date, now: Date = new Date()): number {
  return Math.max(0, Math.round((now.getTime() - new Date(pausedAt).getTime()) / DAY_MS));
}

export type SigningState = "paused" | "overdue" | "due_soon" | "not_due";

// A due-soon window is not user-configurable in this pass - a fixed 3 days
// for everyone, everywhere. Whether an item is signed or not is a separate
// question the caller already knows the answer to (there is no "complete"
// state here).
export const DUE_SOON_DAYS = 3;

export function signingState(
  dueDate: Date,
  opts: { paused: boolean; now?: Date },
): SigningState {
  if (opts.paused) return "paused";
  const now = opts.now ?? new Date();
  if (isOverdue(dueDate, now)) return "overdue";
  const daysLeft = Math.ceil((dueDate.getTime() - now.getTime()) / DAY_MS);
  return daysLeft <= DUE_SOON_DAYS ? "due_soon" : "not_due";
}

// "Due 20 Sep 2026" or "Overdue since 13 Sep 2026" - the one phrase every
// surface (in-app lists and the reminder email) uses, so the wording never
// drifts between them.
export function dueSignoffPhrase(due: Date, now: Date = new Date()): string {
  const iso = due.toISOString().slice(0, 10);
  return isOverdue(due, now) ? `Overdue since ${fmtDate(iso)}` : `Due ${fmtDate(iso)}`;
}

// Earliest assigned_at, per SOP, across whichever of a person's role
// assignments include it - the point each procedure's clock starts for
// someone holding more than one role.
export function earliestRoleStartBySop(
  roleLinks: { job_role_id: string; sop_id: string }[],
  roleAssignedAt: Map<string, string>,
): Map<string, string> {
  const out = new Map<string, string>();
  for (const l of roleLinks) {
    const at = roleAssignedAt.get(l.job_role_id);
    if (!at) continue;
    const existing = out.get(l.sop_id);
    if (!existing || at < existing) out.set(l.sop_id, at);
  }
  return out;
}
