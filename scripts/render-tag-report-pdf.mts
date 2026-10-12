// Renders both tag reports to PDF files with live data (read-only), for
// checking layout by eye. Optional first arg: output directory.
//
//   npx tsx scripts/render-tag-report-pdf.mts <outDir>

import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { renderToBuffer } from "@react-pdf/renderer";
import { tagReportData, type TagReportKind } from "../src/lib/tag-report";
import { TagReportPdf } from "../src/app/reports/_pdf/tag-report";

for (const line of fs.readFileSync(path.join(process.cwd(), ".env.local"), "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

async function main() {
  const out = process.argv[2] ?? ".";
  fs.mkdirSync(out, { recursive: true });
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: org } = await supabase.from("organisations").select("id").eq("name", "Ready Set Go").single();
  const organisationId = org!.id as string;
  const { data: services } = await supabase.from("services").select("id, name").eq("organisation_id", organisationId);
  const selections: [string, string | null][] = [["all", null], ...services!.map((s) => [s.name as string, s.id as string] as [string, string])];
  for (const kind of ["quality_area", "child_safe_standard"] as TagReportKind[]) {
    for (const [label, serviceId] of selections) {
      const report = await tagReportData(supabase, { kind, organisationId, timezone: "Australia/Melbourne", serviceId });
      const buf = await renderToBuffer(TagReportPdf({ orgName: "Ready Set Go Pty Ltd", report }));
      const file = path.join(out, `${kind}-${label}.pdf`);
      fs.writeFileSync(file, buf);
      console.log(file, buf.length);
    }
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
