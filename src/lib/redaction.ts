import { ComprehendClient, DetectPiiEntitiesCommand } from "@aws-sdk/client-comprehend";

// Step 59, B5: personal data is redacted in Australia before an outcome
// record is ever stored or analysed. Two passes:
//
// 1. AWS Comprehend DetectPiiEntities (ap-southeast-2) - broad, low-confidence
//    coverage. Over-redaction is the right failure (spec B5.3), so the
//    confidence threshold here is deliberately low.
// 2. A second, Australia-specific regex pass for formats Comprehend has no
//    built-in recognizer for: Medicare numbers, Centrelink CRNs, Working
//    With Children Check numbers, Australian phone formats, and the
//    tenant's own staff names (matched against their real names, since
//    Comprehend's generic NAME detector already runs in pass 1 but won't
//    know which names belong to THIS organisation's staff specifically).
//
// Comprehend's PII entity types collapse onto the spec's six placeholders;
// anything not obviously a name/date/address/phone/email falls to the
// generic [ID NUMBER] bucket (SSN-equivalents, bank details, passport
// numbers, credit card numbers, etc. - Comprehend has no Australia-specific
// recognizer for any of these, so they'd otherwise pass through unlabelled).

const REGION = "ap-southeast-2";
const MIN_CONFIDENCE = 0.5; // deliberately low - over-redaction is the right failure (B5.3)

let cachedClient: ComprehendClient | null = null;
function client(): ComprehendClient {
  if (cachedClient) return cachedClient;
  cachedClient = new ComprehendClient({ region: REGION });
  return cachedClient;
}

const PLACEHOLDER_BY_TYPE: Record<string, string> = {
  NAME: "[NAME]",
  DATE_TIME: "[DATE]",
  ADDRESS: "[ADDRESS]",
  PHONE: "[PHONE]",
  EMAIL: "[EMAIL]",
};
const DEFAULT_PLACEHOLDER = "[ID NUMBER]";

export type RedactionResult = {
  redacted: string;
  placeholderCount: number;
};

// Common words that could plausibly be a first name (Grace, Hope, Will,
// Rose, ...) are deliberately NOT excluded here - B5.3 is explicit that
// over-redaction is the right failure, so a sentence that innocently
// contains "will" getting redacted is an acceptable cost of never missing a
// real repeated mention of a child's name.
const MIN_NAME_FRAGMENT_LENGTH = 3;

// Pass 1: Comprehend. Splits text into <=5000-byte chunks (Comprehend's
// synchronous DetectPiiEntities limit) and redacts each independently,
// working from the END of each chunk backwards so earlier offsets in the
// same chunk stay valid as replacements change the string's length.
//
// Comprehend does NOT reliably tag every mention of a name in the same
// text - found live, 28 September 2026: given "Jordan Alexander Fakename
// ... Jordan's mother ... Jordan was comforted", it tagged the full name and
// the second bare "Jordan" but not the third, possessive "Jordan's". A
// second sweep below catches repeated standalone mentions Comprehend missed,
// using the name fragments Comprehend DID find as the source of truth for
// what counts as a name in this specific text.
async function redactWithComprehend(text: string): Promise<RedactionResult> {
  const MAX_BYTES = 4800; // headroom under Comprehend's 5000-byte limit for multi-byte text
  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > 0) {
    let cut = Math.min(remaining.length, MAX_BYTES);
    // Don't split mid-word if we can help it - back off to the last
    // whitespace within the chunk.
    if (cut < remaining.length) {
      const lastSpace = remaining.lastIndexOf(" ", cut);
      if (lastSpace > 0) cut = lastSpace;
    }
    chunks.push(remaining.slice(0, cut));
    remaining = remaining.slice(cut);
  }

  let placeholderCount = 0;
  const redactedChunks: string[] = [];
  const nameFragments = new Set<string>();

  for (const chunk of chunks) {
    const command = new DetectPiiEntitiesCommand({ Text: chunk, LanguageCode: "en" });
    const response = await client().send(command);
    const entities = (response.Entities ?? [])
      .filter((e) => (e.Score ?? 0) >= MIN_CONFIDENCE)
      .filter((e) => e.BeginOffset != null && e.EndOffset != null)
      .sort((a, b) => (b.BeginOffset ?? 0) - (a.BeginOffset ?? 0)); // end-to-start

    let result = chunk;
    for (const entity of entities) {
      const placeholder = PLACEHOLDER_BY_TYPE[entity.Type ?? ""] ?? DEFAULT_PLACEHOLDER;
      if (entity.Type === "NAME") {
        const source = chunk.slice(entity.BeginOffset!, entity.EndOffset!);
        for (const word of source.split(/\s+/)) {
          const clean = word.replace(/[^A-Za-z'-]/g, "");
          if (clean.length >= MIN_NAME_FRAGMENT_LENGTH) nameFragments.add(clean);
        }
      }
      result = result.slice(0, entity.BeginOffset!) + placeholder + result.slice(entity.EndOffset!);
      placeholderCount++;
    }
    redactedChunks.push(result);
  }

  let joined = redactedChunks.join("");

  // Second sweep: any standalone mention of a name fragment Comprehend found
  // elsewhere in this text, that survived as plain text (a possessive form,
  // a repeated first name alone, etc.).
  for (const fragment of nameFragments) {
    const escaped = fragment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    // 's? allows a trailing possessive ("Jordan's") to be swept in the same match.
    const pattern = new RegExp(`\\b${escaped}\\b('s)?`, "g");
    joined = joined.replace(pattern, () => {
      placeholderCount++;
      return "[NAME]";
    });
  }

  return { redacted: joined, placeholderCount };
}

// Pass 2: Australia-specific formats plus this tenant's own staff names.
// Runs after Comprehend so a name/date Comprehend already replaced with a
// placeholder is not re-matched here.
function redactAustralianFormats(text: string, staffNames: string[]): RedactionResult {
  let result = text;
  let placeholderCount = 0;

  const replace = (pattern: RegExp, placeholder: string) => {
    result = result.replace(pattern, () => {
      placeholderCount++;
      return placeholder;
    });
  };

  // Medicare card number: 10 digits (often shown as 4-3-2-1 or 4-5-1),
  // optionally followed by a 1-digit individual reference number.
  replace(/\b\d{4}[\s-]?\d{5}[\s-]?\d{1,2}\b/g, "[ID NUMBER]");

  // Comprehend often tags only the middle group of a spaced Medicare number
  // ("2123 [ID NUMBER] 1"), which the pattern above can no longer see whole.
  // Absorb digit groups left touching an ID placeholder; over-redaction is
  // the right failure here. Not counted: the placeholder already was.
  result = result.replace(/(?:\b\d{1,4}[\s-]?)?\[ID NUMBER\](?:[\s-]?\d{1,2}\b)?/g, "[ID NUMBER]");

  // Centrelink Customer Reference Number (CRN): 9 digits + 1 letter.
  replace(/\b\d{9}[A-Za-z]\b/g, "[ID NUMBER]");

  // Working With Children Check number: state formats vary but all use a
  // WWC/WWCC-style prefix followed by digits and a check letter (Victoria:
  // WWC1234567E; similar shape used elsewhere).
  replace(/\bWWC{1,2}\d{6,8}[A-Za-z]?\b/gi, "[ID NUMBER]");

  // Australian phone numbers: mobile (04xx xxx xxx) and landline
  // ((0x) xxxx xxxx / 0x xxxx xxxx), with or without spaces/hyphens.
  replace(/\b0[2-478][\s-]?\d{4}[\s-]?\d{4}\b/g, "[PHONE]");
  replace(/\(0[2-478]\)[\s-]?\d{4}[\s-]?\d{4}\b/g, "[PHONE]");

  // This tenant's own staff, by name - Comprehend's generic NAME detector
  // (pass 1) doesn't know which names belong to this organisation
  // specifically, and a staff member's own name is exactly what B3's
  // caution message asks the uploader to check for.
  for (const name of staffNames) {
    const trimmed = name.trim();
    if (trimmed.length < 3) continue; // skip empty/initials-only entries
    const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    replace(new RegExp(`\\b${escaped}\\b`, "gi"), "[NAME]");
  }

  return { redacted: result, placeholderCount };
}

export async function redactOutcomeText(text: string, staffNames: string[]): Promise<RedactionResult> {
  const first = await redactWithComprehend(text);
  const second = redactAustralianFormats(first.redacted, staffNames);
  return {
    redacted: second.redacted,
    placeholderCount: first.placeholderCount + second.placeholderCount,
  };
}

// B5.5: further manual redaction from the preview screen. Redactions cannot
// be removed - the uploader can only select more text to replace, never
// un-redact a placeholder already in the saved-so-far text.
export function applyManualRedaction(text: string, start: number, end: number): string {
  if (start < 0 || end > text.length || start >= end) {
    throw new Error("Invalid redaction range");
  }
  return text.slice(0, start) + "[REDACTED]" + text.slice(end);
}
