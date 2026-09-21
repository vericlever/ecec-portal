import type { StructuredTextItem } from "unpdf";

// Best-effort PDF -> Markdown. This is explicitly a heuristic pass, not a
// layout parser: every PDF that goes through this always comes back flagged
// for manual review (see extract.ts), because unlike docx (a real document
// model with real tables) a PDF is just text positioned on a page - "this
// looks like a table" is a guess from coordinates, never a certainty.
//
// unpdf's extractTextItems() already resolves each text run's position and
// font size from the PDF's own transform matrices (confirmed against the
// installed package - Math.hypot() on the transform's scale components -
// nothing here re-derives that by hand).

type Line = { y: number; items: StructuredTextItem[] };

const Y_TOLERANCE = 3;
const HEADING_LINE_MAX_CHARS = 100;
const H2_SIZE_RATIO = 1.4;
const H3_SIZE_RATIO = 1.15;
const PARAGRAPH_BREAK_RATIO = 1.6; // gap this many times the median line pitch = new paragraph
const TABLE_MIN_ROWS = 3;
const COLUMN_X_TOLERANCE = 12;

function median(nums: number[]): number {
  if (nums.length === 0) return 12;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function lineText(line: Line): string {
  return line.items.map((it) => it.str).join(" ").replace(/\s+/g, " ").trim();
}

function groupIntoLines(items: StructuredTextItem[]): Line[] {
  const withText = items.filter((it) => it.str.trim().length > 0);
  const sorted = [...withText].sort((a, b) => b.y - a.y); // PDF y grows upward - top of page first
  const lines: Line[] = [];
  let current: Line | null = null;
  for (const item of sorted) {
    if (current && Math.abs(current.y - item.y) <= Y_TOLERANCE) {
      current.items.push(item);
      current.y = (current.y + item.y) / 2;
    } else {
      current = { y: item.y, items: [item] };
      lines.push(current);
    }
  }
  for (const l of lines) l.items.sort((a, b) => a.x - b.x);
  return lines;
}

type Tagged =
  | { kind: "heading"; level: 2 | 3; text: string }
  | { kind: "body"; line: Line };

function tagHeadings(lines: Line[], bodySize: number): Tagged[] {
  return lines.map((line) => {
    const text = lineText(line);
    const maxSize = Math.max(...line.items.map((it) => it.fontSize));
    const short = text.length > 0 && text.length <= HEADING_LINE_MAX_CHARS;
    if (short && maxSize >= bodySize * H2_SIZE_RATIO) {
      return { kind: "heading", level: 2, text };
    }
    if (short && maxSize >= bodySize * H3_SIZE_RATIO) {
      return { kind: "heading", level: 3, text };
    }
    return { kind: "body", line };
  });
}

// Clusters a set of x positions (start-of-item) into column bands. Two x
// values within COLUMN_X_TOLERANCE of each other are the same band - this is
// deliberately coarse, matching the spec's framing of this as best-effort
// clustering, not real layout analysis.
function clusterColumns(xs: number[]): number[] {
  const sorted = [...xs].sort((a, b) => a - b);
  const bands: number[] = [];
  for (const x of sorted) {
    if (bands.length === 0 || x - bands[bands.length - 1] > COLUMN_X_TOLERANCE) {
      bands.push(x);
    }
  }
  return bands;
}

function escapeCell(text: string): string {
  return text.replace(/\|/g, "\\|").trim();
}

// Attempts to render a run of body lines as a GFM table via x-position
// clustering. Returns null (caller falls back to a bullet list) when the
// column shape doesn't come out consistent enough to trust - a broken table
// looks authoritative in a way a bullet list doesn't, so an uncertain
// cluster result is treated as no result at all rather than a best guess.
function tryRenderTable(lines: Line[]): string[] | null {
  if (lines.length < TABLE_MIN_ROWS) return null;
  const multiItemLines = lines.filter((l) => l.items.length >= 2);
  if (multiItemLines.length < TABLE_MIN_ROWS) return null;

  const allStarts = multiItemLines.flatMap((l) => l.items.map((it) => it.x));
  const bands = clusterColumns(allStarts);
  if (bands.length < 2 || bands.length > 6) return null;

  // Every candidate row must place each of its items into a distinct band -
  // two items landing in the same band on one row means the clustering
  // doesn't actually describe this row's layout, so bail rather than guess.
  const bandOf = (x: number) => {
    let best = 0;
    let bestDist = Infinity;
    bands.forEach((b, i) => {
      const d = Math.abs(x - b);
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    });
    return bestDist <= COLUMN_X_TOLERANCE ? best : -1;
  };

  const rows: string[][] = [];
  for (const line of lines) {
    const cells = Array(bands.length).fill("");
    const usedBands = new Set<number>();
    let ok = true;
    for (const item of line.items) {
      const b = bandOf(item.x);
      if (b === -1 || usedBands.has(b)) {
        ok = false;
        break;
      }
      usedBands.add(b);
      cells[b] = cells[b] ? `${cells[b]} ${item.str}` : item.str;
    }
    if (!ok) return null;
    rows.push(cells.map(escapeCell));
  }

  const colCount = bands.length;
  const header = "|" + " |".repeat(colCount);
  const sep = "|" + " --- |".repeat(colCount);
  const body = rows.map((r) => `| ${r.join(" | ")} |`);
  return ["", header, sep, ...body, ""];
}

function renderAsBulletList(lines: Line[]): string[] {
  return lines.map((l) => `- ${lineText(l)}`);
}

// Groups consecutive non-heading, non-table lines into paragraphs: PDF line
// breaks are a function of page width, not sentence structure, so lines
// closer together than PARAGRAPH_BREAK_RATIO * the page's typical line
// pitch are joined into one paragraph rather than kept as separate lines.
function renderParagraphs(lines: Line[]): string[] {
  if (lines.length === 0) return [];
  const gaps: number[] = [];
  for (let i = 1; i < lines.length; i++) gaps.push(lines[i - 1].y - lines[i].y);
  const pitch = median(gaps.filter((g) => g > 0)) || 14;

  const out: string[] = [];
  let current: string[] = [lineText(lines[0])];
  for (let i = 1; i < lines.length; i++) {
    const gap = lines[i - 1].y - lines[i].y;
    if (gap > pitch * PARAGRAPH_BREAK_RATIO) {
      out.push(current.join(" "), "");
      current = [lineText(lines[i])];
    } else {
      current.push(lineText(lines[i]));
    }
  }
  out.push(current.join(" "));
  return out;
}

// A single-item line is a normal sentence/word wrapped by page width - prose.
// A 2+-item line is where the page has more than one thing side by side on
// the same baseline - the shape a table row or a label/value pair produces.
// Mixing the two into one clustering pass is exactly how a paragraph that
// happens to sit right above a table gets its sentences forced into that
// table's columns, so a run is split the moment its shape changes, before
// table-vs-paragraph is decided for either side.
function isMultiItem(line: Line): boolean {
  return line.items.length >= 2;
}

function renderSegment(segment: Line[]): string[] {
  if (segment.length === 0) return [];
  const table = isMultiItem(segment[0]) ? tryRenderTable(segment) : null;
  if (table) return table;
  // A short run of multi-item lines that didn't cluster into a confident
  // table still reads more honestly as a list than as a run-on paragraph -
  // each line was two or more distinct pieces of text side by side, and
  // joining them with spaces would blur that back together.
  if (isMultiItem(segment[0])) return [...renderAsBulletList(segment), ""];
  return [...renderParagraphs(segment), ""];
}

function renderPage(items: StructuredTextItem[], bodySize: number): string[] {
  const lines = groupIntoLines(items);
  const tagged = tagHeadings(lines, bodySize);

  const out: string[] = [];
  let segment: Line[] = [];

  function flushSegment() {
    if (segment.length > 0) out.push(...renderSegment(segment));
    segment = [];
  }

  for (const t of tagged) {
    if (t.kind === "heading") {
      flushSegment();
      out.push(`${"#".repeat(t.level)} ${t.text}`, "");
      continue;
    }
    if (segment.length > 0 && isMultiItem(segment[0]) !== isMultiItem(t.line)) {
      flushSegment();
    }
    segment.push(t.line);
  }
  flushSegment();
  return out;
}

export async function pdfToMarkdown(
  bytes: Uint8Array,
): Promise<{ markdown: string; pages: number }> {
  const { extractTextItems } = await import("unpdf");
  const { totalPages, items } = await extractTextItems(bytes);

  const allSizes = items.flat().map((it) => it.fontSize).filter((s) => s > 0);
  const bodySize = median(allSizes);

  const pageBlocks = items.map((pageItems) => renderPage(pageItems, bodySize));
  const markdown = pageBlocks
    .map((block) => block.join("\n").replace(/\n{3,}/g, "\n\n").trim())
    .filter(Boolean)
    .join("\n\n");

  return { markdown, pages: totalPages ?? pageBlocks.length };
}
