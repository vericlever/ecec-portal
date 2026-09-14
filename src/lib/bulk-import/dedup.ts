// Step 47: duplicate detection and the filename/blank-content heuristics for
// bulk upload review. Pure functions - no I/O - so the review page can call
// them against whatever existing titles it already fetched.

// Lowercase, strip punctuation, normalise "and"/"&", collapse whitespace.
export function normaliseTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/\band\b/g, " and ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function bigrams(s: string): Set<string> {
  const out = new Set<string>();
  for (let i = 0; i < s.length - 1; i++) out.add(s.slice(i, i + 2));
  return out;
}

function bigramDice(a: string, b: string): number {
  const ba = bigrams(a);
  const bb = bigrams(b);
  if (ba.size === 0 || bb.size === 0) return a === b ? 1 : 0;
  let overlap = 0;
  for (const g of ba) if (bb.has(g)) overlap += 1;
  return (2 * overlap) / (ba.size + bb.size);
}

// True when the shorter string is the longer one up to a word boundary -
// "active supervision" is a prefix-match of "active supervision procedure",
// but "accounts receivable" is not a prefix-match of "accounts payable"
// (they only share a leading substring, not a leading *word run*). This
// matters because plain character-bigram similarity cannot tell those two
// cases apart: both share a long common prefix, but only one is actually
// the same procedure with a generic suffix word added.
function isWordPrefix(shorter: string, longer: string): boolean {
  if (!longer.startsWith(shorter)) return false;
  const rest = longer.slice(shorter.length);
  return rest === "" || rest.startsWith(" ");
}

// Same core title plus a trailing generic word ("Absenteeism" vs
// "Absenteeism Policy") is treated as a strong match regardless of how long
// the added suffix is. Everything else falls back to character-bigram Dice,
// which catches typos and reordering ("Active Supervison" vs "Active
// Supervision") without being fooled by an unrelated title that merely
// starts with the same word ("Accounts Receivable" vs "Accounts Payable").
export function titleSimilarity(a: string, b: string): number {
  const na = normaliseTitle(a);
  const nb = normaliseTitle(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  const [shorter, longer] = na.length <= nb.length ? [na, nb] : [nb, na];
  if (shorter.length >= 4 && isWordPrefix(shorter, longer)) return 0.9;
  return bigramDice(na, nb);
}

export const DUPLICATE_THRESHOLD = 0.82;

export function bestDuplicateMatch<T extends { id: string; name: string }>(
  title: string,
  candidates: T[],
): { match: T; score: number } | null {
  let best: { match: T; score: number } | null = null;
  for (const c of candidates) {
    const score = titleSimilarity(title, c.name);
    if (score >= DUPLICATE_THRESHOLD && (!best || score > best.score)) {
      best = { match: c, score };
    }
  }
  return best;
}

// Flags a parsed title that looks like it is still a filename rather than a
// real name - a file extension, a long digit run, an embedded date stamp, or
// too many hyphens. "Catchment-Report-5-7-Princess-Street-2026-9-6-54514"
// should never have become a procedure title without a prompt.
export function looksLikeFilename(title: string): boolean {
  if (/\.[A-Za-z0-9]{2,5}$/.test(title)) return true; // still has an extension
  if (/\d{4,}/.test(title)) return true; // a long digit run
  if (/\b\d{4}[-/]\d{1,2}[-/]\d{1,2}\b/.test(title)) return true; // date stamp
  if (/\b\d{1,2}[-/]\d{1,2}[-/]\d{2,4}\b/.test(title)) return true;
  const hyphens = (title.match(/-/g) ?? []).length;
  if (hyphens > 3) return true;
  return false;
}

export function isBlankContent(extractedText: string | null | undefined): boolean {
  return !extractedText || extractedText.trim().length === 0;
}
