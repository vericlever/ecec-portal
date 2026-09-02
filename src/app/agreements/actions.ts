"use server";

import { revalidatePath } from "next/cache";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

type Result = { ok: true } | { ok: false; error: string };

// Sign the current published version of an agreement, for yourself. The insert
// is checked against hr_agreement_signoffs RLS (user_id must be you).
export async function signAgreement(agreementId: string): Promise<Result> {
  const me = await requireProfile();
  if (!me.organisation_id) return { ok: false, error: "No organisation." };
  const supabase = createClient();

  const { data: agreement } = await supabase
    .from("hr_agreements")
    .select("id, organisation_id, published_version, all_staff")
    .eq("id", agreementId)
    .maybeSingle();
  if (
    !agreement ||
    agreement.organisation_id !== me.organisation_id ||
    agreement.published_version == null
  ) {
    return { ok: false, error: "That agreement is not available to sign." };
  }

  // Confirm it applies to this person.
  let applies = agreement.all_staff;
  if (!applies && me.job_role_id) {
    const { data: link } = await supabase
      .from("hr_agreement_job_roles")
      .select("agreement_id")
      .eq("agreement_id", agreementId)
      .eq("job_role_id", me.job_role_id)
      .maybeSingle();
    applies = Boolean(link);
  }
  if (!applies) {
    return { ok: false, error: "This agreement does not apply to you." };
  }

  const { error } = await supabase.from("hr_agreement_signoffs").insert({
    organisation_id: me.organisation_id,
    agreement_id: agreementId,
    user_id: me.id,
    service_id: me.service_id,
    agreement_version: agreement.published_version,
  });
  if (error && !error.message.includes("duplicate")) {
    return { ok: false, error: error.message };
  }

  revalidatePath("/agreements");
  revalidatePath(`/agreements/${agreementId}`);
  revalidatePath("/admin/staff", "layout");
  return { ok: true };
}
