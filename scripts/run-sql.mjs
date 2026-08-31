// Apply a .sql file to the database. For migrations and seeds, since this
// machine has no psql or Supabase CLI.
//
//   node scripts/run-sql.mjs supabase/migrations/0007_access_tiers.sql
//
// Reads DATABASE_URL from .env.local (the Supabase "session pooler" connection
// string: Project Settings -> Database -> Connection string -> Session pooler).
// Any SELECT results in the file are printed.

import fs from "node:fs";
import path from "node:path";
import pg from "pg";

function loadEnv() {
  const file = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

loadEnv();

const target = process.argv[2];
if (!target) {
  console.error("usage: node scripts/run-sql.mjs <file.sql>");
  process.exit(1);
}
if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set (add it to .env.local).");
  process.exit(1);
}

const sql = fs.readFileSync(target, "utf8");
const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

await client.connect();
try {
  const result = await client.query(sql);
  for (const r of Array.isArray(result) ? result : [result]) {
    if (r.rows && r.rows.length) console.table(r.rows);
  }
  console.log("OK:", target);
} catch (e) {
  console.error("FAILED:", target);
  console.error(e.message);
  if (e.hint) console.error("hint:", e.hint);
  if (e.where) console.error("where:", e.where);
  process.exitCode = 1;
} finally {
  await client.end();
}
