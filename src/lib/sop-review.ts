// Review-cycle helpers, shared by the SOP list, the SOP editor and the policy
// editor. Pure functions, safe on the client.

export type ReviewStatus = "none" | "ok" | "soon" | "overdue";

export type ReviewState = {
  status: ReviewStatus;
  dueDate: string | null;
  daysLeft: number | null;
  label: string;
};

const SOON_DAYS = 30;

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export function daysUntil(isoDate: string): number {
  const d = new Date(isoDate.length === 10 ? isoDate + "T00:00:00" : isoDate);
  return Math.round((d.getTime() - startOfToday().getTime()) / 86_400_000);
}

export function fmtReviewDate(isoDate: string): string {
  const d = new Date(isoDate.length === 10 ? isoDate + "T00:00:00" : isoDate);
  return d.toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

// Report rule 3 (Review cycle v2): day month year, no ordinal suffix, no
// abbreviation - "10 March 2027", never "10 Sept 2026" or "2027-03-10". Used
// only in generated report output, never in-app UI (fmtReviewDate covers
// that, with its shorter month form).
export function fmtReportDate(isoDate: string): string {
  const d = new Date(isoDate.length === 10 ? isoDate + "T00:00:00" : isoDate);
  return d.toLocaleDateString("en-AU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export function reviewState(nextReviewDate: string | null): ReviewState {
  if (!nextReviewDate) {
    return {
      status: "none",
      dueDate: null,
      daysLeft: null,
      label: "No review date set",
    };
  }
  const n = daysUntil(nextReviewDate);
  if (n < 0) {
    return {
      status: "overdue",
      dueDate: nextReviewDate,
      daysLeft: n,
      label: `Review overdue since ${fmtReviewDate(nextReviewDate)}`,
    };
  }
  if (n === 0) {
    return {
      status: "soon",
      dueDate: nextReviewDate,
      daysLeft: 0,
      label: "Review due today",
    };
  }
  if (n <= SOON_DAYS) {
    return {
      status: "soon",
      dueDate: nextReviewDate,
      daysLeft: n,
      label: `Review due ${fmtReviewDate(nextReviewDate)} (${n} day${n === 1 ? "" : "s"})`,
    };
  }
  return {
    status: "ok",
    dueDate: nextReviewDate,
    daysLeft: n,
    label: `Review due ${fmtReviewDate(nextReviewDate)}`,
  };
}

// The date `months` from today, as YYYY-MM-DD in local time. Used when a review
// is recorded and the clock resets to "period from now".
export function reviewDateFromNow(months: number): string {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setMonth(d.getMonth() + months);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

export const HISTORY_EVENT_LABELS: Record<string, string> = {
  edit: "Revised",
  published: "Republished",
  period_change: "Review schedule changed",
  review: "Reviewed",
  reviewed: "Reviewed",
};
