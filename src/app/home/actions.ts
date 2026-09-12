"use server";

import { revalidatePath } from "next/cache";
import { getProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { assignedJobRoleIds, sopSuiteIdsForRoles } from "@/lib/staff-job-roles";

type Result = { ok: true } | { ok: false; error: string };

// Flags one of the caller's own assigned procedures with a reflection on
// child outcomes, for a manager to see at the procedure's next review
// (build addendum, "My Outcomes" - feeds into the review cycle rather than
// standing as its own inbox). Anyone in the org may insert per RLS, but the
// app layer only ever offers procedures actually assigned to the caller.
export async function flagSopOutcome(sopId: string, reflection: string): Promise<Result> {
  const me = await getProfile();
  if (!me || !me.organisation_id) return { ok: false, error: "Sign in." };

  const text = reflection.trim();
  if (!text) return { ok: false, error: "Write a reflection before flagging." };
  if (text.length > 4000) return { ok: false, error: "Keep it under 4000 characters." };

  const roleIds = await assignedJobRoleIds(createClient(), me.id);
  const suiteIds = await sopSuiteIdsForRoles(createClient(), roleIds);
  if (!suiteIds.includes(sopId)) {
    return { ok: false, error: "That procedure is not assigned to you." };
  }

  const supabase = createClient();
  const { error } = await supabase.from("sop_outcome_flags").insert({
    organisation_id: me.organisation_id,
    sop_id: sopId,
    flagged_by: me.id,
    reflection: text,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/home");
  revalidatePath("/admin");
  return { ok: true };
}
