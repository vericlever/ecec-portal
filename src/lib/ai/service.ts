import type { SupabaseClient } from "@supabase/supabase-js";
import { embed, embedOne } from "./voyage";
import { generate } from "./anthropic";
import { chunkMarkdown } from "./chunk";
import { createAdminClient } from "@/lib/supabase/admin";

const NO_MATCH_RESPONSE =
  "I couldn't find anything in the policies or procedures that answers this - ask your director.";

const MIN_SIMILARITY = Number(process.env.AI_QA_MIN_SIMILARITY ?? "0.5");
const MATCH_COUNT = Number(process.env.AI_QA_MATCH_COUNT ?? "8");

export type DocumentType = "policy" | "sop";

export type RetrievedChunk = {
  chunkId: string;
  documentType: DocumentType;
  documentId: string;
  sectionHeading: string | null;
  chunkText: string;
  similarity: number;
};

export type Source = {
  documentType: DocumentType;
  documentId: string;
  name: string;
};

export type AnswerResult = {
  answer: string;
  sources: Source[];
  grounded: boolean;
};

// Called from publishPolicy()/publishSop() before enqueuing a re-embed -
// skips the insert entirely for a tenant with the feature off, so a
// disabled organisation (Science Kinder, or any future tenant not yet
// enabled) never accumulates embedding_jobs rows that would cost real
// Voyage/Anthropic usage to process for a feature nobody there can use.
export async function aiQaEnabledFor(supabase: SupabaseClient, organisationId: string): Promise<boolean> {
  const { data } = await supabase
    .from("organisations")
    .select("ai_qa_enabled")
    .eq("id", organisationId)
    .maybeSingle();
  return Boolean(data?.ai_qa_enabled);
}

// Runs on the asking staff member's own request-scoped client, never the
// admin client - content_chunks' RLS (policy_visible/sop_visible, see
// migration 0075) is what actually restricts which chunks come back, not
// any filtering done here. match_org narrows the index scan; RLS is the
// real boundary, same principle migration 0044 established for every other
// table in this codebase.
export async function retrieveChunks(
  supabase: SupabaseClient,
  organisationId: string,
  question: string,
): Promise<RetrievedChunk[]> {
  const queryEmbedding = await embedOne(question, "query");
  const { data, error } = await supabase.rpc("match_content_chunks", {
    query_embedding: queryEmbedding,
    match_org: organisationId,
    match_count: MATCH_COUNT,
    min_similarity: MIN_SIMILARITY,
  });
  if (error || !data) return [];

  return (data as Record<string, unknown>[]).map((row) => ({
    chunkId: row.chunk_id as string,
    documentType: row.document_type as DocumentType,
    documentId: row.document_id as string,
    sectionHeading: row.section_heading as string | null,
    chunkText: row.chunk_text as string,
    similarity: row.similarity as number,
  }));
}

async function sourceNames(
  supabase: SupabaseClient,
  chunks: RetrievedChunk[],
): Promise<Map<string, string>> {
  const policyIds = [...new Set(chunks.filter((c) => c.documentType === "policy").map((c) => c.documentId))];
  const sopIds = [...new Set(chunks.filter((c) => c.documentType === "sop").map((c) => c.documentId))];

  const names = new Map<string, string>();
  const [{ data: policies }, { data: sops }] = await Promise.all([
    policyIds.length ? supabase.from("policies").select("id, name").in("id", policyIds) : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    sopIds.length ? supabase.from("sops").select("id, name").in("id", sopIds) : Promise.resolve({ data: [] as { id: string; name: string }[] }),
  ]);
  for (const p of policies ?? []) names.set(`policy:${p.id}`, p.name);
  for (const s of sops ?? []) names.set(`sop:${s.id}`, s.name);
  return names;
}

const SYSTEM_PROMPT = `You are a staff assistant for an early childhood education centre. Answer only from the material provided in this message - no other source of information is available to you for this task. If the provided material does not answer the question, say so plainly rather than filling the gap from general knowledge or training data. Cite which source document each part of your answer draws from, using the document names given. Keep the answer short and direct - this is being read on a shared iPad, not a report.`;

function buildUserMessage(question: string, chunks: RetrievedChunk[], names: Map<string, string>): string {
  const labelled = chunks
    .map((c, i) => {
      const name = names.get(`${c.documentType}:${c.documentId}`) ?? "Unknown document";
      const heading = c.sectionHeading ? ` - ${c.sectionHeading}` : "";
      return `[Source ${i + 1}: ${name}${heading}]\n${c.chunkText}`;
    })
    .join("\n\n---\n\n");
  return `Question: ${question}\n\n${labelled}`;
}

async function logInteraction(
  supabase: SupabaseClient,
  opts: {
    organisationId: string;
    staffProfileId: string;
    question: string;
    response: string;
    grounded: boolean;
    chunkIds: string[];
    sources: Source[];
    model: string;
  },
): Promise<void> {
  await supabase.from("ai_interactions").insert({
    organisation_id: opts.organisationId,
    staff_profile_id: opts.staffProfileId,
    question: opts.question,
    response: opts.response,
    grounded: opts.grounded,
    chunk_ids: opts.chunkIds,
    source_documents: opts.sources,
    model: opts.model,
  });
}

export async function answerQuestion(
  supabase: SupabaseClient,
  organisationId: string,
  staffProfileId: string,
  question: string,
): Promise<AnswerResult> {
  const chunks = await retrieveChunks(supabase, organisationId, question);

  if (chunks.length === 0) {
    await logInteraction(supabase, {
      organisationId,
      staffProfileId,
      question,
      response: NO_MATCH_RESPONSE,
      grounded: false,
      chunkIds: [],
      sources: [],
      model: "none",
    });
    return { answer: NO_MATCH_RESPONSE, sources: [], grounded: false };
  }

  const names = await sourceNames(supabase, chunks);
  const userMessage = buildUserMessage(question, chunks, names);
  const answer = await generate({
    taskType: "qa",
    systemPrompt: SYSTEM_PROMPT,
    userMessage,
  });

  const seen = new Set<string>();
  const sources: Source[] = [];
  for (const c of chunks) {
    const key = `${c.documentType}:${c.documentId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    sources.push({ documentType: c.documentType, documentId: c.documentId, name: names.get(key) ?? "Unknown document" });
  }

  await logInteraction(supabase, {
    organisationId,
    staffProfileId,
    question,
    response: answer,
    grounded: true,
    chunkIds: chunks.map((c) => c.chunkId),
    sources,
    model: process.env.AI_QA_MODEL || "claude-haiku-4-5-20251001",
  });

  return { answer, sources, grounded: true };
}

// Runs from the embedding cron worker only - no request-scoped session
// exists in a background job, so this is the one place in the Q&A feature
// that legitimately uses the admin client, the same reasoning
// src/lib/documents/store.ts already uses for Storage writes.
export async function reembedDocument(documentType: DocumentType, documentId: string): Promise<void> {
  const admin = createAdminClient();
  const table = documentType === "policy" ? "policies" : "sops";
  const { data: doc, error } = await admin
    .from(table)
    .select("organisation_id, published_body, published_version")
    .eq("id", documentId)
    .maybeSingle();
  if (error) throw error;
  if (!doc || !doc.published_body || doc.published_version == null) {
    throw new Error(`${documentType} ${documentId} has no published body to embed`);
  }

  const chunks = chunkMarkdown(doc.published_body);
  if (chunks.length === 0) {
    await admin.from("content_chunks").delete().eq("document_type", documentType).eq("document_id", documentId);
    return;
  }

  const vectors = await embed(chunks.map((c) => c.text), "document");

  await admin.from("content_chunks").delete().eq("document_type", documentType).eq("document_id", documentId);

  const rows = chunks.map((c, i) => ({
    organisation_id: doc.organisation_id,
    document_type: documentType,
    document_id: documentId,
    document_version: doc.published_version,
    chunk_index: i,
    section_heading: c.heading,
    chunk_text: c.text,
    embedding: vectors[i],
  }));

  const { error: insertError } = await admin.from("content_chunks").insert(rows);
  if (insertError) throw insertError;
}

const JOBS_PER_RUN = 10;

// Called by the cron worker only. embedding_jobs is both the queue and the
// evidence log the spec asks for ("log every embedding attempt, success or
// failure") - each row is updated in place as it moves through
// pending -> processing -> done/failed, rather than writing to a second log
// table for the same information.
export async function runEmbeddingJobs(opts: { dryRun?: boolean } = {}): Promise<{
  processed: number;
  succeeded: number;
  failed: number;
  jobs: { id: string; documentType: DocumentType; documentId: string; status: string }[];
}> {
  const admin = createAdminClient();
  const { data: pending, error } = await admin
    .from("embedding_jobs")
    .select("id, organisation_id, document_type, document_id, document_version, attempts")
    .eq("status", "pending")
    .order("enqueued_at", { ascending: true })
    .limit(JOBS_PER_RUN);
  if (error) throw error;

  const jobs = pending ?? [];
  if (opts.dryRun) {
    return {
      processed: jobs.length,
      succeeded: 0,
      failed: 0,
      jobs: jobs.map((j) => ({
        id: j.id,
        documentType: j.document_type as DocumentType,
        documentId: j.document_id,
        status: "would process",
      })),
    };
  }

  let succeeded = 0;
  let failed = 0;
  const results: { id: string; documentType: DocumentType; documentId: string; status: string }[] = [];
  const touchedOrgs = new Set<string>();

  for (const job of jobs) {
    await admin
      .from("embedding_jobs")
      .update({ status: "processing", attempts: (job.attempts ?? 0) + 1 })
      .eq("id", job.id);

    try {
      await reembedDocument(job.document_type as DocumentType, job.document_id);
      await admin
        .from("embedding_jobs")
        .update({ status: "done", processed_at: new Date().toISOString() })
        .eq("id", job.id);
      succeeded++;
      touchedOrgs.add(job.organisation_id);
      results.push({ id: job.id, documentType: job.document_type as DocumentType, documentId: job.document_id, status: "done" });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Unknown error";
      await admin
        .from("embedding_jobs")
        .update({ status: "failed", last_error: message, processed_at: new Date().toISOString() })
        .eq("id", job.id);
      failed++;
      results.push({ id: job.id, documentType: job.document_type as DocumentType, documentId: job.document_id, status: "failed" });
    }
  }

  // Boilerplate suppression (migration 0080) is a property of the whole of
  // an organisation's library, not of any one document, so it is recomputed
  // once per organisation after its documents have been re-embedded rather
  // than inside reembedDocument. Recomputing from scratch each time means
  // a chunk stops being treated as boilerplate as soon as the library stops
  // repeating it, with no stale flag to clean up.
  //
  // A failure here must not fail the run: the documents are correctly
  // embedded either way, and the only consequence of a skipped recompute is
  // that the previous run's flags stand until the next drain.
  for (const org of touchedOrgs) {
    const { error: recomputeError } = await admin.rpc("recompute_boilerplate_chunks", {
      p_org: org,
    });
    if (recomputeError) {
      console.error(`recompute_boilerplate_chunks failed for ${org}: ${recomputeError.message}`);
    }
  }

  return { processed: jobs.length, succeeded, failed, jobs: results };
}
