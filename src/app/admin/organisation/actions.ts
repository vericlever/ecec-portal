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

// Matches the button's own label, case-insensitively (see
// record-controls.tsx's DeleteAccountControl - same phrase, same reasoning:
// a confirmation only works as a safeguard if it is trivial to copy
// correctly under stress).
const DELETE_PHRASE = "delete permanently";

function checkPhrase(typedPhrase: string): Result | null {
  if (typedPhrase.trim().toLowerCase() !== DELETE_PHRASE) {
    return { ok: false, error: `Type "${DELETE_PHRASE}" to confirm.` };
  }
  return null;
}

// Whole-library wipe, for when procedures or policies are being fully
// replaced rather than edited piece by piece - admin-only at the RLS layer
// too (migration 0066 split sops_delete/policies_delete out from the
// shared manager_policy-or-admin write policy), so this is a UX safety net
// on top of a real boundary, not a substitute for one. Everything cascades
// (job role links, sign-offs, history, reviews, outcome flags,
// comprehension questions/attempts) - confirmed against the FKs directly.
export async function bulkDeleteProcedures(typedPhrase: string): Promise<Result> {
  const phraseError = checkPhrase(typedPhrase);
  if (phraseError) return phraseError;
  const me = await requireAdmin();
  const supabase = createClient();

  const { error } = await supabase
    .from("sops")
    .delete()
    .eq("organisation_id", me.organisation_id as string);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/sops", "layout");
  revalidatePath("/sops", "layout");
  revalidatePath("/admin", "layout");
  return { ok: true };
}

export async function bulkDeletePolicies(typedPhrase: string): Promise<Result> {
  const phraseError = checkPhrase(typedPhrase);
  if (phraseError) return phraseError;
  const me = await requireAdmin();
  const supabase = createClient();

  const { error } = await supabase
    .from("policies")
    .delete()
    .eq("organisation_id", me.organisation_id as string);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/policies", "layout");
  revalidatePath("/policies", "layout");
  revalidatePath("/admin", "layout");
  return { ok: true };
}
