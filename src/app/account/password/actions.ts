"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isManager } from "@/lib/roles";

export type SetPasswordState = { error: string | null };

export async function setPassword(
  _prev: SetPasswordState,
  formData: FormData,
): Promise<SetPasswordState> {
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (password.length < 10) {
    return { error: "Use at least 10 characters." };
  }
  if (password !== confirm) {
    return { error: "The two passwords do not match." };
  }

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "Your link has expired. Ask your administrator for a new one." };
  }

  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: error.message };

  // Same leader/staff landing split as the login action and root page -
  // a leader who sets their password (first-login invite or a routine
  // change from /account/password) should still land on the overview, not
  // the staff worklist.
  const { data: profile } = await supabase
    .from("profiles")
    .select("access_tier, hr_manager")
    .eq("id", user.id)
    .maybeSingle();
  const leader =
    profile != null && (isManager(profile.access_tier) || profile.hr_manager);
  redirect(leader ? "/admin" : "/home");
}
