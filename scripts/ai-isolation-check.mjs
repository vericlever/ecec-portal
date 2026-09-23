// Tenant isolation check for the AI Q&A retrieval path.
//
//   node scripts/ai-isolation-check.mjs
//
// scripts/rls-check.mjs proves no cross-tenant rows are visible table by
// table. This proves the same thing through the path an actual question
// takes: match_content_chunks, called with the asker's own JWT. That
// function is security invoker precisely so content_chunks_select applies
// inside its own query, and this is the test of that claim.
//
// Worth testing separately because the failure would not look like a
// security incident. A leak here surfaces as a confident, plausible answer
// in someone else's portal, attributed to a source they cannot open - the
// kind of thing that gets read as "the AI is confused" rather than "another
// customer's policies are being served to us".
//
// The strongest case is two organisations holding a policy that answers the
// SAME question, so a leak returns something plausible rather than something
// obviously foreign. Ready Set Go and Science Kinder both have a child
// collection policy, which is what the default questions below target.
//
// Deliberately asserts on an invariant rather than on expected document
// names: every chunk returned must belong to the asking organisation. Names
// and row ids rot whenever content is reloaded - that is exactly how
// rls-check.mjs quietly stopped testing anything - whereas "never another
// tenant's row" stays true for any content, in any organisation, forever.

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

const MIN_SIMILARITY = Number(process.env.AI_QA_MIN_SIMILARITY ?? "0.42");
const QUESTIONS = process.argv.slice(2).length
  ? process.argv.slice(2)
  : ["who can collect children?", "what to do in a bushfire?", "what if a child is injured?"];

if (!process.env.VOYAGE_API_KEY) {
  console.error("VOYAGE_API_KEY is not set - needed to embed the test questions.");
  process.exit(1);
}

async function embedQuery(text) {
  const res = await fetch("https://api.voyageai.com/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.VOYAGE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "voyage-3.5-lite",
      input: [text],
      input_type: "query",
      output_dimension: 1024,
    }),
  });
  if (!res.ok) throw new Error(`Voyage ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return `[${(await res.json()).data[0].embedding.join(",")}]`;
}

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
await client.connect();

// Every organisation that has both the feature on and something indexed,
// with one signed-in identity each. Resolved, never hardcoded.
const { rows: tenants } = await client.query(`
  select o.id, o.name,
    (select p.id from public.profiles p
      where p.organisation_id = o.id and p.is_active
      order by case p.access_tier when 'staff' then 0 else 1 end, p.created_at
      limit 1) as asker,
    (select count(*) from public.content_chunks c where c.organisation_id = o.id) as chunks
  from public.organisations o
  where o.ai_qa_enabled
  order by o.name
`);

const usable = tenants.filter((t) => t.asker && Number(t.chunks) > 0);
if (usable.length < 2) {
  console.error("Need at least two organisations with ai_qa_enabled, indexed chunks and a");
  console.error("signed-in identity to test isolation between. Found:");
  for (const t of tenants) {
    console.error(`  - ${t.name}: ${t.chunks} chunks, asker ${t.asker ?? "none"}`);
  }
  await client.end();
  process.exit(1);
}

console.log("Tenants under test:");
for (const t of usable) console.log(`  ${t.name.padEnd(18)} ${t.chunks} chunks`);

const failures = [];

async function ask(askerId, matchOrg, vector) {
  await client.query("begin");
  try {
    await client.query("set local role authenticated");
    await client.query(`select set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify({ sub: askerId, role: "authenticated" }),
    ]);
    const { rows } = await client.query(
      `select m.document_id, m.document_type, c.organisation_id
         from public.match_content_chunks($1::vector, $2, 8, $3) m
         join public.content_chunks c on c.id = m.chunk_id`,
      [vector, matchOrg, MIN_SIMILARITY],
    );
    return rows;
  } finally {
    await client.query("rollback");
  }
}

for (const question of QUESTIONS) {
  const vector = await embedQuery(question);
  console.log(`\n=== "${question}"`);

  for (const asker of usable) {
    // Asking within your own organisation: results are allowed, but every
    // one of them must be yours.
    const own = await ask(asker.asker, asker.id, vector);
    const foreign = own.filter((r) => r.organisation_id !== asker.id);
    if (foreign.length > 0) {
      console.log(`  [FAIL] ${asker.name}: ${foreign.length} foreign chunk(s) in own-org results`);
      failures.push(`${asker.name} own-org query returned another tenant's rows`);
    } else {
      console.log(`  [OK]   ${asker.name.padEnd(18)} ${own.length} own result(s), 0 foreign`);
    }

    // Passing someone else's organisation id straight to the RPC. This is
    // the attack the security-invoker design exists to stop: the parameter
    // is attacker-controlled, and only RLS inside the function prevents it
    // from being honoured.
    for (const other of usable) {
      if (other.id === asker.id) continue;
      const spoof = await ask(asker.asker, other.id, vector);
      if (spoof.length > 0) {
        console.log(`  [FAIL] ${asker.name} read ${other.name} by passing its org id (${spoof.length} rows)`);
        failures.push(`${asker.name} spoofed match_org to read ${other.name}`);
      } else {
        console.log(`  [OK]   ${asker.name.padEnd(18)} spoofing ${other.name}'s org id -> no rows`);
      }
    }
  }
}

// The RPC is not the only way in. A signed-in user can query the table.
console.log("\n=== direct table reads, bypassing the RPC ===");
for (const asker of usable) {
  for (const other of usable) {
    if (other.id === asker.id) continue;
    await client.query("begin");
    await client.query("set local role authenticated");
    await client.query(`select set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify({ sub: asker.asker, role: "authenticated" }),
    ]);
    const { rows } = await client.query(
      `select count(*)::int as n from public.content_chunks where organisation_id = $1`,
      [other.id],
    );
    await client.query("rollback");
    if (rows[0].n > 0) {
      console.log(`  [FAIL] ${asker.name} selected ${rows[0].n} of ${other.name}'s chunks directly`);
      failures.push(`${asker.name} read ${other.name}'s content_chunks directly`);
    } else {
      console.log(`  [OK]   ${asker.name.padEnd(18)} sees 0 of ${other.name}'s chunks`);
    }
  }
}

console.log("\n" + "=".repeat(52));
if (failures.length === 0) {
  console.log("PASS: no cross-tenant content reached any asker.");
} else {
  console.log(`FAIL: ${failures.length} issue(s):`);
  failures.forEach((f) => console.log("  - " + f));
}
await client.end();
process.exit(failures.length === 0 ? 0 : 1);
