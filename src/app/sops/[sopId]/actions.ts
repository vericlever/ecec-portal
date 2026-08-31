"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";

type SignResult = { ok: true } | { ok: false; error: string };

// Records that the signed-in user has read and signed the current version of a
// SOP. Idempotent per version. RLS ensures the user can only reach SOPs in
// their own organisation and can only write their own sign-off.
export async function signSop(sopId: string): Promise<SignResult> {
  const profile = await getProfile();
  if (!profile) return { ok: false, error: "You are not signed in." };

  const supabase = createClient();

  const { data: sop } = await supabase
    .from("sops")
    .select("id, current_version, organisation_id")
    .eq("id", sopId)
    .maybeSingle();

  if (!sop) return { ok: false, error: "SOP not found." };

  const { error } = await supabase.from("sign_offs").insert({
    organisation_id: sop.organisation_id,
    site_id: profile.site_id,
    user_id: profile.id,
    sop_id: sop.id,
    sop_version: sop.current_version,
    comprehension_check_passed: null,
  });

  // 23505 = already signed this version. Treat as success.
  if (error && error.code !== "23505") {
    return { ok: false, error: error.message };
  }

  revalidatePath("/sops");
  revalidatePath(`/sops/${sopId}`);
  return { ok: true };
}
