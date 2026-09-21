// Promote the Markdown-reprocessed draft body into published_body for every
// policy/procedure that was already live and whose draft now differs from
// what's published - the second half of the Step 56 backfill, after
// reprocess-documents.ts refreshed the drafts. Deliberately excludes any
// procedure that has never been published at all: those are still drafts on
// purpose (not finished/assigned yet), and a body refresh is not a reason to
// make a draft go live for the first time - that stays a separate decision.
//
// Mirrors publishPolicy()/publishSop() in src/app/admin/{policies,sops}/actions.ts
// exactly (version bump, published_body <- body, published_at/by), plus the
// same sop_history "published" row publishSop() writes, so the audit trail
// looks identical to clicking "Re-publish" by hand 141 times.
//
//   npx tsx scripts/bulk-republish.ts --dry-run
//   npx tsx scripts/bulk-republish.ts --apply

import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

function loadEnv() {
  const file = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}
loadEnv();

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const ACTOR_ID = "92ce67f0-463b-4689-baff-663668f66b9f"; // Zeke Pottage, admin, zeke@readyset.au

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env.local");
  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  let policyCount = 0;
  let sopCount = 0;

  const { data: policies, error: pErr } = await admin
    .from("policies")
    .select("id, name, body, published_body, published_version")
    .not("published_version", "is", null);
  if (pErr) throw pErr;

  for (const p of policies ?? []) {
    if ((p.body ?? "") === (p.published_body ?? "")) continue;
    if (!p.body || !p.body.trim()) continue;
    const next = (p.published_version ?? 0) + 1;
    policyCount++;
    console.log(`${apply ? "APPLY" : "DRY"} [policy] ${p.name} - v${p.published_version} -> v${next}`);
    if (apply) {
      await admin
        .from("policies")
        .update({
          published_version: next,
          published_body: p.body,
          published_at: new Date().toISOString(),
          published_by: ACTOR_ID,
          current_version: next,
        })
        .eq("id", p.id);
    }
  }

  const { data: sops, error: sErr } = await admin
    .from("sops")
    .select("id, name, body, published_body, published_version, organisation_id")
    .not("published_version", "is", null);
  if (sErr) throw sErr;

  for (const s of sops ?? []) {
    if ((s.body ?? "") === (s.published_body ?? "")) continue;
    if (!s.body || !s.body.trim()) continue;
    const next = (s.published_version ?? 0) + 1;
    sopCount++;
    console.log(`${apply ? "APPLY" : "DRY"} [sop] ${s.name} - v${s.published_version} -> v${next}`);
    if (apply) {
      await admin
        .from("sops")
        .update({
          published_version: next,
          published_body: s.body,
          published_at: new Date().toISOString(),
          published_by: ACTOR_ID,
          current_version: next,
        })
        .eq("id", s.id);
      await admin.from("sop_history").insert({
        organisation_id: s.organisation_id,
        sop_id: s.id,
        event_type: "published",
        actor_profile_id: ACTOR_ID,
        note: `Published v${next}`,
      });
    }
  }

  console.log(
    `\n${apply ? "Applied" : "Dry run"}: ${policyCount} policies, ${sopCount} procedures re-published.`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
