import { SOP_SIGNOFF_PRIORITY_DAYS, type SopSignoffPriority } from "@/lib/constants";
import { fmtDate } from "@/lib/format-date";

const DAY_MS = 86_400_000;

// Contracts have no per-item priority (Step 44 decision: keep it simple,
// one fixed window for every contract), anchored to when the contract was
// issued, not its business start_date, which can be backdated or future.
export const CONTRACT_SIGN_WINDOW_DAYS = 7;

// The date a procedure becomes due for a given person: however many days
// after the later of (a) the role assignment that first required it, or
// (b) the procedure's own publish date - so a newly published mandatory
// procedure doesn't look instantly overdue for people who have held the
// role for years.
export function sopDueDate(
  roleStart: string | Date,
  publishedAt: string | Date | null,
  priority: SopSignoffPriority,
): Date {
  const start = new Date(roleStart);
  const published = publishedAt ? new Date(publishedAt) : null;
  const effectiveStart =
    published && published.getTime() > start.getTime() ? published : start;
  return new Date(effectiveStart.getTime() + SOP_SIGNOFF_PRIORITY_DAYS[priority] * DAY_MS);
}

export function contractDueDate(createdAt: string | Date): Date {
  return new Date(new Date(createdAt).getTime() + CONTRACT_SIGN_WINDOW_DAYS * DAY_MS);
}

export function isOverdue(due: Date, now: Date = new Date()): boolean {
  return due.getTime() <= now.getTime();
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
