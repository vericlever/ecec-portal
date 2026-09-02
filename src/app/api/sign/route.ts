import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";

// Records that the signed-in user has read and signed the current version of a
// SOP. A plain endpoint rather than a server action, so the client keeps
// control of what happens next (show the confirmation, then move on).
// RLS restricts the user to SOPs in their own organisation and to writing
// their own sign-off. Idempotent per version.
export async function POST(request: Request) {
  const profile = await getProfile();
  if (!profile) {
    return NextResponse.json({ ok: false, error: "You are not signed in." }, { status: 401 });
  }

  let sopId: string | undefined;
  try {
    ({ sopId } = await request.json());
  } catch {
    return NextResponse.json({ ok: false, error: "Bad request." }, { status: 400 });
  }
  if (!sopId) {
    return NextResponse.json({ ok: false, error: "Missing SOP." }, { status: 400 });
  }

  const supabase = createClient();

  const { data: sop } = await supabase
    .from("sops")
    .select("id, published_version, organisation_id")
    .eq("id", sopId)
    .maybeSingle();

  if (!sop || sop.published_version == null) {
    return NextResponse.json({ ok: false, error: "SOP not found." }, { status: 404 });
  }

  const { error } = await supabase.from("sign_offs").insert({
    organisation_id: sop.organisation_id,
    service_id: profile.service_id,
    user_id: profile.id,
    sop_id: sop.id,
    sop_version: sop.published_version,
    comprehension_check_passed: null,
  });

  // 23505 = already signed this version. Treat as success.
  if (error && error.code !== "23505") {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
