"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type LoginState = { error: string | null };

export async function login(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "Enter your email and password." };
  }

  const supabase = createClient();
  const { data: signInData, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error || !signInData.user) {
    return { error: "That email and password did not match." };
  }

  // Leaders land on the overview (unchanged); everyone else lands on the
  // orientation worklist (build addendum item 2), matching the same
  // leader/staff split as the root page.tsx redirect. This query MUST filter
  // to the signed-in user's own id: profiles_select also lets a manager or
  // admin see every profile at their reach, so an unfiltered .maybeSingle()
  // throws PGRST116 ("results contain N rows") for any leader and silently
  // resolves to a null profile - which is exactly why every leader used to
  // land on the staff destination instead of /admin, bug invisible for a
  // plain staff login since RLS only ever returns their own single row.
  const { data: profile } = await supabase
    .from("profiles")
    .select("access_tier, hr_manager")
    .eq("id", signInData.user.id)
    .maybeSingle();
  const leader =
    profile != null &&
    (["manager_staff", "manager_policy", "admin"].includes(
      profile.access_tier,
    ) ||
      profile.hr_manager);
  redirect(leader ? "/admin" : "/home");
}
