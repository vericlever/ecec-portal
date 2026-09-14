"use server";

import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

type Result = { ok: true } | { ok: false; error: string };

// Step 51. Records that this profile has accepted the given version of the
// platform notice. Deliberately no update/delete path - an acceptance is a
// point-in-time fact, same as a sign-off, and a new notice version is a new
// row rather than an edit to this one.
export async function acceptPlatformNotice(version: number): Promise<Result> {
  const me = await requireProfile();
  const supabase = createClient();

  const { data, error } = await supabase
    .from("platform_notice_acceptances")
    .insert({
      profile_id: me.id,
      organisation_id: me.organisation_id,
      notice_version: version,
    })
    .select("id");
  // Already accepted (unique profile_id+notice_version) is not an error from
  // the user's point of view - the outcome they want (accepted) is already true.
  if (error && !error.message.includes("duplicate key")) {
    return { ok: false, error: error.message };
  }
  if (!error && (!data || data.length === 0)) {
    return { ok: false, error: "That was not allowed." };
  }
  return { ok: true };
}
