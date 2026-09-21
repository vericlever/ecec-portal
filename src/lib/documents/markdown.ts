import TurndownService from "turndown";
import {
  gfm as turndownGfm,
  highlightedCodeBlock,
  strikethrough,
  taskListItems,
} from "turndown-plugin-gfm";

// docx and html both land here on the way to Markdown (mammoth converts docx
// to HTML first, so this is the shared HTML -> Markdown step for both).
//
// turndown-plugin-gfm's own table rule only converts a <table> whose FIRST
// ROW is made of genuine <th> cells (verified directly against the installed
// package, not assumed - see node_modules/turndown-plugin-gfm's isHeadingRow).
// A label/value metadata table or a code+description reference table has no
// such header row at all - Word doesn't mark one, because there is no column
// title to give it - so the stock rule leaves the WHOLE table as raw,
// unconverted HTML via its `keep()` call. That's the exact failure this file
// exists to avoid: every table below is guaranteed to become a real GFM
// table, with a blank header row synthesised when the source has no genuine
// one, rather than silently falling back to HTML for the one document shape
// (metadata blocks, reference tables) this step was written for.

function isHeadingRow(tr: HTMLTableRowElement): boolean {
  const parent = tr.parentNode as (HTMLElement & { previousSibling?: ChildNode | null }) | null;
  if (!parent) return false;
  if (parent.nodeName === "THEAD") return true;
  const isFirstTbody =
    parent.nodeName === "TBODY" &&
    (!parent.previousSibling ||
      (parent.previousSibling.nodeName === "THEAD" &&
        /^\s*$/.test(parent.previousSibling.textContent ?? "")));
  if (parent.firstChild === tr && (parent.nodeName === "TABLE" || isFirstTbody)) {
    return Array.prototype.every.call(
      tr.childNodes,
      (n: ChildNode) => n.nodeName === "TH",
    );
  }
  return false;
}

function cell(content: string, node: HTMLTableCellElement): string {
  const index = Array.prototype.indexOf.call(node.parentNode!.childNodes, node);
  const prefix = index === 0 ? "| " : " ";
  const cleaned = content.trim().replace(/\n+/g, " ").replace(/\|/g, "\\|");
  return prefix + cleaned + " |";
}

// Mammoth embeds every image it can read as a data-URI <img src="data:...">
// - correct HTML, but turndown's default image rule would then bake that
// whole base64 blob straight into the stored Markdown body (a single
// embedded screenshot can run to tens of KB of encoded text). The body field
// is for staff read-and-sign content, not full-fidelity reproduction - the
// original file stays attached and downloadable for that - so an image
// becomes a short placeholder instead, using the docx's own alt text when
// the author set one.
function addImageRule(turndownService: TurndownService) {
  turndownService.addRule("image", {
    filter: "img",
    replacement: (_content, node) => {
      const alt = (node as HTMLImageElement).getAttribute("alt")?.trim();
      return alt ? `*(Image: ${alt})*` : "*(Image - see the original uploaded document.)*";
    },
  });
}

function addTableRules(turndownService: TurndownService) {
  turndownService.addRule("tableCell", {
    filter: ["th", "td"],
    replacement: (content, node) => cell(content, node as HTMLTableCellElement),
  });

  turndownService.addRule("tableRow", {
    filter: "tr",
    replacement: (content, node) => {
      const tr = node as HTMLTableRowElement;
      let border = "";
      if (isHeadingRow(tr)) {
        for (let i = 0; i < tr.childNodes.length; i++) {
          border += cell("---", tr.childNodes[i] as HTMLTableCellElement);
        }
      }
      return "\n" + content + (border ? "\n" + border : "");
    },
  });

  turndownService.addRule("tableSection", {
    filter: ["thead", "tbody", "tfoot"],
    replacement: (content) => content,
  });

  // Registered after (and so takes priority over) the gfm plugin's own
  // `table` rule / `keep()` exclusion - this one filters on nodeName alone,
  // matching every table regardless of whether it has a real header.
  turndownService.addRule("table", {
    filter: (node) => node.nodeName === "TABLE",
    replacement: (content, node) => {
      const table = node as HTMLTableElement;
      const hasRealHeader = table.rows.length > 0 && isHeadingRow(table.rows[0]);
      let out = content.replace(/\n\n/g, "\n");
      if (!hasRealHeader) {
        // Column count from the widest row, not row 0 - row 0 might itself
        // be a grouping row (fewer cells via colspan) and would otherwise
        // under-count the table's real width.
        let colCount = 1;
        for (let i = 0; i < table.rows.length; i++) {
          colCount = Math.max(colCount, table.rows[i].childNodes.length);
        }
        const blank = "|" + " |".repeat(colCount);
        const sep = "|" + " --- |".repeat(colCount);
        out = "\n" + blank + "\n" + sep + out;
      }
      return "\n\n" + out.trim() + "\n\n";
    },
  });
}

let cachedService: TurndownService | null = null;

function turndownService(): TurndownService {
  if (cachedService) return cachedService;
  const service = new TurndownService({
    headingStyle: "atx",
    bulletListMarker: "-",
  });
  service.use([highlightedCodeBlock, strikethrough, taskListItems]);
  addImageRule(service);
  addTableRules(service);
  cachedService = service;
  return service;
}

export function htmlToMarkdown(html: string): string {
  return turndownService().turndown(html);
}

// Re-exported so callers that want the raw gfm table/cell escaping without
// the custom always-convert table rule can still reach for it - unused today
// but keeps the module's one turndown-plugin-gfm dependency point in one
// place rather than importing it again elsewhere.
export { turndownGfm };

const MAX_HEADING_LENGTH = 60;

// A grouping-row candidate: short, multi-word, and every letter in it is
// uppercase. The multi-word requirement is load-bearing, not cosmetic - a
// reference code like "QA2" or "CSS9" is *also* all-uppercase-once-digits-
// are-stripped, and reference codes are exactly the data this table exists
// to hold, so requiring a space is what tells "QUALITY AREA" (a section
// title) apart from "QA2" (a row of actual content) using shape alone.
function looksLikeGroupingText(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed || trimmed.length > MAX_HEADING_LENGTH) return false;
  if (!/\s/.test(trimmed)) return false;
  const letters = trimmed.replace(/[^A-Za-z]/g, "");
  if (letters.length === 0) return false;
  return letters === letters.toUpperCase();
}

// Splits a single pipe-delimited row into its cell texts, respecting `\|`
// as an escaped literal pipe rather than a column boundary (the same
// escaping `cell()` above applies when writing them).
function splitRowCells(row: string): string[] {
  const inner = row.replace(/^\|/, "").replace(/\|$/, "");
  const cells: string[] = [];
  let current = "";
  for (let i = 0; i < inner.length; i++) {
    if (inner[i] === "\\" && inner[i + 1] === "|") {
      current += "|";
      i++;
      continue;
    }
    if (inner[i] === "|") {
      cells.push(current.trim());
      current = "";
      continue;
    }
    current += inner[i];
  }
  cells.push(current.trim());
  return cells;
}

function isTableRowLine(line: string): boolean {
  return /^\|.*\|$/.test(line.trim());
}
function isSeparatorLine(line: string): boolean {
  return /^\|?(\s*:?-+:?\s*\|)+\s*$/.test(line.trim());
}

// The one bespoke docx/html rule (conversion rule 3): find a table row that
// is, by shape alone, a section-title row rather than a data row - exactly
// one non-empty cell, and that cell's text is short and fully upper-case -
// and promote it to a "### " heading placed above a fresh continuation of
// the same table, rather than leaving it as a nonsensical single-cell row
// sitting inside an otherwise two-column table. Deliberately shape-only: it
// never looks at what the text actually says, so a different tenant's own
// section titles (whatever wording their template uses) are promoted the
// same way RSG's "QUALITY AREA" / "CHILD SAFE STANDARD" rows are.
//
// A row that's CLOSE to this shape but not an exact match (the all-caps
// cell has other non-empty cells alongside it) is deliberately left alone
// and counted as ambiguous instead of guessed at - the caller uses that
// count to flag the document for manual review.
export function promoteGroupingRows(markdown: string): {
  markdown: string;
  ambiguousCount: number;
} {
  const lines = markdown.split("\n");
  const out: string[] = [];
  let ambiguousCount = 0;

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!isTableRowLine(line) || isSeparatorLine(line)) {
      out.push(line);
      i++;
      continue;
    }

    // Start of a table block: header line, then its separator, kept but not
    // emitted yet - only printed right before the first real data row, so a
    // table whose very first row is a grouping row doesn't leave an empty
    // header+separator dangling above the heading it promotes to.
    const headerLine = line;
    const separatorLine = lines[i + 1] && isSeparatorLine(lines[i + 1]) ? lines[i + 1] : null;
    if (!separatorLine) {
      // Not actually a table (no separator followed) - leave untouched.
      out.push(line);
      i++;
      continue;
    }
    i += 2;

    let tableOpen = false;
    while (i < lines.length && isTableRowLine(lines[i])) {
      const rowLine = lines[i];
      const cells = splitRowCells(rowLine);
      const nonEmpty = cells.filter((c) => c.length > 0);

      if (nonEmpty.length === 1 && looksLikeGroupingText(nonEmpty[0])) {
        // The cell was very likely already bold in the source (that's often
        // *why* it reads as a section title), which turndown renders as
        // **text** - strip that wrapping rather than nest it inside a
        // heading, which is already visually distinct on its own.
        const headingText = nonEmpty[0].replace(/^\*\*(.+)\*\*$/, "$1");
        out.push("", `### ${headingText}`, "");
        tableOpen = false;
        i++;
        continue;
      }

      if (
        nonEmpty.length > 1 &&
        cells.some((c) => c.length > 0 && looksLikeGroupingText(c))
      ) {
        // Looks heading-ish but doesn't cleanly match the shape - leave the
        // row exactly as it was, but don't silently treat it as fine either.
        ambiguousCount++;
      }

      if (!tableOpen) {
        // Open (or re-open, after a promoted heading) a table for the rows
        // that follow, reusing the same column shape throughout.
        out.push(headerLine, separatorLine);
        tableOpen = true;
      }
      out.push(rowLine);
      i++;
    }
  }

  return { markdown: out.join("\n"), ambiguousCount };
}
