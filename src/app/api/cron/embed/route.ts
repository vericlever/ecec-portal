import { NextRequest, NextResponse } from "next/server";
import { runEmbeddingJobs } from "@/lib/ai/service";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Same auth shape as src/app/api/cron/reminders/route.ts - Vercel Cron
// calls this with an "Authorization: Bearer <CRON_SECRET>" header. Without
// CRON_SECRET set the endpoint only answers in development, so a missing
// secret fails closed in production rather than leaving the job open.
function authorised(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV !== "production";
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(req: NextRequest) {
  if (!authorised(req)) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }
  const dryRun = req.nextUrl.searchParams.get("dryRun") === "1";
  try {
    const result = await runEmbeddingJobs({ dryRun });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Run failed" },
      { status: 500 },
    );
  }
}
