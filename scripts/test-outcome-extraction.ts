// Step 59, B4/B5: exercises the outcome-record extraction pipeline against
// real AWS Textract, for the two format branches that need real OCR - a
// plain image and a genuinely scanned (image-only, no text layer) PDF -
// followed by real Comprehend redaction on the result.
//
// REQUIRES LIVE AWS CREDENTIALS (Textract + Comprehend, ap-southeast-2).
//
//   npx tsx scripts/test-outcome-extraction.ts
//
// Test 2 caught a real, previously-undetected bug on first run (28 September
// 2026): unpdf's PDF.js internals transfer (detach) the input ArrayBuffer
// while checking for a text layer, so by the time the scanned-PDF fallback
// tried to load the SAME bytes reference, it found an empty buffer and threw
// "No PDF header found" - silently broken for exactly the documents that
// fallback exists to handle. Fixed in src/lib/documents/outcome-extract.ts
// by passing a copy of the bytes to the text-layer check. Keep this script
// and re-run it after any change to outcome-extract.ts.
//
// Test 2 builds its scanned PDF from embedded PNG pages (pdf-lib's
// embedPng/drawImage), not drawText() - a drawText() PDF has a real text
// layer and would exercise the wrong branch (the "PDF with a text layer"
// path), not the scanned/Textract-per-page path this test is for.

import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { PDFDocument } from "pdf-lib";
import { extractOutcomeDocument } from "../src/lib/documents/outcome-extract";
import { redactOutcomeText } from "../src/lib/redaction";

function loadEnv() {
  const file = path.join(process.cwd(), ".env.local");
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}
loadEnv();

async function testImageFullPipeline() {
  console.log("=== TEST 1: Image (PNG) -> Textract -> Comprehend redaction ===\n");
  const svg = `
  <svg width="800" height="300" xmlns="http://www.w3.org/2000/svg">
    <rect width="800" height="300" fill="white"/>
    <text x="40" y="50" font-family="Arial" font-size="20" fill="black">Child: Jordan Alexander Fakename, DOB 4 July 2019</text>
    <text x="40" y="90" font-family="Arial" font-size="20" fill="black">Mother contacted: 0412 345 678</text>
    <text x="40" y="130" font-family="Arial" font-size="20" fill="black">Minor fall in outdoor play area, no first aid needed.</text>
  </svg>`;
  const png = await sharp(Buffer.from(svg)).png().toBuffer();

  const extracted = await extractOutcomeDocument("photo.png", new Uint8Array(png));
  if (!extracted.ok) throw new Error(extracted.error);
  console.log("Extracted:", extracted.text.replace(/\n/g, " | "));

  const redacted = await redactOutcomeText(extracted.text, []);
  console.log("Redacted: ", redacted.redacted.replace(/\n/g, " | "));
  const leaked = ["Jordan", "0412 345 678", "4 July 2019"].filter((s) => redacted.redacted.includes(s));
  console.log(leaked.length === 0 ? "PASS: no leaks\n" : `FAIL: leaked ${leaked}\n`);
}

async function testScannedPdfFullPipeline() {
  console.log("=== TEST 2: Scanned (image-only, no text layer) 2-page PDF -> per-page Textract ===\n");

  async function pageImage(lines: string[]): Promise<Buffer> {
    const svg = `<svg width="600" height="300" xmlns="http://www.w3.org/2000/svg">
      <rect width="600" height="300" fill="white"/>
      ${lines.map((l, i) => `<text x="40" y="${60 + i * 40}" font-family="Arial" font-size="18" fill="black">${l}</text>`).join("\n")}
    </svg>`;
    return sharp(Buffer.from(svg)).png().toBuffer();
  }

  const doc = await PDFDocument.create();
  const img1 = await doc.embedPng(await pageImage(["Page 1: Incident involving", "Jordan Alexander Fakename", "Contact number: 0412 345 678"]));
  const page1 = doc.addPage([600, 300]);
  page1.drawImage(img1, { x: 0, y: 0, width: 600, height: 300 });

  const img2 = await doc.embedPng(await pageImage(["Page 2: Follow-up notes", "No further action required."]));
  const page2 = doc.addPage([600, 300]);
  page2.drawImage(img2, { x: 0, y: 0, width: 600, height: 300 });

  const pdfBytes = await doc.save();

  const extracted = await extractOutcomeDocument("scanned-form.pdf", pdfBytes);
  if (!extracted.ok) throw new Error(extracted.error);
  console.log("Format used:", extracted.format, "(should be pdf-scanned, confirming the Textract-per-page branch ran)");
  console.log("Extracted:\n", extracted.text);

  const expected = ["Jordan Alexander Fakename", "0412 345 678", "Follow-up notes", "No further action required"];
  const missing = expected.filter((p) => !extracted.text.includes(p));
  console.log(missing.length === 0 ? "\nPASS: both pages correctly OCR'd via Textract.\n" : `\nFAIL: missing ${missing}\n`);
}

async function main() {
  await testImageFullPipeline();
  await testScannedPdfFullPipeline();
}

main().catch((e) => {
  console.error("FAILED:", e);
  process.exit(1);
});
