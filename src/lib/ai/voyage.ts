// Embeddings for the AI Staff Q&A feature (and any future caller of the
// shared ai-service). Anthropic has no embeddings endpoint of its own, so
// this is a second provider - Voyage AI, Anthropic's own recommended
// pairing for RAG. Plain REST, no SDK: Voyage's API is a single POST
// endpoint, and every other integration in this codebase (mammoth,
// turndown, unpdf) is chosen to keep the dependency footprint lean rather
// than pull in a client library for one call shape.

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
