// Step 59 security check: "A planted test identity (made-up name, date of
// birth, Medicare-format number, address and phone) comes out redacted in
// every format." This is the text-based half of that check (the
// upload/extraction formats themselves - PDF, image, spreadsheet - need
// testing through the actual upload flow, not this script).
//
// REQUIRES LIVE AWS CREDENTIALS (Comprehend, ap-southeast-2).
//
//   npx tsx scripts/test-redaction.ts
//
// Caught a real bug on first run (28 September 2026): Comprehend does not
// reliably tag every mention of a name in the same text - "Jordan's mother"
// leaked the child's first name unredacted even though "Jordan Alexander
// Fakename" and a later bare "Jordan" were both caught. Fixed in
// src/lib/redaction.ts with a second sweep for repeated mentions of any name
// fragment Comprehend found elsewhere in the same text. Keep this script and
// re-run it after any change to redaction.ts.

import fs from "node:fs";
import path from "node:path";
import { redactOutcomeText } from "../src/lib/redaction";

function loadEnv() {
  const file = path.join(process.cwd(), ".env.local");
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}
loadEnv();

// Planted test identity: made-up name, DOB, Medicare number, WWCC number,
// address and phone (mobile + landline). Never real data. The child's first
// name is deliberately repeated several times, including a possessive form,
// since that repetition is exactly what caught the real bug above.
const testText = `
Incident report - Timboon service.

On the afternoon of 12 March 2026, Jordan Alexander Fakename (DOB 4 July 2019)
had a minor fall in the outdoor play area. Jordan's mother, Sarah Fakename, was
contacted at 0412 345 678 and provided her address as 42 Testing Street,
Warrnambool VIC 3280 for the incident record.

Jordan's Medicare number is 2123 45670 1, sighted for the enrolment file.
Staff member Kim Educator (WWC1234567E) completed the report and can be
reached on (03) 5555 1234.

No first aid was required. Jordan was comforted and returned to play within
five minutes. Parent was informed at pickup.
`;

const PLANTED_IDENTIFIERS = [
  { label: "child's full name", needle: "Jordan Alexander Fakename" },
  { label: "child's first name (any mention)", needle: /\bJordan\b/ },
  { label: "date of birth", needle: "4 July 2019" },
  { label: "Medicare number", needle: "2123 45670 1" },
  { label: "WWCC number", needle: "WWC1234567E" },
  { label: "address", needle: "42 Testing Street" },
  { label: "mobile phone", needle: "0412 345 678" },
  { label: "landline phone", needle: "(03) 5555 1234" },
  { label: "mother's name", needle: "Sarah Fakename" },
];

async function main() {
  console.log("Original text:\n", testText);
  console.log("\n" + "=".repeat(80) + "\n");

  const staffNames = ["Kim Educator", "Sarah Fakename"]; // simulating tenant staff list

  const result = await redactOutcomeText(testText, staffNames);
  console.log("Redacted text:\n", result.redacted);
  console.log("\nPlaceholder count:", result.placeholderCount);

  const leaks = PLANTED_IDENTIFIERS.filter(({ needle }) =>
    typeof needle === "string" ? result.redacted.includes(needle) : needle.test(result.redacted),
  ).map((l) => l.label);

  console.log("\n" + "=".repeat(80));
  if (leaks.length === 0) {
    console.log("PASS: every planted identifier was redacted.");
  } else {
    console.log("FAIL: these leaked through unredacted:", leaks);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error("FAILED:", e);
  process.exit(1);
});
