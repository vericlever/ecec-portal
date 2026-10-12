// Step 58, A4a: sanity-check Titan Text Embeddings V2 against the current live
// Voyage results, using this tenant's real corpus and real staff questions.
//
// Originally written to compare two Bedrock candidates (Titan vs Cohere), but
// Cohere Embed has no serverless listing in ap-southeast-2 at all (checked
// directly in the Bedrock model catalog, 28 September 2026) - Titan is the
// only Sydney-available option, so this isn't a bake-off any more. Still
// worth running once, as a real check that Titan's retrieval quality is at
// least comparable to what Voyage was already returning, before re-embedding
// the whole corpus with it via scripts/reembed-corpus.ts.
//
// REQUIRES LIVE AWS CREDENTIALS for the vericlever-ai role (or the local dev
// IAM user set up alongside it) - this script makes real Bedrock InvokeModel
// calls and cannot run without them.
//
//   npx tsx scripts/compare-embedding-models.ts
//
// What it does:
// 1. Pulls the 20 most recent DISTINCT real staff questions from
//    ai_interactions - never invented questions.
// 2. Chunks the whole published corpus (sops + policies) exactly as
//    production does (chunkMarkdown), per organisation.
// 3. Embeds every chunk with Titan (one call per chunk - no batch endpoint).
// 4. For each question, embeds it with Titan, ranks the corpus by cosine
//    similarity, and prints the top 3 alongside the CURRENT LIVE Voyage
//    result for the same question (via the real match_content_chunks RPC)
//    so a human can judge whether Titan's results look at least as good.
//
// This script does not auto-decide - there's nothing to decide between any
// more, but reading the output before committing to a full re-embed is still
// worthwhile. Record what you saw in BUILD_LOG.md, then run
// scripts/reembed-corpus.ts.

import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { chunkMarkdown } from "../src/lib/ai/chunk";
import { embedWithModel } from "../src/lib/ai/client";

function loadEnv() {
  const file = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}
loadEnv();

const CANDIDATE = "amazon.titan-embed-text-v2:0";
// Matches production's MATCH_COUNT default (src/lib/ai/service.ts) - all 8
// retrieved chunks go to Claude to synthesise an answer from, not just the
// top 3, so this is the number that actually matters for a fair verdict.
const TOP_K = 8;
const QUESTION_COUNT = 20;

type CorpusChunk = {
  organisationId: string;
  documentType: "sop" | "policy";
  documentId: string;
  documentName: string;
  heading: string | null;
  text: string;
};

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env.local");
  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  // 1. Real staff questions only.
  const { data: interactions, error: interactionsError } = await admin
    .from("ai_interactions")
    .select("organisation_id, question")
    .order("created_at", { ascending: false })
    .limit(500);
  if (interactionsError) throw interactionsError;

  const seen = new Set<string>();
  const questions: { organisationId: string; question: string }[] = [];
  for (const row of interactions ?? []) {
    const q = (row.question as string).trim();
    if (seen.has(q)) continue;
    seen.add(q);
    questions.push({ organisationId: row.organisation_id as string, question: q });
    if (questions.length >= QUESTION_COUNT) break;
  }
  if (questions.length < QUESTION_COUNT) {
    console.warn(`Only ${questions.length} distinct saved questions found (wanted ${QUESTION_COUNT}) - continuing with what's there.`);
  }

  // 2. Whole published corpus, chunked exactly as production's reembedDocument does.
  const [{ data: sops, error: sopsError }, { data: policies, error: policiesError }] = await Promise.all([
    admin.from("sops").select("id, organisation_id, name, published_body").not("published_body", "is", null),
    admin.from("policies").select("id, organisation_id, name, published_body").not("published_body", "is", null),
  ]);
  if (sopsError) throw sopsError;
  if (policiesError) throw policiesError;

  const corpus: CorpusChunk[] = [];
  for (const s of sops ?? []) {
    for (const c of chunkMarkdown(s.published_body as string)) {
      corpus.push({ organisationId: s.organisation_id as string, documentType: "sop", documentId: s.id as string, documentName: s.name as string, heading: c.heading, text: c.text });
    }
  }
  for (const p of policies ?? []) {
    for (const c of chunkMarkdown(p.published_body as string)) {
      corpus.push({ organisationId: p.organisation_id as string, documentType: "policy", documentId: p.id as string, documentName: p.name as string, heading: c.heading, text: c.text });
    }
  }
  console.log(`Corpus: ${corpus.length} chunks across ${(sops ?? []).length} procedures + ${(policies ?? []).length} policies.\n`);

  // 3. Embed the whole corpus with Titan. One call per chunk.
  console.log(`Embedding ${corpus.length} chunks with ${CANDIDATE}...`);
  const corpusVectors: number[][] = [];
  for (let i = 0; i < corpus.length; i++) {
    corpusVectors.push(await embedWithModel(CANDIDATE, corpus[i].text, "document"));
    if ((i + 1) % 50 === 0) console.log(`  ...${i + 1}/${corpus.length}`);
  }
  console.log("Done embedding corpus.\n");

  // 4. For each question: current live Voyage result + Titan's result.
  for (const { organisationId, question } of questions) {
    console.log("=".repeat(100));
    console.log(`Q: ${question}`);
    console.log("=".repeat(100));

    try {
      const voyageKey = process.env.VOYAGE_API_KEY;
      if (voyageKey) {
        const res = await fetch("https://api.voyageai.com/v1/embeddings", {
          method: "POST",
          headers: { Authorization: `Bearer ${voyageKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ model: "voyage-3.5-lite", input: [question], input_type: "query", output_dimension: 1024 }),
        });
        const json = await res.json();
        const queryVector = json.data[0].embedding as number[];
        const { data: rpcResults } = await admin.rpc("match_content_chunks", {
          query_embedding: queryVector,
          match_org: organisationId,
          match_count: TOP_K,
          min_similarity: 0.0,
        });
        console.log("\n[CURRENT: Voyage voyage-3.5-lite]");
        for (const r of rpcResults ?? []) {
          console.log(`  ${(r.similarity as number).toFixed(3)} | ${r.section_heading ?? "(no heading)"} | ${(r.chunk_text as string).slice(0, 100)}...`);
        }
      } else {
        console.log("\n[CURRENT: Voyage] skipped - VOYAGE_API_KEY not set");
      }
    } catch (e) {
      console.log("\n[CURRENT: Voyage] failed:", e instanceof Error ? e.message : e);
    }

    const orgChunks = corpus
      .map((c, i) => ({ chunk: c, vector: corpusVectors[i] }))
      .filter((c) => c.chunk.organisationId === organisationId);

    const queryVector = await embedWithModel(CANDIDATE, question, "query");
    const ranked = orgChunks
      .map((c) => ({ ...c, similarity: cosineSimilarity(queryVector, c.vector) }))
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, TOP_K);

    console.log(`\n[TITAN: ${CANDIDATE}]`);
    for (const r of ranked) {
      console.log(`  ${r.similarity.toFixed(3)} | ${r.chunk.documentName} - ${r.chunk.heading ?? "(no heading)"} | ${r.chunk.text.slice(0, 100)}...`);
    }
    console.log("");
  }

  console.log("\nDone. Read the output above - if Titan's top results look at least as relevant as Voyage's for");
  console.log("these real questions, proceed to scripts/reembed-corpus.ts. Record what you saw in BUILD_LOG.md.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
