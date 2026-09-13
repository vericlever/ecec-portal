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

// The signing clock (Step 44). How long staff have once a procedure becomes
// due for them before it counts as overdue - set per procedure, same for
// every role it applies to.
export const SOP_SIGNOFF_PRIORITIES = [
  "immediate",
  "week",
  "three_months",
  "six_months",
  "twelve_months",
] as const;

export type SopSignoffPriority = (typeof SOP_SIGNOFF_PRIORITIES)[number];

export const SOP_SIGNOFF_PRIORITY_LABELS: Record<SopSignoffPriority, string> = {
  immediate: "Immediate",
  week: "1 week",
  three_months: "3 months",
  six_months: "6 months",
  twelve_months: "12 months",
};

export const SOP_SIGNOFF_PRIORITY_DAYS: Record<SopSignoffPriority, number> = {
  immediate: 0,
  week: 7,
  three_months: 90,
  six_months: 180,
  twelve_months: 365,
};

export function cleanSignoffPriority(v: unknown): SopSignoffPriority {
  return (SOP_SIGNOFF_PRIORITIES as readonly string[]).includes(v as string)
    ? (v as SopSignoffPriority)
    : "week";
}
