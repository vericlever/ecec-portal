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
  let attemptId: string | undefined;
  try {
    ({ sopId, attemptId } = await request.json());
  } catch {
    return NextResponse.json({ ok: false, error: "Bad request." }, { status: 400 });
  }
  if (!sopId) {
    return NextResponse.json({ ok: false, error: "Missing procedure." }, { status: 400 });
  }

  const supabase = createClient();

  const { data: sop } = await supabase
    .from("sops")
    .select("id, published_version, organisation_id")
    .eq("id", sopId)
    .maybeSingle();

  if (!sop || sop.published_version == null) {
    return NextResponse.json({ ok: false, error: "Procedure not found." }, { status: 404 });
  }

  // Step 46: signing is the last act. If this procedure has any
  // comprehension questions, a passing attempt (this user, this procedure)
  // is required before the sign-off is recorded - "read, passed, signed",
  // not just a checkbox.
  const { count: questionCount } = await supabase
    .from("comprehension_questions")
    .select("id", { count: "exact", head: true })
    .eq("sop_id", sopId);
  let comprehensionCheckPassed: boolean | null = null;
  if ((questionCount ?? 0) > 0) {
    if (!attemptId) {
      return NextResponse.json(
        { ok: false, error: "Pass the comprehension check before signing." },
        { status: 400 },
      );
    }
    const { data: attempt } = await supabase
      .from("comprehension_attempts")
      .select("id, passed, profile_id, sop_id")
      .eq("id", attemptId)
      .maybeSingle();
    if (
      !attempt ||
      attempt.profile_id !== profile.id ||
      attempt.sop_id !== sopId ||
      !attempt.passed
    ) {
      return NextResponse.json(
        { ok: false, error: "That attempt is not a valid pass for this procedure." },
        { status: 400 },
      );
    }
    comprehensionCheckPassed = true;
  }

  const { error } = await supabase.from("sign_offs").insert({
    organisation_id: sop.organisation_id,
    service_id: profile.service_id,
    user_id: profile.id,
    sop_id: sop.id,
    sop_version: sop.published_version,
    comprehension_check_passed: comprehensionCheckPassed,
    comprehension_attempt_id: (questionCount ?? 0) > 0 ? attemptId : null,
  });

  // 23505 = already signed this version. Treat as success.
  if (error && error.code !== "23505") {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
