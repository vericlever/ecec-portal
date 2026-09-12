// Trial readiness revision, Step 43. Every user-facing date or time in the
// product goes through this module - nowhere else calls toLocaleString,
// toLocaleDateString or Intl.DateTimeFormat directly. Two different kinds of
// value need two different treatments, and conflating them is exactly how a
// date silently shifts a day:
//
// - A genuine timestamp (a `timestamptz` column - "when did this happen":
//   signed_at, published_at, created_at, reviewed_at) must render in the
//   organisation's own timezone, not the server's (Vercel runs UTC) and not
//   whatever timezone happens to be set wherever this code executes. Use
//   fmtDateTime with the organisation's timezone.
//
// - A plain calendar date (a `date` column - expiry, due, review, contract
//   dates, date of birth) has no time-of-day or timezone component at all.
//   It must never be run through a timezone conversion, because that is
//   exactly how a date-only field ends up landing on the wrong side of
//   midnight. Use fmtDate / fmtDateLong, which parse the "YYYY-MM-DD"
//   string directly and never construct a timezone-sensitive Date object.

export const DEFAULT_ORG_TIMEZONE = "Australia/Melbourne";

const MONTHS_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];
const MONTHS_LONG = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function parseDateOnly(v: string): { y: number; m: number; d: number } {
  const [y, m, d] = v.slice(0, 10).split("-").map(Number);
  return { y, m, d };
}

// "12 Sep 2026" - a calendar date, never timezone-converted.
export function fmtDate(v: string): string {
  const { y, m, d } = parseDateOnly(v);
  return `${d} ${MONTHS_SHORT[m - 1]} ${y}`;
}

// "12 September 2026" - long form, used in report and history prose.
export function fmtDateLong(v: string): string {
  const { y, m, d } = parseDateOnly(v);
  return `${d} ${MONTHS_LONG[m - 1]} ${y}`;
}

// A real moment in time (timestamptz), rendered in the organisation's own
// timezone. Pass `time: true` for date-and-time display; omit it for a
// date-only rendering of a timestamp (e.g. "published on 12 Sep 2026").
export function fmtDateTime(
  iso: string,
  timezone: string,
  opts: { time?: boolean } = {},
): string {
  return new Date(iso).toLocaleString("en-AU", {
    dateStyle: "medium",
    ...(opts.time ? { timeStyle: "short" as const } : {}),
    timeZone: timezone,
  });
}

// "Now", in the organisation's own timezone - PDF reports must render in
// organisation time, not server time.
export function fmtNow(timezone: string): string {
  return fmtDateTime(new Date().toISOString(), timezone, { time: true });
}
