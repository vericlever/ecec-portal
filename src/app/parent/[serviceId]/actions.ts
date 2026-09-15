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
      // Site-wide, not scoped to /parent/[serviceId] - the download route
      // lives at /api/parent-documents/[id], a different path, and a
      // cookie's path scoping controls which requests the browser attaches
      // it to at all. Scoping it to /parent/[serviceId] meant the list page
      // could read it but the download route never received it, so every
      // download silently 404'd. The cookie NAME (pp_<serviceId>) is still
      // what scopes it to one service - "/" here only controls which
      // requests carry it, not which service it grants access to.
      path: "/",
      maxAge: 60 * 60 * 24 * 180, // 180 days - a parent shouldn't need to
      // re-enter this often, and resetting the code (Admin only) invalidates
      // every existing cookie immediately regardless of this expiry.
    });
    redirect(`/parent/${serviceId}`);
  }

  redirect(`/parent/${serviceId}?error=1`);
}
