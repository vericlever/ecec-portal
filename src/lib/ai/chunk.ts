// Splits a policy/procedure's stored Markdown (published_body, Step 56's
// pipeline) into retrieval chunks - by heading, not fixed character count,
// so a retrieved chunk reads as a coherent answer rather than a mid-thought
// fragment (build spec, "Chunking").
//
// Two things this deliberately strips before a chunk is ever embedded:
//
// 1. The leading metadata table (Approved Provider / Applies to / Policy
//    owner / Version / Adopted / Next review / Source template). Identified
//    by POSITION - the first Markdown table appearing before any heading -
//    not by matching RSG's own field labels, the same shape-only philosophy
//    Step 56 already established for grouping-row detection. Left in, this
//    table would otherwise compete as a near-match against genuine content
//    for almost any query (the spec's own warning).
//
// 2. Image placeholder text (`*(Image...)*` / `*(Image: ...)*`, written by
//    src/lib/documents/markdown.ts's image rule). A chunk that is only a
//    placeholder is dropped entirely; a placeholder line inside an otherwise
//    real chunk is stripped rather than embedded as if it were content.
//
// 3. The trailing regulatory-compliance footer every policy generated from
//    this org's document template carries: a "QUALITY AREA N: ..." heading
//    per NQS quality area (a cross-reference table, not guidance), followed
//    eventually by a "PREVIOUS MODIFICATIONS" changelog and often further
//    reference/citation material after that. Found in practice: this
//    boilerplate is near-identical across most of the library, so once
//    indexed it dominates retrieval by sheer repetition and crowds out the
//    document's actual content - a search for an unrelated question was
//    consistently answered from whichever policy's copy of this footer
//    happened to embed closest to the query, not from any real match.
//    Detected by heading text rather than position, since unlike the
//    metadata table this section can start anywhere in a document depending
//    on how much real content precedes it - but the heading wording itself
//    is fixed by the shared template, not authored per policy, so matching
//    it is no more "this org's own labels" than matching the metadata
//    table's shape. Once the first such heading is found, everything from
//    there to the end of the document is dropped before chunking.

export type Chunk = {
  heading: string | null;
  text: string;
};

const IMAGE_PLACEHOLDER = /^\*\(Image(?::[^)]*)?\s*(?:-[^)]*)?\)\*$/;
const HEADING_LINE = /^(#{1,3})\s+(.+?)\s*$/;
const TABLE_ROW = /^\|.*\|$/;
const TABLE_SEPARATOR = /^\|?(\s*:?-+:?\s*\|)+\s*$/;
const TRAILING_BOILERPLATE_HEADING = /^(?:QUALITY AREA \d+\b|PREVIOUS MODIFICATIONS)/i;

// A generous cap before a single heading's content gets split further. Most
// documents are a few KB; a handful of large policies run to tens of KB
// under one section - cheap insurance against an oversized chunk, not a
// general-purpose splitter.
const MAX_CHUNK_CHARS = 6000;

function stripLeadingMetadataTable(lines: string[]): string[] {
  let i = 0;
  // Skip any lines before the table starts, as long as none of them is a
  // heading - if a heading appears first, there is no leading metadata
  // table to strip (the document doesn't follow that shape).
  while (i < lines.length) {
    const line = lines[i];
    if (HEADING_LINE.test(line)) return lines;
    if (TABLE_ROW.test(line) && lines[i + 1] && TABLE_SEPARATOR.test(lines[i + 1])) break;
    i++;
  }
  if (i >= lines.length) return lines;

  const tableStart = i;
  let tableEnd = i + 2; // header row + separator row already confirmed
  while (tableEnd < lines.length && TABLE_ROW.test(lines[tableEnd])) tableEnd++;

  return [...lines.slice(0, tableStart), ...lines.slice(tableEnd)];
}

function stripTrailingBoilerplate(lines: string[]): string[] {
  const cutIndex = lines.findIndex((line) => {
    const match = HEADING_LINE.exec(line);
    return Boolean(match && TRAILING_BOILERPLATE_HEADING.test(match[2]));
  });
  return cutIndex === -1 ? lines : lines.slice(0, cutIndex);
}

function stripImagePlaceholders(text: string): string {
  return text
    .split("\n")
    .filter((line) => !IMAGE_PLACEHOLDER.test(line.trim()))
    .join("\n");
}

function splitOversized(chunk: Chunk): Chunk[] {
  if (chunk.text.length <= MAX_CHUNK_CHARS) return [chunk];
  const paragraphs = chunk.text.split(/\n\n+/);
  const parts: string[] = [];
  let current = "";
  for (const p of paragraphs) {
    if (current && (current.length + p.length + 2) > MAX_CHUNK_CHARS) {
      parts.push(current);
      current = p;
    } else {
      current = current ? `${current}\n\n${p}` : p;
    }
  }
  if (current) parts.push(current);
  return parts.map((text) => ({ heading: chunk.heading, text }));
}

export function chunkMarkdown(markdown: string): Chunk[] {
  const lines = stripTrailingBoilerplate(stripLeadingMetadataTable(markdown.split("\n")));

  const raw: Chunk[] = [];
  let currentHeading: string | null = null;
  let currentLines: string[] = [];

  function flush() {
    const text = stripImagePlaceholders(currentLines.join("\n")).trim();
    if (text) raw.push({ heading: currentHeading, text });
    currentLines = [];
  }

  for (const line of lines) {
    const match = HEADING_LINE.exec(line);
    if (match) {
      flush();
      currentHeading = match[2];
      continue;
    }
    currentLines.push(line);
  }
  flush();

  return raw.flatMap(splitOversized);
}
