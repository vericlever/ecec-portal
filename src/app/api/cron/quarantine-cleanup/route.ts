import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BUCKET = "outcome-quarantine";
const MAX_AGE_MS = 60 * 60 * 1000; // one hour, per Step 59 B5.7

// Same auth shape as the other cron routes - Vercel Cron calls this with an
// "Authorization: Bearer <CRON_SECRET>" header.
function authorised(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV !== "production";
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

// Backstop for an outcome upload that never reached save or cancel (closed
// tab, crash) - the app itself deletes the quarantine file on both of those
// paths already (src/app/admin/our-outcomes/actions.ts). Walks every
// organisation's folder in the bucket since Supabase Storage's list() is
// per-prefix, not global.
export async function GET(req: NextRequest) {
  if (!authorised(req)) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  const admin = createAdminClient();
  const cutoff = Date.now() - MAX_AGE_MS;

  const { data: orgFolders, error: listOrgsError } = await admin.storage.from(BUCKET).list("");
  if (listOrgsError) {
    return NextResponse.json({ error: listOrgsError.message }, { status: 500 });
  }

  let removed = 0;
  const errors: string[] = [];

  for (const folder of orgFolders ?? []) {
    if (!folder.name) continue;
    const { data: files, error: listFilesError } = await admin.storage.from(BUCKET).list(folder.name);
    if (listFilesError) {
      errors.push(`${folder.name}: ${listFilesError.message}`);
      continue;
    }
    const stale = (files ?? [])
      .filter((f) => f.created_at && new Date(f.created_at).getTime() < cutoff)
      .map((f) => `${folder.name}/${f.name}`);
    if (stale.length === 0) continue;

    const { error: removeError } = await admin.storage.from(BUCKET).remove(stale);
    if (removeError) {
      errors.push(`${folder.name}: ${removeError.message}`);
      continue;
    }
    removed += stale.length;
  }

  return NextResponse.json({ removed, errors });
}
