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
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { error: "That email and password did not match." };
  }

  // Leaders land on the overview; everyone else on their SOPs.
  const { data: profile } = await supabase
    .from("profiles")
    .select("access_tier, hr_manager")
    .maybeSingle();
  const leader =
    profile != null &&
    (["manager_staff", "manager_policy", "admin"].includes(
      profile.access_tier,
    ) ||
      profile.hr_manager);
  redirect(leader ? "/admin" : "/sops");
}
