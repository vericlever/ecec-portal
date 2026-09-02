"use server";

import { revalidatePath } from "next/cache";
import { getProfile, isManager } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

type Result = { ok: true } | { ok: false; error: string };

export async function countersignSop(signOffId: string): Promise<Result> {
  const me = await getProfile();
  if (!me || !isManager(me.access_tier)) {
    return { ok: false, error: "Only a manager can countersign." };
  }

  const supabase = createClient();
  const { data: row } = await supabase
    .from("sign_offs")
    .select("id, user_id, sop_id, verified_at")
    .eq("id", signOffId)
    .maybeSingle();
  if (!row) return { ok: false, error: "Sign-off not found." };
  if (row.user_id === me.id) {
    return { ok: false, error: "You cannot countersign your own sign-off." };
  }
  if (row.verified_at) return { ok: true };

  const { data: sop } = await supabase
    .from("sops")
    .select("signoff_type")
    .eq("id", row.sop_id)
    .maybeSingle();
  if (sop?.signoff_type !== "self_and_manager") {
    return { ok: false, error: "This SOP does not need a manager countersign." };
  }

  const { error } = await supabase
    .from("sign_offs")
    .update({ verified_by: me.id, verified_at: new Date().toISOString() })
    .eq("id", signOffId);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/countersign");
  revalidatePath("/admin/staff", "layout");
  return { ok: true };
}
