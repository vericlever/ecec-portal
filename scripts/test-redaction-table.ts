// Step 59 revision A security check: a planted test identity inside a
// spreadsheet table cell (CSV and XLSX) comes out redacted after the markdown
// table conversion in src/lib/documents/outcome-extract.ts. Table pipes must
// not stop Comprehend or the second pass catching the identifiers, and the
// table structure should survive.
//
// REQUIRES LIVE AWS CREDENTIALS (Comprehend, ap-southeast-2).
//
//   npx tsx scripts/test-redaction-table.ts
//
// Made-up data only. Never put real incident details in this file.

import fs from "node:fs";
import path from "node:path";
import ExcelJS from "exceljs";
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

const ROWS: string[][] = [
  ["Date", "Service", "Description", "Contact"],
  [
    "12/03/2026",
    "Timboon",
    "Jordan Alexander Fakename (DOB 4 July 2019) had a minor fall. Jordan's mother Sarah Fakename was told at pickup.",
    "0412 345 678",
  ],
  ["15/03/2026", "Timboon", "Medicare 2123 45670 1 sighted. Address 42 Testing Street, Warrnambool VIC 3280.", "(03) 5555 1234"],
  ["20/03/2026", "Mortlake", "Pipe | in a cell, then a near miss on the slide.", ""],
];

const PLANTED = [
  { label: "child's full name", needle: "Jordan Alexander Fakename" },
  { label: "child's first name", needle: /\bJordan\b/ },
  { label: "date of birth", needle: "4 July 2019" },
  { label: "Medicare number", needle: "2123 45670 1" },
  { label: "Medicare fragment (first group)", needle: /\b2123\b/ },
  { label: "address", needle: "42 Testing Street" },
  { label: "mobile phone", needle: "0412 345 678" },
  { label: "landline phone", needle: "(03) 5555 1234" },
  { label: "mother's name", needle: "Sarah Fakename" },
];

async function toXlsx(): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Incidents");
  for (const r of ROWS) ws.addRow(r);
  return new Uint8Array(await wb.xlsx.writeBuffer());
}

async function runOne(name: string, fileName: string, bytes: Uint8Array): Promise<boolean> {
  const extracted = await extractOutcomeDocument(fileName, bytes);
  if (!extracted.ok) {
    console.log(`${name}: FAIL, extraction error: ${extracted.error}`);
    return false;
  }
  const isTable = /^\|.*\|\n\| ?---/m.test(extracted.text);
  const result = await redactOutcomeText(extracted.text, ["Sarah Fakename"]);
  const leaks = PLANTED.filter(({ needle }) =>
    typeof needle === "string" ? result.redacted.includes(needle) : needle.test(result.redacted),
  ).map((l) => l.label);
  const tableSurvived = /^\|.*\|\n\| ?---/m.test(result.redacted);
  console.log(`\n--- ${name} ---\n${result.redacted}\n`);
  console.log(`${name}: markdown table built: ${isTable}, survived redaction: ${tableSurvived}, leaks: ${leaks.length ? leaks.join(", ") : "none"}`);
  return isTable && tableSurvived && leaks.length === 0;
}

async function main() {
  const csv = new TextEncoder().encode(
    ROWS.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(",")).join("\n"),
  );
  const results = [
    await runOne("csv", "register.csv", csv),
    await runOne("xlsx", "register.xlsx", await toXlsx()),
  ];
  if (results.every(Boolean)) {
    console.log("\nPASS: planted identity redacted inside table cells and the table survived.");
  } else {
    console.log("\nFAIL");
    process.exit(1);
  }
}

main().catch((e) => {
  console.error("FAILED:", e);
  process.exit(1);
});
