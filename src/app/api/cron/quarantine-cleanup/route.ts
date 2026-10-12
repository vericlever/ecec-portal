import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sweepStaleQuarantineFiles } from "@/lib/outcome-quarantine";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Same auth shape as the other cron routes - Vercel Cron calls this with an
// "Authorization: Bearer <CRON_SECRET>" header.
function authorised(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV !== "production";
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

// Backstop for an outcome upload that never reached save or cancel (closed
// tab, crash) - the app itself deletes the quarantine file on both of those
// paths already (src/app/admin/our-outcomes/actions.ts), and also sweeps the
// organisation's folder whenever an upload starts. Runs daily because Vercel's
// Hobby plan allows nothing more frequent; see src/lib/outcome-quarantine.ts.
export async function GET(req: NextRequest) {
  if (!authorised(req)) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  const result = await sweepStaleQuarantineFiles(createAdminClient());
  return NextResponse.json(result, { status: result.errors.length > 0 && result.removed === 0 ? 500 : 200 });
}
