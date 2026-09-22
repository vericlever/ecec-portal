import Anthropic from "@anthropic-ai/sdk";

// Chat/completion calls for the shared ai-service. Model per task type comes
// from an env var, never hardcoded, so Q&A and a future task (the procedure
// generator) can run different models without a code fork - the spec's own
// requirement.

let cachedClient: Anthropic | null = null;

function client(): Anthropic {
  if (cachedClient) return cachedClient;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");
  cachedClient = new Anthropic({ apiKey });
  return cachedClient;
}

// Current as at this feature's build date (September 2026) - confirm before
// relying on this long-term, model strings and pricing both change.
const DEFAULT_QA_MODEL = "claude-haiku-4-5-20251001";

export type TaskType = "qa";

const MODEL_ENV_VAR: Record<TaskType, string> = {
  qa: "AI_QA_MODEL",
};

const MODEL_DEFAULT: Record<TaskType, string> = {
  qa: DEFAULT_QA_MODEL,
};

function modelFor(taskType: TaskType): string {
  return process.env[MODEL_ENV_VAR[taskType]] || MODEL_DEFAULT[taskType];
}

export async function generate(opts: {
  taskType: TaskType;
  systemPrompt: string;
  userMessage: string;
  maxTokens?: number;
}): Promise<string> {
  const message = await client().messages.create({
    model: modelFor(opts.taskType),
    max_tokens: opts.maxTokens ?? 1024,
    system: opts.systemPrompt,
    messages: [{ role: "user", content: opts.userMessage }],
  });
  const block = message.content.find((b) => b.type === "text");
  return block && block.type === "text" ? block.text : "";
}
