// Embeddings for the AI Staff Q&A feature (and any future caller of the
// shared ai-service). Anthropic has no embeddings endpoint of its own, so
// this is a second provider - Voyage AI, Anthropic's own recommended
// pairing for RAG. Plain REST, no SDK: Voyage's API is a single POST
// endpoint, and every other integration in this codebase (mammoth,
// turndown, unpdf) is chosen to keep the dependency footprint lean rather
// than pull in a client library for one call shape.
//
// Kept in production after Step 58's onshoring work (28 September 2026):
// tested against AWS Bedrock's only Sydney-available embedding model (Titan
// Text Embeddings V2, via scripts/compare-embedding-models.ts) against 20
// real staff questions, and Titan missed retrieval on several, including a
// safety-critical one ("What do I do if a child has an allergic reaction?" -
// Titan's top 3 results didn't include the Anaphylaxis Management Policy at
// all; Voyage found it correctly). Titan's raw similarity scores also ran
// far lower than Voyage's across the board, which alone would have needed a
// re-tuned MIN_SIMILARITY threshold - but the retrieval misses were the
// deciding factor. Claude inference still moved to Bedrock; only the
// embeddings/search layer stayed on Voyage. See BUILD_LOG.md, 28 September
// 2026, and the Platform Terms of Use and Privacy Notice update, which
// keeps Voyage disclosed as an ongoing external provider rather than
// removing it.

const VOYAGE_EMBEDDINGS_URL = "https://api.voyageai.com/v1/embeddings";

// voyage-3.5-lite: cheap, adequate for this corpus size. Confirm current
// model string and pricing before relying on this long-term - Voyage's
// lineup moves the same way Anthropic's does.
const MODEL = "voyage-3.5-lite";

export const EMBEDDING_DIMENSIONS = 1024;

export async function embed(
  texts: string[],
  inputType: "document" | "query",
): Promise<number[][]> {
  if (texts.length === 0) return [];
  const apiKey = process.env.VOYAGE_API_KEY;
  if (!apiKey) throw new Error("VOYAGE_API_KEY is not set");

  const res = await fetch(VOYAGE_EMBEDDINGS_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      input: texts,
      input_type: inputType,
      output_dimension: EMBEDDING_DIMENSIONS,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Voyage embeddings request failed (${res.status}): ${body.slice(0, 300)}`);
  }

  const json = (await res.json()) as { data: { embedding: number[]; index: number }[] };
  return json.data
    .sort((a, b) => a.index - b.index)
    .map((d) => d.embedding);
}

export async function embedOne(text: string, inputType: "document" | "query"): Promise<number[]> {
  const [vector] = await embed([text], inputType);
  return vector;
}
