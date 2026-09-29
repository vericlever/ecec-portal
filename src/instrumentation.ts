// Step 58, done-when #3: a deploy with a non-au. Claude model ID, or an
// embedding model outside the Sydney allow-list, fails at startup rather
// than on the first Q&A request. Runs once per server instance (Vercel
// serverless cold start), Node.js runtime only - the AWS SDK clients in
// src/lib/ai/client.ts don't run on the edge runtime.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { validateAiSetup } = await import("@/lib/ai/client");
    validateAiSetup();
  }
}
