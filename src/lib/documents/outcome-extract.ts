// Step 59, B4: outcome record extraction. Reuses Step 56's extractDocument()
// for text-native formats but does NOT call storeDocument - the spec is
// explicit that outcome uploads never keep the original file, only the
// redacted text and a hash of the original (B5.7). Everything below returns
// plain extracted text for the redaction pipeline (src/lib/redaction.ts) to
// process; nothing here writes to Storage or the database.

import { PDFDocument } from "pdf-lib";
import sharp from "sharp";
import { TextractClient, DetectDocumentTextCommand } from "@aws-sdk/client-textract";
import ExcelJS from "exceljs";
import Papa from "papaparse";
import { extractDocument } from "./extract";

const REGION = "ap-southeast-2";
const MAX_SCANNED_PAGES = 20;
const MAX_FILE_BYTES = 20 * 1024 * 1024; // B4: maximum 20 MB

let cachedTextractClient: TextractClient | null = null;
function textractClient(): TextractClient {
  if (cachedTextractClient) return cachedTextractClient;
  cachedTextractClient = new TextractClient({ region: REGION });
  return cachedTextractClient;
}

export type OutcomeExtractResult =
  | { ok: true; text: string; format: string }
  | { ok: false; error: string };

async function textractPage(bytes: Uint8Array): Promise<string> {
  const command = new DetectDocumentTextCommand({ Document: { Bytes: bytes } });
  const response = await textractClient().send(command);
  const lines = (response.Blocks ?? [])
    .filter((b) => b.BlockType === "LINE")
    .map((b) => b.Text ?? "");
  return lines.join("\n");
}

async function extractScannedPdf(bytes: Uint8Array): Promise<OutcomeExtractResult> {
  const source = await PDFDocument.load(bytes);
  const pageCount = source.getPageCount();
  if (pageCount > MAX_SCANNED_PAGES) {
    return { ok: false, error: `This PDF has ${pageCount} pages - the maximum for a scanned document is ${MAX_SCANNED_PAGES}.` };
  }

  const pageTexts: string[] = [];
  for (let i = 0; i < pageCount; i++) {
    const single = await PDFDocument.create();
    const [copied] = await single.copyPages(source, [i]);
    single.addPage(copied);
    const pageBytes = await single.save();
    pageTexts.push(await textractPage(pageBytes));
  }

  return { ok: true, text: pageTexts.join("\n\n"), format: "pdf-scanned" };
}

async function extractImage(bytes: Uint8Array): Promise<OutcomeExtractResult> {
  const text = await textractPage(bytes);
  return { ok: true, text, format: "image" };
}

async function convertToPng(bytes: Uint8Array, ext: string): Promise<Uint8Array> {
  if (ext === "heic") {
    // heic-convert has no TypeScript types published; its runtime shape is
    // a single default export function, imported dynamically since it's
    // only needed on this one path.
    const heicConvert = (await import("heic-convert")).default as (opts: {
      buffer: Buffer;
      format: "PNG";
    }) => Promise<Buffer>;
    const png = await heicConvert({ buffer: Buffer.from(bytes), format: "PNG" });
    return new Uint8Array(png);
  }
  // webp and anything else sharp can read.
  const png = await sharp(bytes).png().toBuffer();
  return new Uint8Array(png);
}

// Rows become a GFM markdown table: the first row is the header, which is
// what a register export almost always is. Pipes and line breaks inside a
// cell are escaped so a cell can never break the table (or the redaction
// pass, which runs over this text afterwards).
function rowsToMarkdownTable(rows: string[][]): string {
  const clean = (v: string) => v.replace(/\r?\n+/g, " ").replace(/\|/g, "\\|").trim();
  const nonEmpty = rows.filter((r) => r.some((c) => c.trim() !== ""));
  if (nonEmpty.length === 0) return "";
  const width = Math.max(...nonEmpty.map((r) => r.length));
  const pad = (r: string[]) => Array.from({ length: width }, (_, i) => clean(r[i] ?? ""));
  const [header, ...body] = nonEmpty.map(pad);
  const line = (cells: string[]) => `| ${cells.join(" | ")} |`;
  return [line(header), line(header.map(() => "---")), ...body.map(line)].join("\n");
}

async function extractSpreadsheet(bytes: Uint8Array, ext: string): Promise<OutcomeExtractResult> {
  if (ext === "csv") {
    const text = new TextDecoder().decode(bytes);
    const parsed = Papa.parse<string[]>(text, { skipEmptyLines: true });
    return { ok: true, text: rowsToMarkdownTable(parsed.data), format: "csv" };
  }

  const workbook = new ExcelJS.Workbook();
  // exceljs's published types predate @types/node's generic Buffer<T>,
  // and the mismatch survives even a `Buffer` cast (an unrelated stricter
  // Buffer type is in scope) - the runtime value is a real Buffer either way.
  await workbook.xlsx.load(Buffer.from(bytes) as any);
  const sections: string[] = [];
  workbook.eachSheet((sheet) => {
    const rows: string[][] = [];
    sheet.eachRow((row) => {
      rows.push((row.values as unknown[]).slice(1).map((v) => (v == null ? "" : String(v))));
    });
    const table = rowsToMarkdownTable(rows);
    if (table) sections.push(`## ${sheet.name}\n\n${table}`);
  });
  return { ok: true, text: sections.join("\n\n"), format: ext };
}

export async function extractOutcomeDocument(fileName: string, bytes: Uint8Array): Promise<OutcomeExtractResult> {
  if (bytes.byteLength > MAX_FILE_BYTES) {
    return { ok: false, error: "This file is over 20 MB. Save it as a smaller file and try again." };
  }

  const ext = fileName.toLowerCase().split(".").pop() ?? "";

  if (ext === "pdf") {
    // Try the text-layer path first (Step 56's heuristic extraction). If it
    // comes back with little or no text, this is almost certainly a scan -
    // same threshold extract.ts itself uses to warn about scanned PDFs.
    //
    // Pass a COPY of bytes here, not the original reference: unpdf's PDF.js
    // internals transfer the underlying ArrayBuffer during parsing, which
    // detaches it - by the time extractScannedPdf() below tried to load the
    // same `bytes` reference, it found an empty buffer and threw "No PDF
    // header found". Found live, 28 September 2026, testing a genuinely
    // scanned (image-only) PDF - this was silently broken for exactly the
    // documents this fallback exists to handle.
    const textLayerResult = await extractDocument(fileName, bytes.slice());
    if (textLayerResult.text.trim().length >= 20) {
      return { ok: true, text: textLayerResult.text, format: "pdf-text" };
    }
    return extractScannedPdf(bytes);
  }

  if (["jpg", "jpeg", "png", "tif", "tiff"].includes(ext)) {
    return extractImage(bytes);
  }

  if (["heic", "webp"].includes(ext)) {
    try {
      const png = await convertToPng(bytes, ext);
      return extractImage(png);
    } catch (e) {
      return { ok: false, error: `Could not convert this ${ext.toUpperCase()} file: ${e instanceof Error ? e.message : "unknown error"}` };
    }
  }

  if (["xlsx", "xls", "csv"].includes(ext)) {
    try {
      return await extractSpreadsheet(bytes, ext);
    } catch (e) {
      return { ok: false, error: `Could not read this spreadsheet: ${e instanceof Error ? e.message : "unknown error"}` };
    }
  }

  if (["docx", "html", "htm", "md", "markdown", "txt"].includes(ext)) {
    const result = await extractDocument(fileName, bytes);
    if (!result.text.trim()) {
      return { ok: false, error: result.note ?? "No readable text found in the document." };
    }
    return { ok: true, text: result.text, format: ext };
  }

  return { ok: false, error: "This file type isn't supported. Save it as PDF or Word and try again." };
}
