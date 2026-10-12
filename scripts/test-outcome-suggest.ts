// Step 59 revision A check: the AI nominates up to four procedures for a
// made-up, already-redacted bulk register, and every cited excerpt is
// verified against its line. Read-only apart from the metadata-only
// ai_call_log row every Bedrock call writes.
//
// REQUIRES LIVE AWS CREDENTIALS (Bedrock) and DATABASE_URL.
//
//   npx tsx scripts/test-outcome-suggest.ts

import fs from "node:fs";
import path from "node:path";
import pg from "pg";

function loadEnv() {
  const file = path.join(process.cwd(), ".env.local");
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}
loadEnv();

const REGISTER = `## Incident register, Timboon, January to June 2026

| Date | Description | Action taken |
| --- | --- | --- |
| [DATE] | [NAME] slipped on the wet verandah after rain and grazed a knee. | First aid given, parent notified. |
| [DATE] | [NAME] had an allergic reaction after afternoon tea; EpiPen was not in the room. | Ambulance called, medication retrieved from the office. |
| [DATE] | A child left the yard through an unlatched gate for about two minutes. | Gate latch replaced, head count introduced. |
| [DATE] | [NAME] was missed on the sign-out sheet at pickup. | Educator reminded about sign-out. |
| [DATE] | [NAME] fell from the climbing frame and was checked for a head injury. | Parent notified, injury report completed. |`;

async function main() {
  const { generateText } = await import("../src/lib/ai/client");
  const { numberLines, buildSuggestUserMessage, verifySuggestions, SUGGEST_SYSTEM_PROMPT } = await import("../src/lib/outcome-suggest");

  const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  const org = (await db.query(`select id from organisations where name ilike 'Ready Set Go%' limit 1`)).rows[0];
  const sops = (
    await db.query(
      `select id, name, published_body from sops where organisation_id=$1 and published_version is not null`,
      [org.id],
    )
  ).rows;
  await db.end();
  console.log(`${sops.length} published procedures`);

  const numbered = numberLines(REGISTER);
  const response = await generateText({
    feature: "outcome_link",
    organisationId: org.id,
    systemPrompt: SUGGEST_SYSTEM_PROMPT,
    userMessage: buildSuggestUserMessage(numbered, sops),
    maxTokens: 1500,
  });
  const verified = verifySuggestions(response, numbered, new Set(sops.map((s: { id: string }) => s.id)));
  const name = new Map(sops.map((s: { id: string; name: string }) => [s.id, s.name]));
  for (const v of verified) {
    console.log(`\n${name.get(v.sopId)}\n  reason: ${v.reason}`);
    for (const e of v.evidence) console.log(`  line ${e.line}: "${e.excerpt}"`);
  }
  console.log(`\n${verified.length} procedure(s) nominated after verification (max 4).`);
  if (verified.length === 0 || verified.length > 4) process.exit(1);
  console.log("PASS");
}

main().catch((e) => {
  console.error("FAILED:", e);
  process.exit(1);
});
