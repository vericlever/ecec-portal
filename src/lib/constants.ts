// Review cadence for a SOP or policy, in months. Fixed options (Step 24; the
// due-date maths and reminders are Step 20).
export const REVIEW_PERIODS = [3, 6, 12] as const;

export const REVIEW_PERIOD_LABELS: Record<number, string> = {
  3: "Every 3 months",
  6: "Every 6 months",
  12: "Every 12 months",
};

export function cleanReviewPeriod(v: unknown): number {
  const n = Number(v);
  return (REVIEW_PERIODS as readonly number[]).includes(n) ? n : 6;
}
