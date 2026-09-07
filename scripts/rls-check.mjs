// Row-level-security probe. For each test identity it assumes the `authenticated`
// role with that user's JWT sub, then counts visible rows in every public table
// and flags any row whose organisation_id is outside the user's own org.
//
//   node scripts/rls-check.mjs
//
// Reads DATABASE_URL from .env.local (same as run-sql.mjs). Read-only: every
// probe runs inside a transaction that is rolled back.

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

const RSG = "a0000000-0000-4000-8000-000000000001";
const SK = "a0000000-0000-4000-8000-000000000002";

const USERS = [
  { label: "RSG admin (Pot pots)", uid: "92ce67f0-463b-4689-baff-663668f66b9f", org: RSG },
  { label: "RSG manager (Jamie)", uid: "bfb97d5e-e176-484a-bc94-b9fd8c3c8d3f", org: RSG },
  { label: "RSG staff (Sam)", uid: "a5895163-3db5-4029-86f1-c9ad7e06271b", org: RSG },
  { label: "SK admin", uid: "e6e5394f-c492-4ef8-b2c0-68ba66f40b67", org: SK },
  { label: "SK staff (Educator)", uid: "f504ce94-e3c0-4584-8ac7-64cbe810a889", org: SK },
  { label: "anon (no JWT)", uid: null, org: null },
];

// table -> the column that carries the tenant boundary (null = no org column)
const TABLES = {
  organisations: "id",
  profiles: "organisation_id",
  services: "organisation_id",
  sops: "organisation_id",
  policies: "organisation_id",
  job_roles: "organisation_id",
  job_role_sops: "organisation_id",
  policy_sop_links: "organisation_id",
  policy_categories: "organisation_id",
  policy_category_links: "organisation_id",
  policy_audiences: "organisation_id",
  policy_approvals: "organisation_id",
  policy_views: "organisation_id",
  sign_offs: "organisation_id",
  documents: "organisation_id",
  contracts: "organisation_id",
  hr_agreements: "organisation_id",
  hr_agreement_job_roles: "organisation_id",
  hr_agreement_signoffs: "organisation_id",
  worker_details: "organisation_id",
  worker_payroll: "organisation_id",
  worker_screening: "organisation_id",
  worker_referees: "organisation_id",
  wwcc_checks: "organisation_id",
  teacher_registrations: "organisation_id",
  qualifications: "organisation_id",
  training_records: "organisation_id",
  identity_documents: "organisation_id",
  credentials: "organisation_id",
  notification_log: "organisation_id",
  notification_rules: "organisation_id",
  password_reset_requests: "organisation_id",
  sop_history: "organisation_id",
  sop_observations: "organisation_id",
  staff_import_records: "organisation_id",
  comprehension_questions: "organisation_id",
  credential_types: null,
  external_providers: null,
};

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const problems = [];

async function probe(user) {
  await client.query("begin");
  try {
    await client.query("set local role authenticated");
    if (user.uid) {
      await client.query(
        `select set_config('request.jwt.claims', $1, true)`,
        [JSON.stringify({ sub: user.uid, role: "authenticated" })],
      );
    } else {
      await client.query(`select set_config('request.jwt.claims', '', true)`);
    }

    const rows = [];
    for (const [table, orgCol] of Object.entries(TABLES)) {
      let visible = 0;
      let foreign = 0;
      try {
        const r = await client.query(`select count(*)::int n from public.${table}`);
        visible = r.rows[0].n;
        if (orgCol && visible > 0 && user.org) {
          const f = await client.query(
            `select count(*)::int n from public.${table} where ${orgCol} <> $1`,
            [user.org],
          );
          foreign = f.rows[0].n;
        } else if (orgCol && visible > 0 && !user.org) {
          foreign = visible; // anon should see nothing in org tables
        }
      } catch (e) {
        rows.push([table, "ERR", e.message.slice(0, 60)]);
        continue;
      }
      rows.push([table, visible, foreign]);
      if (foreign > 0) {
        problems.push(
          `${user.label}: sees ${foreign} foreign-org row(s) in ${table} (of ${visible} visible)`,
        );
      }
    }
    console.log(`\n=== ${user.label} ===`);
    for (const [t, v, f] of rows) {
      const flag = f === "ERR" ? `  ERROR: ${f === "ERR" ? rows : ""}` : f > 0 ? `  <-- ${f} FOREIGN` : "";
      console.log(`  ${t.padEnd(26)} ${String(v).padStart(5)}${flag}`);
    }
  } finally {
    await client.query("rollback");
  }
}

// Write probes: each should be REJECTED. label -> {uid, sql, params}
const WRITE_PROBES = [
  {
    label: "staff makes self admin",
    uid: "a5895163-3db5-4029-86f1-c9ad7e06271b",
    sql: `update public.profiles set access_tier='admin' where id=$1`,
    params: ["a5895163-3db5-4029-86f1-c9ad7e06271b"],
  },
  {
    label: "manager forges a staff sign-off",
    uid: "bfb97d5e-e176-484a-bc94-b9fd8c3c8d3f",
    sql: `insert into public.sign_offs (organisation_id, service_id, user_id, sop_id, sop_version)
          select organisation_id, 'b0000000-0000-4000-8000-000000000001',
                 'a5895163-3db5-4029-86f1-c9ad7e06271b', id, 999
          from public.sops where organisation_id=$1 and published_version is not null limit 1`,
    params: [RSG],
  },
  {
    label: "manager writes into another org (profiles)",
    uid: "bfb97d5e-e176-484a-bc94-b9fd8c3c8d3f",
    sql: `update public.profiles set full_name='x' where organisation_id=$1`,
    params: [SK],
  },
  {
    label: "staff inserts a job role",
    uid: "a5895163-3db5-4029-86f1-c9ad7e06271b",
    sql: `insert into public.job_roles (organisation_id, name, is_placeholder) values ($1,'hacked',true)`,
    params: [RSG],
  },
  {
    label: "manager (non-HR) writes worker_payroll",
    uid: "bfb97d5e-e176-484a-bc94-b9fd8c3c8d3f",
    sql: `update public.worker_payroll set bank_bsb='000000' where organisation_id=$1`,
    params: [RSG],
  },
];

async function writeProbe(p) {
  await client.query("begin");
  let outcome;
  try {
    await client.query("set local role authenticated");
    await client.query(`select set_config('request.jwt.claims',$1,true)`, [
      JSON.stringify({ sub: p.uid, role: "authenticated" }),
    ]);
    const r = await client.query(p.sql, p.params);
    outcome =
      r.rowCount > 0
        ? `ALLOWED (${r.rowCount} row) - BAD`
        : "no-op (0 rows) - ok";
    if (r.rowCount > 0) problems.push(`write: ${p.label} was ALLOWED`);
  } catch (e) {
    outcome = `rejected: ${e.message.slice(0, 50)} - ok`;
  } finally {
    await client.query("rollback");
  }
  console.log(`  ${p.label.padEnd(42)} ${outcome}`);
}

await client.connect();
for (const u of USERS) await probe(u);
console.log("\n=== write probes (all should be rejected or no-op) ===");
for (const p of WRITE_PROBES) await writeProbe(p);
await client.end();

console.log("\n" + "=".repeat(50));
if (problems.length === 0) {
  console.log("PASS: no cross-tenant row visibility detected.");
} else {
  console.log(`FAIL: ${problems.length} issue(s):`);
  for (const p of problems) console.log("  - " + p);
}
