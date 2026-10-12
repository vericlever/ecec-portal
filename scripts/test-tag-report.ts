// Check for the Child safety standards and Quality area report data layer
// (src/lib/tag-report.ts). Read-only: it runs the shared metrics function
// against the live database with the service-role client, scoped to the
// Ready Set Go organisation, and checks the pure rules.
//
// REQUIRES DATABASE ACCESS (NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY).
//
//   npx tsx scripts/test-tag-report.ts

import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { maskFlagCount, countProcedures, buildStatement, tagReportData, ALL_SERVICES_LABEL } from "../src/lib/tag-report";

function loadEnv() {
  const file = path.join(process.cwd(), ".env.local");
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}
loadEnv();

let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `  ${detail}`}`);
  if (!ok) failures += 1;
}

const BANNED = /\b(open|unresolved|outstanding|unsorted|pending|backlog|failed|missed)\b/i;

// ---- pure rules -----------------------------------------------------------
check("flag counts 0, 1, 3 mask to 0-3", [0, 1, 3].every((n) => maskFlagCount(n) === "0-3"));
check("flag count 4 shows as 4", maskFlagCount(4) === 4);

const period = { start: "2025-10-13", end: "2026-10-12" };
const counts = countProcedures(
  [
    { reviewDates: [], nextDue: "2026-10-12" }, // never reviewed, due today: overdue
    { reviewDates: ["2026-03-01"], nextDue: "2027-03-01" }, // reviewed in period
    { reviewDates: ["2024-01-01"], nextDue: "2027-01-11" }, // reviewed, outside period
    { reviewDates: ["2026-09-01"], nextDue: "2026-12-01" }, // due within 90 days
  ],
  "2026-10-12",
  period,
);
check("reviewed counts any review in the period", counts.reviewed === 2, JSON.stringify(counts));
check("due today is overdue", counts.overdue === 1, JSON.stringify(counts));
check("due within 90 days", counts.dueSoon === 1, JSON.stringify(counts));
check("never reviewed", counts.neverReviewed === 1, JSON.stringify(counts));

const statement = buildStatement({
  asOf: "2026-10-12",
  scopeLabel: ALL_SERVICES_LABEL,
  periodMonths: 12,
  code: "QA2",
  counts: { aligned: 38, reviewed: 12, overdue: 3, dueSoon: 5, neverReviewed: 20 },
  hasFlags: true,
  uploadTypes: ["Parent Feedback", "Incident Reports"],
  reflected: 4,
  reviewsDrew: 4,
});
console.log(`\n${statement}\n`);
check("statement has no banned words", !BANNED.test(statement));
check("statement has no em dash or Oxford comma", !statement.includes("—") && !/, and /.test(statement));
check("statement uses All Services", statement.includes("across All Services"));

// ---- live data ------------------------------------------------------------
async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: org } = await supabase.from("organisations").select("id").eq("name", "Ready Set Go").single();
  const organisationId = org!.id as string;
  const { data: services } = await supabase.from("services").select("id, name").eq("organisation_id", organisationId);
  const timboon = services!.find((s) => s.name === "Timboon")!;

  for (const kind of ["quality_area", "child_safe_standard"] as const) {
    const all = await tagReportData(supabase, { kind, organisationId, timezone: "Australia/Melbourne", serviceId: null });
    const one = await tagReportData(supabase, { kind, organisationId, timezone: "Australia/Melbourne", serviceId: timboon.id as string });
    console.log(`\n== ${kind}: columns ${JSON.stringify(all.columns)}, as at ${all.asOf}, period ${all.period.start} to ${all.period.end}`);
    for (const a of all.areas) {
      const c = a.section1[a.section1.length - 1];
      console.log(
        `${a.option.code}: aligned ${c.aligned} reviewed ${c.reviewed} overdue ${c.overdue} due90 ${c.dueSoon} never ${c.neverReviewed} | signed ${a.section2.pct[a.section2.pct.length - 1]}% | uploads ${a.section3.uploads.at(-1)} flags ${a.section3.flags.at(-1)} reflected ${a.section3.reflected.at(-1)} drew ${a.section3.reviewsDrew.at(-1)}`,
      );
    }
    const total = all.summary[all.summary.length - 1].counts;
    console.log(`Total (each once): ${JSON.stringify(total)}`);
    check(`${kind}: reviewed reads 0 with no review dates`, total.reviewed === 0, JSON.stringify(total));
    check(`${kind}: single service aligned matches All Services (no service-scoped procedures)`, one.summary.at(-1)!.counts.aligned === total.aligned);
    const allAligned = all.areas.reduce((n, a) => n + a.section1.at(-1)!.aligned, 0);
    check(`${kind}: total counts each procedure once (<= sum across areas)`, total.aligned <= allAligned, `${total.aligned} vs ${allAligned}`);

    const text = JSON.stringify(all) + JSON.stringify(one);
    const sectionText = JSON.stringify(all.areas.map((a) => [a.section2, a.section3, a.statement]));
    check(`${kind}: no banned words in sections 2, 3 and statements`, !BANNED.test(sectionText));
    check(`${kind}: no raw flag count below 4`, all.areas.every((a) => a.section3.flags.every((f) => f === "0-3" || f >= 4)));
    check(`${kind}: no verbatim text fields in the model`, !/reflection|redacted_body|full_name/.test(text));
  }

  const qa = await tagReportData(supabase, { kind: "quality_area", organisationId, timezone: "Australia/Melbourne", serviceId: null });
  const qaTotal = qa.summary.at(-1)!.counts;
  console.log(`\nQuality area total overdue (expect 3 per spec): ${qaTotal.overdue}`);
  check("overdue reads 3 across tagged procedures where all three are tagged", qaTotal.overdue <= 3);

  const timboonQa = await tagReportData(supabase, { kind: "quality_area", organisationId, timezone: "Australia/Melbourne", serviceId: timboon.id as string });
  const labelled = timboonQa.areas.flatMap((a) => a.section3.uploadListing).some((u) => u.wholeOfOrg);
  check("whole-of-organisation uploads appear in the Timboon view", labelled);

  console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) failed.`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
