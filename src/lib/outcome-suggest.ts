// Step 59 revision A: the prompt and the verification for suggested procedure
// links. Kept out of the server actions file so a script can exercise exactly
// the code the app runs. The model is told to copy excerpts word for word;
// verifySuggestions() then checks every excerpt really is in the record line
// it cites and drops anything that is not, so a made-up quote can never reach
// a manager.

export const MAX_SUGGESTED_PROCEDURES = 4;
export const MAX_EVIDENCE_PER_PROCEDURE = 4;

export type LinkEvidence = { line: number; excerpt: string };
export type VerifiedSuggestion = { sopId: string; reason: string | null; evidence: LinkEvidence[] };
export type NumberedLine = { n: number; text: string };

const squash = (t: string) => t.replace(/\s+/g, " ").trim().toLowerCase();

export function numberLines(body: string): NumberedLine[] {
  return body
    .split("\n")
    .map((text, i) => ({ n: i + 1, text }))
    .filter((l) => l.text.trim() !== "");
}

export const SUGGEST_SYSTEM_PROMPT = `You review a periodic outcome record (for example a six-monthly incident register, or a batch of staff or parent feedback) and nominate up to ${MAX_SUGGESTED_PROCEDURES} procedures from a list that the record gives reason to review. For each, give a one-sentence reason and up to ${MAX_EVIDENCE_PER_PROCEDURE} pieces of evidence. Each piece of evidence is the number of the record line it comes from and an excerpt copied word for word from that line. Never paraphrase an excerpt. Nominate only procedures the record genuinely supports; fewer is fine and none is fine. Reply with JSON only, no other text: {"procedures":[{"id":"<procedure id>","reason":"...","evidence":[{"line":12,"excerpt":"..."}]}]}`;

export function buildSuggestUserMessage(
  numbered: NumberedLine[],
  procedures: { id: string; name: string; published_body: string | null }[],
): string {
  const record = numbered.map((l) => `[${l.n}] ${l.text}`).join("\n");
  const list = procedures
    .map((p) => `- ${p.id}: ${p.name}\n  ${(p.published_body ?? "").slice(0, 200)}`)
    .join("\n");
  return `Record (numbered lines):\n${record}\n\nProcedures:\n${list}`;
}

export function verifySuggestions(
  response: string,
  numbered: NumberedLine[],
  knownSopIds: Set<string>,
): VerifiedSuggestion[] {
  const jsonText = response.slice(response.indexOf("{"), response.lastIndexOf("}") + 1);
  let parsed: { procedures?: { id?: string; reason?: string; evidence?: { line?: number; excerpt?: string }[] }[] };
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return [];
  }

  const lineText = new Map(numbered.map((l) => [l.n, squash(l.text)]));
  const seen = new Set<string>();
  const out: VerifiedSuggestion[] = [];

  for (const proc of parsed.procedures ?? []) {
    if (out.length >= MAX_SUGGESTED_PROCEDURES) break;
    if (!proc.id || !knownSopIds.has(proc.id) || seen.has(proc.id)) continue;
    const evidence: LinkEvidence[] = [];
    for (const e of proc.evidence ?? []) {
      if (evidence.length >= MAX_EVIDENCE_PER_PROCEDURE) break;
      if (typeof e.line !== "number" || typeof e.excerpt !== "string" || !e.excerpt.trim()) continue;
      const target = lineText.get(e.line);
      if (target && target.includes(squash(e.excerpt))) {
        evidence.push({ line: e.line, excerpt: e.excerpt.trim() });
      }
    }
    if (evidence.length === 0) continue;
    seen.add(proc.id);
    out.push({ sopId: proc.id, reason: proc.reason?.trim() || null, evidence });
  }
  return out;
}
