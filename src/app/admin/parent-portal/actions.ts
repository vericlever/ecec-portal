"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { generateParentCode } from "@/lib/parent-access";

// Generating or resetting a code is Admin only (Zeke's explicit instruction -
// Managers may view a service's code, only Admin may change it). Uses the
// caller's own RLS-scoped client, not the service-role client: the real
// enforcement is service_parent_access_write's is_admin(organisation_id)
// check (migration 0067), requireAdmin() here is just the friendly redirect
// for the case where this ever got called without the button being hidden.
export async function generateParentAccessCode(serviceId: string) {
  const me = await requireAdmin();
  const supabase = createClient();
  const code = generateParentCode();

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
