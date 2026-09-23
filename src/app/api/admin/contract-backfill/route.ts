import { NextRequest, NextResponse } from "next/server";
import { getProfile, isAdmin } from "@/lib/auth";
import { runContractBackfill } from "@/lib/signing/backfill";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Step 57, A8. A one-off migration action, not a recurring job - gated by a
// real signed-in Admin session rather than CRON_SECRET, matching
// "Regenerate signed copy"'s own gate. Defaults to a dry run; a write only
// happens with the explicit ?apply=1, since this touches every already-
// signed contract in the tenant in one pass.
//
//   GET /api/admin/contract-backfill              (dry run)
//   GET /api/admin/contract-backfill?apply=1       (writes)
export async function GET(req: NextRequest) {
  const me = await getProfile();
  if (!me || !isAdmin(me.access_tier)) {
    return NextResponse.json({ error: "Admin only." }, { status: 403 });
  }
  const apply = req.nextUrl.searchParams.get("apply") === "1";
  try {
    const result = await runContractBackfill({ dryRun: !apply });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Backfill failed." },
      { status: 500 },
    );
  }
}
