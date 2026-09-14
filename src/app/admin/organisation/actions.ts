"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

type Result = { ok: true } | { ok: false; error: string };

export async function updateOrganisationDisplayName(displayName: string): Promise<Result> {
  await requireAdmin();
  const supabase = createClient();

  const { error } = await supabase.rpc("set_organisation_display_name", {
    p_display_name: displayName,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/", "layout");
  return { ok: true };
}
