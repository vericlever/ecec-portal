// Row-level-security probe. For each test identity it assumes the `authenticated`
// role with that user's JWT sub, then counts visible rows in every public table
// and flags any row whose organisation_id is outside the user's own org.
//
//   node scripts/rls-check.mjs
//
// Reads DATABASE_URL from .env.local (same as run-sql.mjs). Read-only: every
// probe runs inside a transaction that is rolled back - including the second
// section below, which exercises specific application write paths (not just
// "is this table admittable") and asserts on rows actually affected, since a
// blocked update or delete returns success with zero rows rather than an
// error - a plain try/catch around the statement would call that a pass.

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
  // uid filled by resolveFixtures() - see MANAGER below.
  { label: "RSG manager_staff", uid: null, org: RSG },
  { label: "RSG staff (Sam)", uid: "a5895163-3db5-4029-86f1-c9ad7e06271b", org: RSG },
  { label: "SK admin", uid: "e6e5394f-c492-4ef8-b2c0-68ba66f40b67", org: SK },
  { label: "SK staff (Educator)", uid: "f504ce94-e3c0-4584-8ac7-64cbe810a889", org: SK },
  { label: "anon (no JWT)", uid: null, org: null },
];

// Named test identities and fixtures reused by the app-write-path probes below.
const ADMIN = "92ce67f0-463b-4689-baff-663668f66b9f"; // Pot pots, RSG admin
const STAFF = "a5895163-3db5-4029-86f1-c9ad7e06271b"; // Sam Rivers, RSG staff, Timboon, role Educator
const SK_ADMIN = "e6e5394f-c492-4ef8-b2c0-68ba66f40b67";
const TIMBOON = "b0000000-0000-4000-8000-000000000001"; // Sam's service
const MORTLAKE = "b0000000-0000-4000-8000-000000000002"; // the "other" RSG service
const EDUCATOR_ROLE = "9749aa24-8c74-4359-83f0-83c75e45fbbf"; // Sam's job role
const RSG_WWCC = "b77efe6f-4a35-41d1-ad79-9f61825be818"; // Sam's WWCC row, already sighted
const RSG_SECOND_ROLE = "cba06a07-d786-47f9-bbf5-d8de570e50f9"; // Educational Leader - a role Sam does NOT already hold

// Content fixtures are resolved from the live database at startup rather than
// hardcoded, and the identity fixtures are asserted to still exist.
//
// They used to be hardcoded ids, and five of them had silently rotted: RSG's
// library was cleared and re-imported (which issues fresh row ids) and the
// manager identity was a profile that no longer existed at all. The script
// did not say "my fixtures are stale", it reported fourteen failing write
// paths - which reads exactly like a real RLS regression. A tenant isolation
// check that cries wolf gets ignored, and this one is the only evidence that
// one customer cannot read another's data, so it has to be trustworthy or
// it is worse than useless.
//
// Resolving by property (any published RSG procedure, any SK procedure)
// rather than by id means a future content reload cannot break it. The
// scenarios never depended on those specific documents anyway - their setup
// hooks publish and link whatever row they are given.
let MANAGER; // RSG manager_staff, normalised onto Sam's service - see FIXTURE_BASE
let SELF_AND_MANAGER_SOP; // an RSG procedure the countersign scenarios publish and sign
let RSG_SOP; // any published RSG procedure
let RSG_POLICY; // any published RSG policy
let SK_SOP; // any Science Kinder procedure - the cross-tenant target

async function resolveFixtures() {
  const missing = [];

  async function one(label, sql, params = []) {
    const r = await client.query(sql, params);
    if (r.rows.length === 0) {
      missing.push(label);
      return null;
    }
    return r.rows[0].id;
  }

  MANAGER = await one(
    "an RSG manager_staff profile",
    `select id from public.profiles
     where organisation_id = $1 and access_tier = 'manager_staff'
     order by created_at limit 1`,
    [RSG],
  );
  RSG_SOP = await one(
    "a published RSG procedure",
    `select id from public.sops
     where organisation_id = $1 and published_version is not null
     order by created_at limit 1`,
    [RSG],
  );
  SELF_AND_MANAGER_SOP = await one(
    "a second RSG procedure (countersign fixtures)",
    `select id from public.sops
     where organisation_id = $1 and id <> $2
     order by created_at limit 1`,
    [RSG, RSG_SOP],
  );
  RSG_POLICY = await one(
    "a published RSG policy",
    `select id from public.policies
     where organisation_id = $1 and published_version is not null
     order by created_at limit 1`,
    [RSG],
  );
  SK_SOP = await one(
    "a Science Kinder procedure",
    `select id from public.sops where organisation_id = $1 order by created_at limit 1`,
    [SK],
  );

  // The identity fixtures are not resolved by property - who Sam and Pot pots
  // are is the point of several scenarios - so they are asserted instead.
  for (const [label, id] of [["ADMIN", ADMIN], ["STAFF", STAFF], ["SK_ADMIN", SK_ADMIN]]) {
    const r = await client.query(`select 1 from public.profiles where id = $1`, [id]);
    if (r.rows.length === 0) missing.push(`${label} profile ${id}`);
  }

  // The per-identity visibility sweep reads this list too. Left unfilled it
  // would carry uid null, which probe() treats as the anonymous caller - so
  // the manager's whole sweep would silently become a second anon run and
  // pass for the wrong reason.
  USERS.find((u) => u.label === "RSG manager_staff").uid = MANAGER;

  if (missing.length > 0) {
    console.error("\nCannot run: the database is missing fixtures this check needs:");
    for (const m of missing) console.error(`  - ${m}`);
    console.error("\nThis is a problem with the data, not necessarily with RLS.");
    await client.end();
    process.exit(1);
  }
}

// Runs inside every write-path scenario's transaction, before its own setup,
// and is rolled back with it. RSG's real staff list has no manager_staff at
// Sam's service, but "a manager at the same service as the staff member" is
// the precondition a dozen scenarios are actually testing - the distinction
// between same-service and other-service is the whole point of several of
// them. Rather than weaken those scenarios to fit today's staff list, put the
// manager where the scenario needs them. Nothing here is asserted on; it only
// establishes the starting state.
async function FIXTURE_BASE(c) {
  // hr_manager is cleared, not just service_id. Several scenarios exist
  // specifically to check that a plain manager CANNOT do something an HR
  // manager can (sight a WWCC check, assign a job role), and the ones that
  // need the HR right grant it in their own setup - so the baseline the
  // script was written against is a manager without it. The real manager_staff
  // in RSG's staff list happens to carry hr_manager, which turned those
  // scenarios green in the "expected blocked, got allowed" direction: they
  // read as a permissions hole when in fact the person genuinely was
  // authorised and the test had simply lost its premise.
  await c.query(
    `update public.profiles set service_id = $1, hr_manager = false where id = $2`,
    [TIMBOON, MANAGER],
  );
}

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
  sop_reviews: "organisation_id",
  sop_review_actions: "organisation_id",
  sop_outcome_flags: "organisation_id",
  staff_import_records: "organisation_id",
  comprehension_questions: "organisation_id",
  profile_job_roles: "organisation_id",
  credential_types: null,
  external_providers: null,
  platform_notices: null,
  platform_notice_acceptances: "organisation_id",
  content_chunks: "organisation_id",
  embedding_jobs: "organisation_id",
  ai_interactions: "organisation_id",
};

// A throwaway 1024-dim zero vector, just to satisfy content_chunks.embedding
// not-null in AI Q&A probes below - the value itself is never compared, only
// row visibility is.
const ZERO_VECTOR = `[${Array(1024).fill(0).join(",")}]`;

// RSG_SOP/SELF_AND_MANAGER_SOP/RSG_POLICY above no longer exist (confirmed
// directly against the live DB) - stale since RSG's content was cleared and
// restored via bulk upload, which issues fresh row ids and was never
// re-verified against this script afterward. That is a pre-existing,
// separate problem across roughly a dozen scenarios below (not introduced
// here, out of scope for the AI Q&A work to fix) - these two are current,
// real, published RSG rows, used only by the new AI Q&A probes so those
// specifically test something real rather than a row that silently no
// longer exists.
const RSG_REAL_POLICY = "1d57db15-d8a7-429b-9359-5002209a26c0"; // Bullying... Policy, published, no audience rows
const RSG_REAL_SOP = "1c06200c-0766-4fad-8a75-15a4958d5d6c"; // Phone Communication, published, already linked to EDUCATOR_ROLE and to Sam via profile_job_roles
// MANAGER (Jamie) above no longer exists as a profile at all - confirmed
// directly, same pre-existing staleness. Filo Mateiwai is a real, current
// RSG manager_policy at Sam's own service (Timboon).
const RSG_REAL_MANAGER = "ec179b4d-14a1-416f-bfe0-4ac448ffba68";

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const problems = [];
const notes = [];

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
//
// A function rather than a bare array: `params` is evaluated the moment the
// array literal is built, which is module load, and the content fixtures do
// not exist until resolveFixtures() has queried the database. As a plain
// const array every one of them captured undefined - and an undefined id
// makes a write fail, which this section scores as a pass, so the probes
// would have gone green while testing nothing at all.
const writeProbes = () => [
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
  {
    label: "SK admin writes an RSG sop",
    uid: SK_ADMIN,
    sql: `update public.sops set name = name where id = $1`,
    params: [RSG_SOP],
  },
  {
    label: "RSG admin writes an SK sop",
    uid: ADMIN,
    sql: `update public.sops set name = name where id = $1`,
    params: [SK_SOP],
  },
  {
    label: "staff inserts sign_offs for someone else",
    uid: STAFF,
    sql: `insert into public.sign_offs (organisation_id, service_id, user_id, sop_id, sop_version)
          values ($1,$2,$3,$4,1)`,
    params: [RSG, TIMBOON, MANAGER, RSG_SOP],
  },
  {
    label: "staff inserts policy_views for someone else",
    uid: STAFF,
    sql: `insert into public.policy_views (organisation_id, user_id, policy_id, policy_version)
          values ($1,$2,$3,1)`,
    params: [RSG, MANAGER, RSG_POLICY],
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

// --- application write-path scenarios --------------------------------------
// Each scenario runs in its own begin/rollback transaction. `setup` (if given)
// runs BEFORE the identity switch, as the connection's normal unrestricted
// role - it exists to put fixture data in a state the test needs (an admin
// having already made someone a content editor, published a draft SOP so it
// can be signed, etc.), not to test anything itself. `probe` runs AFTER the
// switch, as the actual identity under test, and its return value must carry
// a `rowCount` (or the scenario can't tell a block from a success). expectOk
// says whether the security model SHOULD allow it; a mismatch is a real
// finding, not just a script bug, and is reported either way.
async function as(uid) {
  await client.query("set local role authenticated");
  await client.query(`select set_config('request.jwt.claims', $1, true)`, [
    JSON.stringify({ sub: uid, role: "authenticated" }),
  ]);
}

async function scenario(label, { setup, as: uid, probe: run, expectOk, note }) {
  await client.query("begin");
  let ok = false;
  let detail = "";
  try {
    await FIXTURE_BASE(client);
    if (setup) await setup(client);
    await as(uid);
    const result = await run(client);
    const rowCount = result?.rowCount;
    ok = rowCount === undefined ? true : rowCount > 0;
    detail = rowCount === undefined ? "ran" : `${rowCount} row(s)`;
  } catch (e) {
    ok = false;
    detail = e.message.slice(0, 90);
  } finally {
    await client.query("rollback");
  }
  const good = ok === expectOk;
  if (!good) {
    problems.push(
      `app write path: ${label} - expected ${expectOk ? "allowed" : "blocked"}, got ${ok ? "allowed" : "blocked"} (${detail})`,
    );
  }
  if (note) notes.push(`${label}: ${note}`);
  console.log(
    `  [${good ? "OK" : "MISMATCH"}] ${label.padEnd(58)} expected ${expectOk ? "allowed" : "blocked"}, got ${ok ? "allowed" : "blocked"} (${detail})`,
  );
}

// A function for the same reason writeProbes() is - `as:` and any fixture id
// used outside a closure are read when the array literal is built, which is
// before resolveFixtures() has run. `setup` and `probe` are closures and so
// were never affected, which made this sharp: every scenario whose identity
// was a plain const passed normally, and only the ones keyed to a resolved
// fixture failed, looking precisely like a permissions bug in those specific
// write paths rather than an undefined identity.
const appScenarios = () => [
  // Manager cosign on the self_and_manager suite. All nine are still drafts
  // (published_version is null) as of this run, so the setup step publishes
  // one for the duration of the transaction only - there is otherwise no
  // published self_and_manager SOP to test the real flow against at all.
  {
    label: "covering manager (same service) countersigns a self-sign",
    expectOk: true,
    setup: async (c) => {
      await c.query(
        `update public.sops set published_version=1, published_body='test' where id=$1`,
        [SELF_AND_MANAGER_SOP],
      );
      await c.query(
        `insert into public.job_role_sops (organisation_id, job_role_id, sop_id) values ($1,$2,$3) on conflict do nothing`,
        [RSG, EDUCATOR_ROLE, SELF_AND_MANAGER_SOP],
      );
      const s = await c.query(
        `insert into public.sign_offs (organisation_id, service_id, user_id, sop_id, sop_version) values ($1,$2,$3,$4,1) returning id`,
        [RSG, TIMBOON, STAFF, SELF_AND_MANAGER_SOP],
      );
      c._signOffId = s.rows[0].id;
    },
    as: MANAGER,
    probe: (c) =>
      c.query(
        `update public.sign_offs set verified_by=$1, verified_at=now() where id=$2`,
        [MANAGER, c._signOffId],
      ),
  },
  {
    label: "non-covering manager (different service) countersigns",
    expectOk: false,
    setup: async (c) => {
      await c.query(
        `update public.sops set published_version=1, published_body='test' where id=$1`,
        [SELF_AND_MANAGER_SOP],
      );
      const s = await c.query(
        `insert into public.sign_offs (organisation_id, service_id, user_id, sop_id, sop_version) values ($1,$2,$3,$4,1) returning id`,
        [RSG, TIMBOON, STAFF, SELF_AND_MANAGER_SOP],
      );
      c._signOffId = s.rows[0].id;
      // move the manager to Mortlake for this probe only - Sam stays at Timboon.
      await c.query(`update public.profiles set service_id=$1 where id=$2`, [MORTLAKE, MANAGER]);
    },
    as: MANAGER,
    probe: (c) =>
      c.query(
        `update public.sign_offs set verified_by=$1, verified_at=now() where id=$2`,
        [MANAGER, c._signOffId],
      ),
  },
  {
    label: "staff countersigns their own sign-off directly (migration 0045 closes this)",
    expectOk: false,
    setup: async (c) => {
      await c.query(
        `update public.sops set published_version=1, published_body='test' where id=$1`,
        [SELF_AND_MANAGER_SOP],
      );
      const s = await c.query(
        `insert into public.sign_offs (organisation_id, service_id, user_id, sop_id, sop_version) values ($1,$2,$3,$4,1) returning id`,
        [RSG, TIMBOON, STAFF, SELF_AND_MANAGER_SOP],
      );
      c._signOffId = s.rows[0].id;
    },
    as: STAFF,
    probe: (c) =>
      c.query(
        `update public.sign_offs set verified_by=$1, verified_at=now() where id=$2`,
        [STAFF, c._signOffId],
      ),
  },

  // WWCC / teacher registration sighting (migration 0017). The table's own
  // _rw RLS policy (can_manage_worker) would, on its own, let any same-service
  // manager through - not just a verifier. What actually closes that is the
  // protect_sighted_fields() trigger (migration 0017), which is verifier-only
  // for the sighting columns specifically and predates this round of changes
  // entirely - confirming it still holds, not reporting a gap.
  {
    label: "non-verifier manager (not admin/hr_manager) sights a WWCC check",
    expectOk: false,
    as: MANAGER,
    probe: (c) =>
      c.query(`update public.wwcc_checks set sighted_at=now(), sighted_by='Provider' where id=$1`, [
        RSG_WWCC,
      ]),
    note: "blocked by protect_sighted_fields() (migration 0017, a BEFORE trigger), not by the table's own RLS policy - can_manage_worker() alone would have allowed it. Column-level protection like this is exactly what migration 0044's new SECURITY DEFINER functions do for contracts/sops; worth knowing this table already had its own version of the same idea.",
  },
  {
    label: "admin sights a WWCC check",
    expectOk: true,
    as: ADMIN,
    probe: (c) =>
      c.query(`update public.wwcc_checks set sighted_at=now(), sighted_by='Provider' where id=$1`, [
        RSG_WWCC,
      ]),
  },

  // Bulk staff import writes worker_details as part of onboarding a new
  // worker (importOne in staff/import/actions.ts). The UI entry point is
  // admin-only (requireAdmin), but the underlying table allows a manager to
  // manage a worker's details at their own service, matching setProbation's
  // design - this checks that table's own RLS backstop directly. (A fresh
  // profiles INSERT can't be simulated here without a real auth.users row to
  // satisfy profiles_id_fkey - that row only ever gets created via
  // auth.admin.createUser, which is exactly why account creation stays on the
  // service-role client.)
  {
    label: "manager upserts worker_details for staff at their OWN service",
    expectOk: true,
    as: MANAGER,
    probe: (c) =>
      c.query(
        `insert into public.worker_details (profile_id, organisation_id, on_probation)
         values ($1,$2,false)
         on conflict (profile_id) do update set on_probation = excluded.on_probation`,
        [STAFF, RSG],
      ),
  },
  {
    label: "manager upserts worker_details for staff at a DIFFERENT service",
    expectOk: false,
    setup: async (c) => {
      await c.query(`update public.profiles set service_id=$1 where id=$2`, [MORTLAKE, MANAGER]);
    },
    as: MANAGER,
    probe: (c) =>
      c.query(
        `insert into public.worker_details (profile_id, organisation_id, on_probation)
         values ($1,$2,false)
         on conflict (profile_id) do update set on_probation = excluded.on_probation`,
        [STAFF, RSG],
      ),
  },

  // Migration 0063: contracts_write locks self-management to Admin only - an
  // HR-manager-flagged manager must never be the one uploading their own
  // contract, even at their own service, because there is no one else to
  // check it. An Admin is the sole exception, since no higher tier exists to
  // do it for them.
  {
    label: "HR-manager-flagged manager uploads a contract for themselves",
    expectOk: false,
    setup: async (c) => {
      await c.query(`update public.profiles set hr_manager=true where id=$1`, [MANAGER]);
    },
    as: MANAGER,
    probe: (c) =>
      c.query(
        `insert into public.contracts (organisation_id, profile_id, start_date, period_type)
         values ($1,$2, current_date, 'no_fixed_period')`,
        [RSG, MANAGER],
      ),
  },
  {
    label: "admin uploads a contract for themselves",
    expectOk: true,
    as: ADMIN,
    probe: (c) =>
      c.query(
        `insert into public.contracts (organisation_id, profile_id, start_date, period_type)
         values ($1,$2, current_date, 'no_fixed_period')`,
        [RSG, ADMIN],
      ),
  },

  // Step 51: platform_notices/platform_notice_acceptances. Not organisation-
  // scoped content (the notice is the same for every tenant), so the select
  // policy is simply "any authenticated user" rather than in_org() - anon
  // still gets nothing. Acceptance is self-only, no org-boundary bypass
  // needed since a user can only ever write their own profile_id anyway.
  {
    label: "anon reads the platform notice (blocked, no session)",
    expectOk: false,
    as: null,
    probe: (c) => c.query(`select id from public.platform_notices limit 1`),
  },
  {
    label: "staff accepts the platform notice for themselves",
    expectOk: true,
    // Both these people have accepted notice version 1 in real life, so
    // without clearing it the insert fails on the unique constraint rather
    // than on anything to do with RLS. That misreports in both directions:
    // here it looks like a staff member is blocked from accepting their own
    // notice, and in the scenario below a duplicate-key error is indistin-
    // guishable from a policy rejection, so it would pass while testing
    // nothing.
    setup: (c) =>
      c.query(`delete from public.platform_notice_acceptances where profile_id = any($1)`, [
        [STAFF, MANAGER],
      ]),
    as: STAFF,
    probe: (c) =>
      c.query(
        `insert into public.platform_notice_acceptances (profile_id, organisation_id, notice_version)
         values ($1,$2,1)`,
        [STAFF, RSG],
      ),
  },
  {
    label: "staff accepts the platform notice on someone else's behalf",
    expectOk: false,
    setup: (c) =>
      c.query(`delete from public.platform_notice_acceptances where profile_id = any($1)`, [
        [STAFF, MANAGER],
      ]),
    as: STAFF,
    probe: (c) =>
      c.query(
        `insert into public.platform_notice_acceptances (profile_id, organisation_id, notice_version)
         values ($1,$2,1)`,
        [MANAGER, RSG],
      ),
  },

  // set_organisation_display_name is a SECURITY DEFINER function precisely
  // because a second permissive RLS policy can't be scoped to one column -
  // it would let an Admin (or worse, whoever else it was opened up to)
  // rewrite any column on organisations, not just display_name. The
  // function re-checks is_admin() itself and raises otherwise.
  {
    label: "admin sets their own organisation's display name",
    expectOk: true,
    as: ADMIN,
    probe: (c) => c.query(`select public.set_organisation_display_name($1)`, ["Ready Set Go"]),
  },
  {
    label: "manager (not admin) sets the organisation's display name",
    expectOk: false,
    as: MANAGER,
    probe: (c) => c.query(`select public.set_organisation_display_name($1)`, ["Not allowed"]),
  },

  // Migration 0066: sops_delete/policies_delete split out admin-only from
  // the shared manager_policy-or-admin write policy, specifically for the
  // portal management page's bulk-delete-everything action. A manager
  // (manager_staff here, already outside can_edit_content) must not be
  // able to delete a procedure or policy at all, single or bulk.
  {
    label: "admin deletes an RSG procedure",
    expectOk: true,
    as: ADMIN,
    probe: (c) => c.query(`delete from public.sops where id = $1`, [RSG_SOP]),
  },
  {
    label: "manager (not admin) deletes an RSG procedure",
    expectOk: false,
    as: MANAGER,
    probe: (c) => c.query(`delete from public.sops where id = $1`, [RSG_SOP]),
  },
  {
    label: "admin deletes an RSG policy",
    expectOk: true,
    as: ADMIN,
    probe: (c) => c.query(`delete from public.policies where id = $1`, [RSG_POLICY]),
  },
  {
    label: "manager (not admin) deletes an RSG policy",
    expectOk: false,
    as: MANAGER,
    probe: (c) => c.query(`delete from public.policies where id = $1`, [RSG_POLICY]),
  },

  // Private documents Storage bucket: a separate policy set from table RLS.
  // No storage.objects policies exist for it (confirmed directly against
  // storage.buckets / pg_policies), so an authenticated user gets nothing -
  // only the service-role client can reach it, which is by design.
  {
    label: "authenticated user uploads directly into the documents bucket",
    expectOk: false,
    as: STAFF,
    probe: (c) =>
      c.query(
        `insert into storage.objects (bucket_id, name, owner) values ('documents','rls-test/x.txt',$1)`,
        [STAFF],
      ),
  },
  {
    label: "authenticated user lists the documents bucket",
    expectOk: false,
    as: STAFF,
    probe: async (c) => {
      const r = await c.query(`select count(*)::int n from storage.objects where bucket_id='documents'`);
      return { rowCount: r.rows[0].n };
    },
  },

  // Build addendum item 1 (staff account CRUD, migrations 0044 then 0053).
  // profiles_update's with-check requires access_tier='staff' on the
  // manager/hr_manager branches - an HR manager can edit a plain staff
  // member's own record but not a fellow manager's, matching
  // canManageAccountFor()'s own gate in account-actions.ts exactly, so an
  // over-permissive app check can never produce a silent 0-row "success".
  {
    label: "manager (same service) updates a staff-tier colleague's name",
    expectOk: true,
    as: MANAGER,
    probe: (c) =>
      c.query(`update public.profiles set full_name=full_name where id=$1`, [STAFF]),
  },
  {
    label: "manager (same service) updates a manager-tier colleague's name (admin-only)",
    expectOk: false,
    setup: async (c) => {
      // ADMIN is normally service-less (org-wide); move it to Timboon for
      // this probe only, so the block below is the access_tier check firing,
      // not a service mismatch.
      await c.query(`update public.profiles set service_id=$1 where id=$2`, [TIMBOON, ADMIN]);
    },
    as: MANAGER,
    probe: (c) =>
      c.query(`update public.profiles set full_name=full_name where id=$1`, [ADMIN]),
  },
  {
    label: "manager updates a staff-tier colleague at a DIFFERENT service",
    expectOk: false,
    setup: async (c) => {
      await c.query(`update public.profiles set service_id=$1 where id=$2`, [MORTLAKE, MANAGER]);
    },
    as: MANAGER,
    probe: (c) =>
      c.query(`update public.profiles set full_name=full_name where id=$1`, [STAFF]),
  },
  // Migration 0053: DELETE on profiles is its own admin-only policy, split
  // out of the old for-all profiles_write so a same-service manager or
  // hr_manager-flagged account (both still fine for UPDATE) cannot delete a
  // colleague's account outright - permanentlyDeleteStaff() is admin-only in
  // the application and RLS now holds that line independently.
  {
    label: "manager (non-admin) deletes a colleague's profile at their own service",
    expectOk: false,
    as: MANAGER,
    probe: (c) => c.query(`delete from public.profiles where id=$1`, [STAFF]),
  },
  {
    label: "admin deletes a staff profile in their own org",
    expectOk: true,
    as: ADMIN,
    probe: (c) => c.query(`delete from public.profiles where id=$1`, [STAFF]),
  },
  {
    label: "RSG admin deletes a profile in a DIFFERENT org (Science Kinder)",
    expectOk: false,
    as: ADMIN,
    probe: (c) => {
      const SK_STAFF = "f504ce94-e3c0-4584-8ac7-64cbe810a889"; // SK staff (Educator)
      return c.query(`delete from public.profiles where id=$1`, [SK_STAFF]);
    },
  },

  // Build addendum item 2 follow-up (multi-role assignment, migration 0054).
  // profile_job_roles is written by two different app-level gates - the
  // person-record page's setStaffJobRoles() (admin, or hr_manager at the
  // person's service) and the job-roles-admin page's assignStaffToRole()/
  // removeStaffFromRole() (those two, plus a content editor org-wide) - so
  // both need their own probe, not just the narrower one.
  {
    label: "admin assigns a second role to a staff member (Sam)",
    expectOk: true,
    as: ADMIN,
    probe: (c) =>
      c.query(
        `insert into public.profile_job_roles (profile_id, job_role_id, organisation_id) values ($1,$2,$3)`,
        [STAFF, RSG_SECOND_ROLE, RSG],
      ),
  },
  {
    label: "manager (not hr_manager, not content editor) assigns a role",
    expectOk: false,
    as: MANAGER,
    probe: (c) =>
      c.query(
        `insert into public.profile_job_roles (profile_id, job_role_id, organisation_id) values ($1,$2,$3)`,
        [STAFF, RSG_SECOND_ROLE, RSG],
      ),
  },
  {
    label: "manager reads their own assigned roles",
    expectOk: true,
    as: MANAGER,
    probe: (c) => c.query(`select job_role_id from public.profile_job_roles where profile_id=$1`, [MANAGER]),
  },
  {
    label: "staff (Sam) reads a colleague's assigned roles (blocked)",
    expectOk: false,
    as: STAFF,
    probe: (c) => c.query(`select job_role_id from public.profile_job_roles where profile_id=$1`, [MANAGER]),
  },
  {
    label: "RSG admin assigns a role to an SK staff member (cross-tenant, blocked)",
    expectOk: false,
    as: ADMIN,
    probe: (c) => {
      // organisation_id on the insert is RSG (the actor's own org) - the
      // with-check's profile-org-match clause should still reject this,
      // since SK_STAFF's real organisation_id is Science Kinder's.
      const SK_STAFF = "f504ce94-e3c0-4584-8ac7-64cbe810a889";
      return c.query(
        `insert into public.profile_job_roles (profile_id, job_role_id, organisation_id) values ($1,$2,$3)`,
        [SK_STAFF, EDUCATOR_ROLE, RSG],
      );
    },
  },

  // sop_reviews / sop_review_actions (migrations 0039-0040, Review cycle v2).
  {
    label: "manager completes a review (sop_reviews insert)",
    expectOk: true,
    as: MANAGER,
    probe: (c) =>
      c.query(
        `insert into public.sop_reviews (organisation_id, sop_id, reviewed_by, practice_reflection, outcome_reflection, decision)
         values ($1,$2,$3,'Practice notes.','Outcome notes.','stands')`,
        [RSG, RSG_SOP, MANAGER],
      ),
  },
  {
    label: "plain staff attempts to complete a review",
    expectOk: false,
    as: STAFF,
    probe: (c) =>
      c.query(
        `insert into public.sop_reviews (organisation_id, sop_id, reviewed_by, practice_reflection, outcome_reflection, decision)
         values ($1,$2,$3,'Practice notes.','Outcome notes.','stands')`,
        [RSG, RSG_SOP, STAFF],
      ),
  },
  {
    label: "manager spoofs reviewed_by to someone else",
    expectOk: false,
    as: MANAGER,
    probe: (c) =>
      c.query(
        `insert into public.sop_reviews (organisation_id, sop_id, reviewed_by, practice_reflection, outcome_reflection, decision)
         values ($1,$2,$3,'Practice notes.','Outcome notes.','stands')`,
        [RSG, RSG_SOP, STAFF],
      ),
  },
  {
    label: "SK admin inserts a review against an RSG sop",
    expectOk: false,
    as: SK_ADMIN,
    probe: (c) =>
      c.query(
        `insert into public.sop_reviews (organisation_id, sop_id, reviewed_by, practice_reflection, outcome_reflection, decision)
         values ($1,$2,$3,'Practice notes.','Outcome notes.','stands')`,
        [RSG, RSG_SOP, SK_ADMIN],
      ),
  },
  {
    label: "RSG manager inserts a review against an SK sop",
    expectOk: false,
    as: MANAGER,
    probe: (c) =>
      c.query(
        `insert into public.sop_reviews (organisation_id, sop_id, reviewed_by, practice_reflection, outcome_reflection, decision)
         values ($1,$2,$3,'Practice notes.','Outcome notes.','stands')`,
        [SK, SK_SOP, MANAGER],
      ),
  },
  {
    // Regression check: sop_history_event_type_check silently rejected the
    // 'published' event publishSop writes (migration 0050 fixed it) - RLS
    // wasn't the blocker here, the CHECK constraint was, but a broken write
    // is a broken write regardless of which layer caused it, and this is
    // exactly the kind of thing that only shows up by hitting the database
    // directly rather than trusting the app layer.
    label: "content editor logs a 'published' sop_history event",
    expectOk: true,
    as: ADMIN,
    probe: (c) =>
      c.query(
        `insert into public.sop_history (organisation_id, sop_id, event_type, actor_profile_id, note)
         values ($1,$2,'published',$3,'Published v2')`,
        [RSG, RSG_SOP, ADMIN],
      ),
  },
  {
    label: "manager raises a review action",
    expectOk: true,
    setup: async (c) => {
      const r = await c.query(
        `insert into public.sop_reviews (organisation_id, sop_id, reviewed_by, practice_reflection, outcome_reflection, decision)
         values ($1,$2,$3,'Practice notes.','Outcome notes.','needs_revision') returning id`,
        [RSG, RSG_SOP, MANAGER],
      );
      c._reviewId = r.rows[0].id;
    },
    as: MANAGER,
    probe: (c) =>
      c.query(
        `insert into public.sop_review_actions (organisation_id, review_id, sop_id, description, raised_from, owner_id, due_date)
         values ($1,$2,$3,'Refresh training','practice',$4,current_date + 14)`,
        [RSG, c._reviewId, RSG_SOP, STAFF],
      ),
  },
  {
    label: "action owner (plain staff) marks their own action done",
    expectOk: true,
    setup: async (c) => {
      const r = await c.query(
        `insert into public.sop_reviews (organisation_id, sop_id, reviewed_by, practice_reflection, outcome_reflection, decision)
         values ($1,$2,$3,'Practice notes.','Outcome notes.','needs_revision') returning id`,
        [RSG, RSG_SOP, MANAGER],
      );
      const a = await c.query(
        `insert into public.sop_review_actions (organisation_id, review_id, sop_id, description, raised_from, owner_id, due_date)
         values ($1,$2,$3,'Refresh training','practice',$4,current_date + 14) returning id`,
        [RSG, r.rows[0].id, RSG_SOP, STAFF],
      );
      c._actionId = a.rows[0].id;
    },
    as: STAFF,
    probe: (c) =>
      c.query(`update public.sop_review_actions set status='done', completed_by=$1, completed_at=now() where id=$2`, [
        STAFF,
        c._actionId,
      ]),
  },
  {
    label: "unrelated staff (not owner, not manager) updates someone else's action",
    expectOk: false,
    setup: async (c) => {
      const r = await c.query(
        `insert into public.sop_reviews (organisation_id, sop_id, reviewed_by, practice_reflection, outcome_reflection, decision)
         values ($1,$2,$3,'Practice notes.','Outcome notes.','needs_revision') returning id`,
        [RSG, RSG_SOP, MANAGER],
      );
      const a = await c.query(
        `insert into public.sop_review_actions (organisation_id, review_id, sop_id, description, raised_from, owner_id, due_date)
         values ($1,$2,$3,'Refresh training','practice',$4,current_date + 14) returning id`,
        [RSG, r.rows[0].id, RSG_SOP, MANAGER],
      );
      c._actionId = a.rows[0].id;
    },
    as: STAFF,
    probe: (c) =>
      c.query(`update public.sop_review_actions set status='cancelled' where id=$1`, [c._actionId]),
  },

  // sop_outcome_flags (migration 0055, "My Outcomes"): any org member raises
  // a flag as themselves; only a manager/admin can read the org-wide list or
  // resolve one (submitReview() does the resolving, not the person who
  // raised it).
  {
    label: "staff flags a procedure with a reflection (own flag)",
    expectOk: true,
    as: STAFF,
    probe: (c) =>
      c.query(
        `insert into public.sop_outcome_flags (organisation_id, sop_id, flagged_by, reflection) values ($1,$2,$3,'Kids seem unsettled after this routine.')`,
        [RSG, RSG_SOP, STAFF],
      ),
  },
  {
    label: "staff spoofs flagged_by to someone else",
    expectOk: false,
    as: STAFF,
    probe: (c) =>
      c.query(
        `insert into public.sop_outcome_flags (organisation_id, sop_id, flagged_by, reflection) values ($1,$2,$3,'x')`,
        [RSG, RSG_SOP, MANAGER],
      ),
  },
  {
    label: "SK staff flags an RSG sop (cross-tenant, blocked)",
    expectOk: false,
    as: "f504ce94-e3c0-4584-8ac7-64cbe810a889",
    probe: (c) =>
      c.query(
        `insert into public.sop_outcome_flags (organisation_id, sop_id, flagged_by, reflection) values ($1,$2,$3,'x')`,
        [SK, RSG_SOP, "f504ce94-e3c0-4584-8ac7-64cbe810a889"],
      ),
  },
  {
    label: "manager reads open outcome flags org-wide",
    expectOk: true,
    setup: async (c) => {
      const f = await c.query(
        `insert into public.sop_outcome_flags (organisation_id, sop_id, flagged_by, reflection) values ($1,$2,$3,'x') returning id`,
        [RSG, RSG_SOP, STAFF],
      );
      c._flagId = f.rows[0].id;
    },
    as: MANAGER,
    probe: (c) => c.query(`select id from public.sop_outcome_flags where id=$1`, [c._flagId]),
  },
  {
    label: "staff reads someone else's open outcome flag (blocked)",
    expectOk: false,
    setup: async (c) => {
      const f = await c.query(
        `insert into public.sop_outcome_flags (organisation_id, sop_id, flagged_by, reflection) values ($1,$2,$3,'x') returning id`,
        [RSG, RSG_SOP, MANAGER],
      );
      c._flagId = f.rows[0].id;
    },
    as: STAFF,
    probe: (c) => c.query(`select id from public.sop_outcome_flags where id=$1`, [c._flagId]),
  },
  {
    label: "manager resolves an open flag",
    expectOk: true,
    setup: async (c) => {
      const f = await c.query(
        `insert into public.sop_outcome_flags (organisation_id, sop_id, flagged_by, reflection) values ($1,$2,$3,'x') returning id`,
        [RSG, RSG_SOP, STAFF],
      );
      c._flagId = f.rows[0].id;
    },
    as: MANAGER,
    probe: (c) =>
      c.query(`update public.sop_outcome_flags set resolved_at=now() where id=$1`, [c._flagId]),
  },
  {
    label: "staff resolves their own flag directly (blocked - only a review does this)",
    expectOk: false,
    setup: async (c) => {
      const f = await c.query(
        `insert into public.sop_outcome_flags (organisation_id, sop_id, flagged_by, reflection) values ($1,$2,$3,'x') returning id`,
        [RSG, RSG_SOP, STAFF],
      );
      c._flagId = f.rows[0].id;
    },
    as: STAFF,
    probe: (c) =>
      c.query(`update public.sop_outcome_flags set resolved_at=now() where id=$1`, [c._flagId]),
  },

  // AI Staff Q&A (migrations 0075-0077). content_chunks has no write policy
  // for ordinary users at all - only the embedding cron worker (service
  // role) ever writes it - so setup below inserts as the connection's own
  // unrestricted role, exactly like the service-role sanity checks further
  // down this file, before switching identity for the actual probe.
  {
    label: "policy chunk: RSG staff reads it (no audience rows = visible to all in-org, same as policy_visible() itself)",
    expectOk: true,
    setup: async (c) => {
      await c.query(
        `insert into public.content_chunks (organisation_id, document_type, document_id, document_version, chunk_index, section_heading, chunk_text, embedding)
         values ($1,'policy',$2,1,0,'Test section','Test chunk text.',$3::vector)`,
        [RSG, RSG_REAL_POLICY, ZERO_VECTOR],
      );
    },
    as: STAFF,
    probe: (c) =>
      c.query(`select id from public.content_chunks where document_type='policy' and document_id=$1`, [RSG_REAL_POLICY]),
  },
  {
    label: "policy chunk: SK admin reads an RSG chunk (cross-tenant, blocked)",
    expectOk: false,
    setup: async (c) => {
      await c.query(
        `insert into public.content_chunks (organisation_id, document_type, document_id, document_version, chunk_index, section_heading, chunk_text, embedding)
         values ($1,'policy',$2,1,0,'Test section','Test chunk text.',$3::vector)`,
        [RSG, RSG_REAL_POLICY, ZERO_VECTOR],
      );
    },
    as: SK_ADMIN,
    probe: (c) => c.query(`select id from public.content_chunks where document_type='policy' and document_id=$1`, [RSG_REAL_POLICY]),
  },
  {
    // Phone Communication is already linked to EDUCATOR_ROLE via
    // job_role_sops, and Sam already holds EDUCATOR_ROLE via
    // profile_job_roles - both real, current state, no setup needed for
    // the role link itself.
    label: "procedure chunk: staff holding the linked job role reads it (sop_visible via profile_job_roles)",
    expectOk: true,
    setup: async (c) => {
      await c.query(
        `insert into public.content_chunks (organisation_id, document_type, document_id, document_version, chunk_index, section_heading, chunk_text, embedding)
         values ($1,'sop',$2,1,0,'Test section','Test chunk text.',$3::vector)`,
        [RSG, RSG_REAL_SOP, ZERO_VECTOR],
      );
    },
    as: STAFF,
    probe: (c) => c.query(`select id from public.content_chunks where document_type='sop' and document_id=$1`, [RSG_REAL_SOP]),
  },
  {
    label: "authenticated staff writes directly into content_chunks (blocked - service role only)",
    expectOk: false,
    as: STAFF,
    probe: (c) =>
      c.query(
        `insert into public.content_chunks (organisation_id, document_type, document_id, document_version, chunk_index, chunk_text, embedding)
         values ($1,'policy',$2,1,0,'hacked',$3::vector)`,
        [RSG, RSG_REAL_POLICY, ZERO_VECTOR],
      ),
  },
  {
    label: "content editor enqueues an embedding job (mirrors what publishPolicy/publishSop now do)",
    expectOk: true,
    as: ADMIN,
    probe: (c) =>
      c.query(
        `insert into public.embedding_jobs (organisation_id, document_type, document_id, document_version) values ($1,'policy',$2,1)`,
        [RSG, RSG_REAL_POLICY],
      ),
  },
  {
    label: "plain staff enqueues an embedding job directly (blocked - can_edit_content required)",
    expectOk: false,
    as: STAFF,
    probe: (c) =>
      c.query(
        `insert into public.embedding_jobs (organisation_id, document_type, document_id, document_version) values ($1,'policy',$2,1)`,
        [RSG, RSG_REAL_POLICY],
      ),
  },
  {
    label: "staff logs their own Q&A interaction",
    expectOk: true,
    as: STAFF,
    probe: (c) =>
      c.query(
        `insert into public.ai_interactions (organisation_id, staff_profile_id, question, response, grounded, model)
         values ($1,$2,'Test question?','Test answer.',true,'test-model')`,
        [RSG, STAFF],
      ),
  },
  {
    label: "staff spoofs staff_profile_id on an interaction log to someone else",
    expectOk: false,
    as: STAFF,
    probe: (c) =>
      c.query(
        `insert into public.ai_interactions (organisation_id, staff_profile_id, question, response, grounded, model)
         values ($1,$2,'Test question?','Test answer.',true,'test-model')`,
        [RSG, RSG_REAL_MANAGER],
      ),
  },
  {
    label: "manager reads the org's Q&A interaction log",
    expectOk: true,
    setup: async (c) => {
      const r = await c.query(
        `insert into public.ai_interactions (organisation_id, staff_profile_id, question, response, grounded, model)
         values ($1,$2,'Test question?','Test answer.',true,'test-model') returning id`,
        [RSG, STAFF],
      );
      c._interactionId = r.rows[0].id;
    },
    as: RSG_REAL_MANAGER,
    probe: (c) => c.query(`select id from public.ai_interactions where id=$1`, [c._interactionId]),
  },
  {
    label: "plain staff reads the interaction log, even their own (blocked - audit trail is manager-only)",
    expectOk: false,
    setup: async (c) => {
      const r = await c.query(
        `insert into public.ai_interactions (organisation_id, staff_profile_id, question, response, grounded, model)
         values ($1,$2,'Test question?','Test answer.',true,'test-model') returning id`,
        [RSG, STAFF],
      );
      c._interactionId = r.rows[0].id;
    },
    as: STAFF,
    probe: (c) => c.query(`select id from public.ai_interactions where id=$1`, [c._interactionId]),
  },

  // Step 57 Part A: signed contract PDFs (migrations 0082, 0083). Each
  // scenario inserts its own throwaway contract row in setup (run as the
  // connection's own unrestricted role, before the identity switch) rather
  // than depending on a hardcoded contract id - same reasoning
  // resolveFixtures() above now uses for everything else in this file.
  {
    label: "staff writes requires_countersign directly on their own contract (blocked - contracts_write has no self-management branch at all)",
    expectOk: false,
    setup: async (c) => {
      const r = await c.query(
        `insert into public.contracts (organisation_id, profile_id, start_date, period_type, requires_countersign)
         values ($1,$2,current_date,'no_fixed_period',true) returning id`,
        [RSG, STAFF],
      );
      c._contractId = r.rows[0].id;
    },
    as: STAFF,
    probe: (c) => c.query(`update public.contracts set requires_countersign=false where id=$1`, [c._contractId]),
  },
  {
    label: "staff attaches a signature to someone else's contract (blocked)",
    expectOk: false,
    setup: async (c) => {
      const r = await c.query(
        `insert into public.contracts (organisation_id, profile_id, start_date, period_type, requires_countersign)
         values ($1,$2,current_date,'no_fixed_period',true) returning id`,
        [RSG, ADMIN],
      );
      c._contractId = r.rows[0].id;
    },
    as: STAFF,
    probe: (c) =>
      c.query(
        `insert into public.documents (organisation_id, owner_type, owner_id, file_name, storage_path)
         values ($1,'signature',$2,'x.png','x')`,
        [RSG, c._contractId],
      ),
  },
  {
    label: "staff reads/writes the signed_copy of their own contract (allowed - the self-sign flow needs this)",
    expectOk: true,
    setup: async (c) => {
      const r = await c.query(
        `insert into public.contracts (organisation_id, profile_id, start_date, period_type, requires_countersign)
         values ($1,$2,current_date,'no_fixed_period',true) returning id`,
        [RSG, STAFF],
      );
      c._contractId = r.rows[0].id;
    },
    as: STAFF,
    probe: (c) =>
      c.query(
        `insert into public.documents (organisation_id, owner_type, owner_id, file_name, storage_path)
         values ($1,'signed_copy',$2,'x.pdf','x')`,
        [RSG, c._contractId],
      ),
  },
  {
    label: "admin countersigns their own contract via the RPC (blocked - the new self-countersign check)",
    expectOk: false,
    setup: async (c) => {
      const r = await c.query(
        `insert into public.contracts (organisation_id, profile_id, start_date, period_type, requires_countersign)
         values ($1,$2,current_date,'no_fixed_period',true) returning id`,
        [RSG, ADMIN],
      );
      c._contractId = r.rows[0].id;
    },
    as: ADMIN,
    probe: (c) =>
      c.query(`select public.countersign_contract($1,'Zeke Pottage','deadbeef')`, [c._contractId]),
  },
  {
    label: "SK admin reads an RSG contract's document row (cross-tenant, blocked)",
    expectOk: false,
    setup: async (c) => {
      const contract = await c.query(
        `insert into public.contracts (organisation_id, profile_id, start_date, period_type, requires_countersign)
         values ($1,$2,current_date,'no_fixed_period',true) returning id`,
        [RSG, STAFF],
      );
      const doc = await c.query(
        `insert into public.documents (organisation_id, owner_type, owner_id, file_name, storage_path)
         values ($1,'contract',$2,'x.pdf','x') returning id`,
        [RSG, contract.rows[0].id],
      );
      c._docId = doc.rows[0].id;
    },
    as: SK_ADMIN,
    probe: (c) => c.query(`select id from public.documents where id=$1`, [c._docId]),
  },
];

await client.connect();
await resolveFixtures();
for (const u of USERS) await probe(u);
console.log("\n=== write probes (all should be rejected or no-op) ===");
for (const p of writeProbes()) await writeProbe(p);
console.log("\n=== application write-path scenarios ===");
for (const s of appScenarios()) await scenario(s.label, s);

// Sanity checks for the two server tasks that are meant to keep the
// service-role key: run as the connection's own unrestricted role (no
// `set local role authenticated`), so this exercises the same privilege
// level runReminders() and a service-role-invoked import_documents() call
// actually run under, without sending a real cron run's real emails.
console.log("\n=== service-role tasks still work (reminders cron, document importer) ===");
await client.query("begin");
try {
  const before = await client.query(`select count(*)::int n from public.notification_log`);
  await client.query(
    `insert into public.notification_log (organisation_id, recipient_profile_id, recipient_email, kind, detail)
     values ($1,$2,'rls-test@example.invalid','staff_digest','{}'::jsonb)`,
    [RSG, STAFF],
  );
  const after = await client.query(`select count(*)::int n from public.notification_log`);
  const ok = after.rows[0].n === before.rows[0].n + 1;
  console.log(`  notification_log insert (service role path)      ${ok ? "OK" : "FAILED"}`);
  if (!ok) problems.push("service role: notification_log insert did not take");
} catch (e) {
  problems.push(`service role: notification_log insert threw: ${e.message.slice(0, 80)}`);
  console.log(`  notification_log insert (service role path)      FAILED: ${e.message.slice(0, 80)}`);
} finally {
  await client.query("rollback");
}

await client.query("begin");
try {
  const r = await client.query(`select public.import_documents($1, '{}'::jsonb) as result`, [RSG]);
  const result = r.rows[0].result;
  const ok =
    result &&
    result.policies_upserted === 0 &&
    result.sops_upserted === 0 &&
    result.links_upserted === 0;
  console.log(`  import_documents(org, {}) still callable          ${ok ? "OK" : "FAILED"}`);
  if (!ok) problems.push(`service role: import_documents returned unexpected shape: ${JSON.stringify(result)}`);
} catch (e) {
  problems.push(`service role: import_documents threw: ${e.message.slice(0, 80)}`);
  console.log(`  import_documents(org, {}) still callable          FAILED: ${e.message.slice(0, 80)}`);
} finally {
  await client.query("rollback");
}
notes.push(
  "The reminders cron itself was not run live end-to-end (dryRun=1 still requires CRON_SECRET in production and a non-dry run would email real staff) - the check above confirms the exact insert shape it uses still succeeds under the service-role path; check Vercel's cron logs for the next scheduled run for full confirmation.",
);

await client.end();

console.log("\n" + "=".repeat(50));
if (problems.length === 0) {
  console.log("PASS: no cross-tenant row visibility detected, no unexpected write-path result.");
} else {
  console.log(`FAIL: ${problems.length} issue(s):`);
  for (const p of problems) console.log("  - " + p);
}
if (notes.length) {
  console.log("\nNotes:");
  for (const n of notes) console.log("  - " + n);
}
