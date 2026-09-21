// Re-run the Markdown extraction pipeline against the ORIGINAL uploaded file
// already sitting in storage for a policy/procedure, and refresh the record's
// draft body from it - a backend alternative to deleting and re-uploading the
// same file through the admin UI (which wouldn't help anyway: uploadSopDocument
// / uploadPolicyDocument only auto-fills body when it's currently empty, to
// avoid clobbering hand-edited text).
//
// Always run --dry-run first and read the output before --apply. --apply
// writes a JSON backup of every body it is about to overwrite so any single
// document can be restored by hand if the re-extraction turns out wrong for it.
//
//   npx tsx scripts/reprocess-documents.ts --dry-run
//   npx tsx scripts/reprocess-documents.ts --apply
//   npx tsx scripts/reprocess-documents.ts --apply --kind=policy --id=<uuid>

import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { extractDocument } from "../src/lib/documents/extract";

function loadEnv() {
  const file = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}
loadEnv();

const BUCKET = "documents";
const args = process.argv.slice(2);
const apply = args.includes("--apply");
const kindArg = args.find((a) => a.startsWith("--kind="))?.split("=")[1] as
  | "policy"
  | "sop"
  | undefined;
const idArg = args.find((a) => a.startsWith("--id="))?.split("=")[1];

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env.local");
  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  const kinds: ("policy" | "sop")[] = kindArg ? [kindArg] : ["policy", "sop"];
  const backup: { kind: string; id: string; name: string; old_body: string | null }[] = [];

  let processed = 0,
    changed = 0,
    flagged = 0,
    failed = 0,
    skippedNoDoc = 0;

  for (const kind of kinds) {
    const table = kind === "policy" ? "policies" : "sops";
    let query = admin.from(table).select("id, name, body");
    if (idArg) query = query.eq("id", idArg);
    const { data: rows, error } = await query;
    if (error) throw error;

    for (const row of rows ?? []) {
      const { data: doc } = await admin
        .from("documents")
        .select("id, file_name, storage_path, extracted_text")
        .eq("owner_type", kind)
        .eq("owner_id", row.id)
        .maybeSingle();
      if (!doc) {
        skippedNoDoc++;
        continue;
      }

      const dl = await admin.storage.from(BUCKET).download(doc.storage_path);
      if (dl.error || !dl.data) {
        console.error(`FAILED download [${kind}] ${row.name} (${row.id}): ${dl.error?.message}`);
        failed++;
        continue;
      }
      const bytes = new Uint8Array(await dl.data.arrayBuffer());

      let extracted;
      try {
        extracted = await extractDocument(doc.file_name, bytes);
      } catch (e) {
        console.error(`FAILED extract [${kind}] ${row.name} (${row.id}): ${(e as Error).message}`);
        failed++;
        continue;
      }

      processed++;
      const newText = extracted.text || "";
      const oldBody = row.body || "";
      const isDifferent = newText.trim() !== oldBody.trim();
      if (isDifferent) changed++;
      if (extracted.needsReview) flagged++;

      console.log(
        `${apply ? "APPLY" : "DRY"} [${kind}] ${row.name} (${row.id}) - ${oldBody.length} -> ${newText.length} chars, changed=${isDifferent}, needsReview=${extracted.needsReview}`,
      );

      if (apply && isDifferent) {
        backup.push({ kind, id: row.id, name: row.name, old_body: row.body });
        await admin.from(table).update({ body: newText }).eq("id", row.id);
        await admin
          .from("documents")
          .update({
            extracted_text: newText,
            extraction_note: extracted.note ?? null,
            needs_review: extracted.needsReview,
          })
          .eq("id", doc.id);
      }
    }
  }

  if (apply && backup.length) {
    const outPath = path.join(process.cwd(), `reprocess-backup-${Date.now()}.json`);
    fs.writeFileSync(outPath, JSON.stringify(backup, null, 2));
    console.log(`\nBacked up ${backup.length} old body value(s) to ${outPath}`);
  }

  console.log(
    `\n${apply ? "Applied" : "Dry run"}: processed ${processed}, changed ${changed}, flagged for review ${flagged}, failed ${failed}, no source document ${skippedNoDoc}.`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
