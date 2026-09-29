import { AnthropicBedrock } from "@anthropic-ai/bedrock-sdk";
import { BedrockRuntimeClient, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";
import { createAdminClient } from "@/lib/supabase/admin";

// Shared Bedrock client for Claude inference. All calls run in Sydney
// (ap-southeast-2) on the Australian (au.*) inference profile. Credentials
// come from the AWS SDK's default provider chain (Vercel OIDC federation
// assumes the vericlever-ai role in production; a local IAM user's access
// keys in .env.local for dev/scripts) - no static keys are ever passed here.
//
// Embeddings/search were also planned to move here (Amazon Titan Text
// Embeddings V2 - the only Bedrock model available in ap-southeast-2, Cohere
// Embed has no serverless listing in this region at all), but stayed on
// Voyage after testing: Titan missed retrieval on several real staff
// questions against this tenant's real corpus, including a safety-critical
// one ("What do I do if a child has an allergic reaction?" - the Anaphylaxis
// Management Policy never appeared in Titan's results even at the top 8
// chunks production actually retrieves, while Voyage found it correctly).
// See BUILD_LOG.md, 28 September 2026, and src/lib/ai/voyage.ts. The
// embedWithModel() function below is kept only for
// scripts/compare-embedding-models.ts, in case this is worth re-testing if
// AWS adds another embedding model to Sydney later - it is not used by any
// production code path.

const REGION = "ap-southeast-2";

let cachedAnthropicClient: AnthropicBedrock | null = null;
let cachedRuntimeClient: BedrockRuntimeClient | null = null;

function anthropicClient(): AnthropicBedrock {
  if (cachedAnthropicClient) return cachedAnthropicClient;
  cachedAnthropicClient = new AnthropicBedrock({ awsRegion: REGION });
  return cachedAnthropicClient;
}

function runtimeClient(): BedrockRuntimeClient {
  if (cachedRuntimeClient) return cachedRuntimeClient;
  cachedRuntimeClient = new BedrockRuntimeClient({ region: REGION });
  return cachedRuntimeClient;
}

// Startup guard - throws if the configured Claude model ID is not
// Australian-region. Called on process init (see instrumentation.ts) and
// before every model call.
export function validateAiSetup() {
  const claudeModel = process.env.AI_MODEL_FAST;
  if (!claudeModel || !claudeModel.startsWith("au.")) {
    throw new Error(
      `AI_MODEL_FAST ("${claudeModel}") must be an Australian (au.*) Bedrock inference profile.`
    );
  }
}

export type AiFeature = "qa" | "outcome_link" | "review_reason";

export async function generateText(opts: {
  systemPrompt: string;
  userMessage: string;
  maxTokens?: number;
  feature: AiFeature;
  organisationId: string;
  createdBy?: string;
}): Promise<string> {
  validateAiSetup();
  const modelId = process.env.AI_MODEL_FAST!;

  const message = await anthropicClient().messages.create({
    model: modelId,
    max_tokens: opts.maxTokens ?? 1024,
    system: opts.systemPrompt,
    messages: [{ role: "user", content: opts.userMessage }],
  });

  const block = message.content.find((b) => b.type === "text");
  const text = block && block.type === "text" ? block.text : "";

  await logAiCall({
    organisationId: opts.organisationId,
    feature: opts.feature,
    modelId,
    inputTokens: message.usage.input_tokens,
    outputTokens: message.usage.output_tokens,
    createdBy: opts.createdBy,
  });

  return text;
}

// Not used by any production code path - see the header comment above.
// Kept for scripts/compare-embedding-models.ts to re-test a specific
// candidate model on demand.
export async function embedWithModel(
  modelId: string,
  text: string,
  inputType: "query" | "document",
): Promise<number[]> {
  const body = modelId.startsWith("amazon.titan")
    ? JSON.stringify({ inputText: text, dimensions: 1024 })
    : JSON.stringify({
        texts: [text],
        input_type: inputType === "query" ? "search_query" : "search_document",
      });

  const command = new InvokeModelCommand({
    modelId,
    contentType: "application/json",
    accept: "application/json",
    body,
  });

  const response = await runtimeClient().send(command);
  const responseBody = JSON.parse(new TextDecoder().decode(response.body));

  // Titan: { embedding: [...] }. Cohere: { embeddings: [[...]] }.
  if (Array.isArray(responseBody.embedding)) return responseBody.embedding;
  if (Array.isArray(responseBody.embeddings?.[0])) return responseBody.embeddings[0];

  throw new Error("Unrecognised embedding response shape from Bedrock");
}

async function logAiCall(opts: {
  organisationId: string;
  feature: AiFeature;
  modelId: string;
  inputTokens: number;
  outputTokens: number;
  createdBy?: string;
}) {
  const supabase = createAdminClient();
  const { error } = await supabase.from("ai_call_log").insert({
    organisation_id: opts.organisationId,
    feature: opts.feature,
    model_id: opts.modelId,
    input_tokens: opts.inputTokens,
    output_tokens: opts.outputTokens,
    created_by: opts.createdBy,
  });
  if (error) console.error("ai_call_log insert failed:", error);
}
