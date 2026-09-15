"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  normaliseParentCode,
  parentAccessCookieName,
  signParentToken,
} from "@/lib/parent-access";

// Runs with no signed-in caller at all - this whole page is public - so it
// uses the service-role client throughout, not the caller's RLS-scoped one.
// See src/lib/parent-access.ts for why this isn't built on anon-role RLS.
export async function verifyParentCode(serviceId: string, formData: FormData) {
  const input = String(formData.get("code") ?? "");
  const admin = createAdminClient();
  const { data: access } = await admin
    .from("service_parent_access")
    .select("code")
    .eq("service_id", serviceId)
    .maybeSingle();

  if (access && normaliseParentCode(input) === access.code) {
    const token = signParentToken(serviceId, access.code);
    cookies().set(parentAccessCookieName(serviceId), token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: `/parent/${serviceId}`,
      maxAge: 60 * 60 * 24 * 180, // 180 days - a parent shouldn't need to
      // re-enter this often, and resetting the code (Admin only) invalidates
      // every existing cookie immediately regardless of this expiry.
    });
    redirect(`/parent/${serviceId}`);
  }

  redirect(`/parent/${serviceId}?error=1`);
}
