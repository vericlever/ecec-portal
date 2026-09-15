"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { generateParentCode, normaliseParentCode } from "@/lib/parent-access";

// Setting or generating a code is Admin only (Zeke's explicit instruction -
// Managers may view a service's code, only Admin may change it). Both use the
// caller's own RLS-scoped client, not the service-role client: the real
// enforcement is service_parent_access_write's is_admin(organisation_id)
// check (migration 0067), requireAdmin() here is just the friendly redirect
// for the case where this ever got called without the button being hidden.

async function upsertCode(serviceId: string, code: string) {
  const me = await requireAdmin();
  const supabase = createClient();
  const { error } = await supabase.from("service_parent_access").upsert(
    {
      service_id: serviceId,
      organisation_id: me.organisation_id,
      code,
      updated_by: me.id,
    },
    { onConflict: "service_id" },
  );
  if (error) throw new Error(error.message);
  revalidatePath("/admin/parent-portal");
}

// A Director choosing their own memorable code (e.g. "timboonkids") is the
// normal path - this is a door code they hand out themselves, not a
// system-issued password. Stored uppercased so a parent typing it in mixed
// case still matches (see normaliseParentCode).
export async function setParentAccessCode(serviceId: string, formData: FormData) {
  const raw = normaliseParentCode(String(formData.get("code") ?? "")).replace(/\s+/g, "");
  if (raw.length < 4) {
    throw new Error("Code must be at least 4 characters.");
  }
  await upsertCode(serviceId, raw);
}

// A convenience for a Director who doesn't want to think one up.
export async function generateParentAccessCode(serviceId: string) {
  await upsertCode(serviceId, generateParentCode());
}
