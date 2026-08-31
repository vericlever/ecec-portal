"use server";

import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase";
import {
  RSG_ORGANISATION_ID,
  DEV_USER_ID,
  DEV_USER_SITE_ID,
} from "@/lib/constants";

type SignResult = { ok: true } | { ok: false; error: string };

// Records that the hardcoded dev user has read and signed the current version of
// a SOP. Idempotent: signing again for the same version is a no-op.
export async function signSop(sopId: string): Promise<SignResult> {
  const supabase = createServiceClient();

  const { data: sop, error: sopError } = await supabase
    .from("sops")
    .select("id, current_version, organisation_id")
    .eq("id", sopId)
    .eq("organisation_id", RSG_ORGANISATION_ID)
    .single();

  if (sopError || !sop) {
    return { ok: false, error: "SOP not found." };
  }

  const { error: insertError } = await supabase.from("sign_offs").insert({
    organisation_id: sop.organisation_id,
    site_id: DEV_USER_SITE_ID,
    user_id: DEV_USER_ID,
    sop_id: sop.id,
    sop_version: sop.current_version,
    comprehension_check_passed: null,
  });

  // 23505 = unique violation: already signed this version. Treat as success.
  if (insertError && insertError.code !== "23505") {
    return { ok: false, error: insertError.message };
  }

  revalidatePath("/sops");
  revalidatePath(`/sops/${sopId}`);
  return { ok: true };
}
