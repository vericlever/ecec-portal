"use server";

import { revalidatePath } from "next/cache";
import { getProfile, isAdmin, isHrManager } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

type Result = { ok: true } | { ok: false; error: string };

// A very long ban is Supabase Auth's mechanism for "revoke login" - there is
// no separate "disabled" flag on an auth user, banning is how GoTrue blocks
// every future sign-in and invalidates the ability to mint new sessions.
// ~100 years reads as permanent without relying on a magic "forever" string
// the API doesn't actually define.
const PERMANENT_BAN = "876000h";

// Mirrors profiles_write's with-check exactly (migration 0044): an admin can
// write any row in their org, but the can_verify()-only (hr_manager, non-admin)
// branch is only granted when the row's access_tier is 'staff'. Getting this
// gate looser than the RLS policy would mean an HR manager's edit to a
// manager-tier colleague comes back "saved" while the database silently wrote
// zero rows - the same silent-no-op failure countersignSop() had before its
// RLS-review fix.
async function canManageAccountFor(
  profileId: string,
): Promise<
  | { ok: true; me: NonNullable<Awaited<ReturnType<typeof getProfile>>>; organisationId: string; serviceId: string | null }
  | { ok: false; error: string }
> {
  const me = await getProfile();
  if (!me || !isHrManager(me)) {
    return { ok: false, error: "You are not allowed to manage this account." };
  }
  const supabase = createClient();
  const { data: target } = await supabase
    .from("profiles")
    .select("organisation_id, service_id, access_tier")
    .eq("id", profileId)
    .maybeSingle();
  if (!target || target.organisation_id !== me.organisation_id) {
    return { ok: false, error: "Staff member not found." };
  }
  if (!isAdmin(me.access_tier)) {
    if (target.service_id !== me.service_id) {
      return { ok: false, error: "That staff member is not at your service." };
    }
    if (target.access_tier !== "staff") {
      return {
        ok: false,
        error: "Only an admin can edit a manager's account.",
      };
    }
  }
  return {
    ok: true,
    me,
    organisationId: me.organisation_id as string,
    serviceId: target.service_id as string | null,
  };
}

// Admin anywhere in the organisation, or an HR manager for staff at their
// own service - the same reach as the rest of the account-management set.
export async function updateStaffName(
  profileId: string,
  fullName: string,
): Promise<Result> {
  const gate = await canManageAccountFor(profileId);
  if (!gate.ok) return gate;
  const name = fullName.trim();
  if (!name) return { ok: false, error: "A name is required." };

  const supabase = createClient();
  const { data, error } = await supabase
    .from("profiles")
    .update({ full_name: name })
    .eq("id", profileId)
    .select("id");
  if (error) return { ok: false, error: error.message };
  if (!data || data.length === 0) {
    return { ok: false, error: "That update was not allowed." };
  }

  revalidatePath("/admin/staff", "layout");
  return { ok: true };
}

// Straight overwrite, decided over re-verification (build addendum, item 1):
// the new address is live immediately, with no confirmation step on it - a
// mistyped address has no trail, which is the accepted trade-off for
// simplicity. auth.users.email and profiles.email are updated together so
// the login identity and the displayed address never drift apart.
export async function updateStaffEmail(
  profileId: string,
  email: string,
): Promise<Result> {
  const gate = await canManageAccountFor(profileId);
  if (!gate.ok) return gate;
  const clean = email.trim().toLowerCase();
  if (!clean || !clean.includes("@")) {
    return { ok: false, error: "Enter a valid email address." };
  }

  // auth.users has no RLS equivalent - updating the login identity is only
  // possible through the Auth admin API, same carve-out as account creation.
  const admin = createAdminClient();
  const { error: authError } = await admin.auth.admin.updateUserById(profileId, {
    email: clean,
    email_confirm: true,
  });
  if (authError) {
    return {
      ok: false,
      error: authError.message.includes("already been registered")
        ? "An account with that email already exists."
        : authError.message,
    };
  }

  const supabase = createClient();
  const { data, error } = await supabase
    .from("profiles")
    .update({ email: clean })
    .eq("id", profileId)
    .select("id");
  if (error) return { ok: false, error: error.message };
  if (!data || data.length === 0) {
    // auth.users has already been changed at this point - the profiles row
    // is the one place this can still fail (RLS blocked it), so surface it
    // rather than reporting success on a row that never wrote.
    return {
      ok: false,
      error: "The login email was updated but the staff record was not - that update was not allowed.",
    };
  }

  revalidatePath("/admin/staff", "layout");
  return { ok: true };
}

// Mark inactive revokes login immediately (decided over "list-position only"
// - build addendum, item 1's open question). Reactivate reverses both the
// flag and the ban, with no data loss either direction - nothing was
// deleted, matching the doc's "fully reversible" requirement.
export async function setStaffActive(
  profileId: string,
  active: boolean,
): Promise<Result> {
  const gate = await canManageAccountFor(profileId);
  if (!gate.ok) return gate;
  if (profileId === gate.me.id) {
    return { ok: false, error: "You cannot change your own active status." };
  }

  const supabase = createClient();

  if (!active) {
    // Deactivating the last active admin would lock the organisation out.
    const { data: target } = await supabase
      .from("profiles")
      .select("access_tier")
      .eq("id", profileId)
      .maybeSingle();
    if (target?.access_tier === "admin") {
      const { count } = await supabase
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("organisation_id", gate.organisationId)
        .eq("access_tier", "admin")
        .eq("is_active", true);
      if ((count ?? 0) <= 1) {
        return {
          ok: false,
          error: "This is the only active admin. Promote or activate someone else first.",
        };
      }
    }
  }

  const admin = createAdminClient();
  const { error: authError } = await admin.auth.admin.updateUserById(profileId, {
    ban_duration: active ? "none" : PERMANENT_BAN,
  });
  if (authError) return { ok: false, error: authError.message };

  const { data, error } = await supabase
    .from("profiles")
    .update({ is_active: active })
    .eq("id", profileId)
    .select("id");
  if (error) return { ok: false, error: error.message };
  if (!data || data.length === 0) {
    return {
      ok: false,
      error: "The login was changed but the staff record was not - that update was not allowed.",
    };
  }

  revalidatePath("/admin/staff", "layout");
  return { ok: true };
}

const DELETE_PHRASE = "permanently delete user";

// No other gate beyond the typed phrase, per spec - confirmed deletable even
// with linked sign-off, credential and contract history attached. That
// history cascades or is anonymised at the database level (see migration
// 0052 for the three columns that needed fixing to allow it), not decided
// here in application code.
export async function permanentlyDeleteStaff(
  profileId: string,
  typedPhrase: string,
): Promise<Result> {
  const me = await getProfile();
  if (!me || !isAdmin(me.access_tier)) {
    return { ok: false, error: "Only an admin can permanently delete an account." };
  }
  if (profileId === me.id) {
    return { ok: false, error: "You cannot delete your own account." };
  }
  if (typedPhrase.trim() !== DELETE_PHRASE) {
    return { ok: false, error: `Type "${DELETE_PHRASE}" exactly to confirm.` };
  }

  const supabase = createClient();
  const { data: target } = await supabase
    .from("profiles")
    .select("organisation_id, access_tier")
    .eq("id", profileId)
    .maybeSingle();
  if (!target || target.organisation_id !== me.organisation_id) {
    return { ok: false, error: "Staff member not found." };
  }
  if (target.access_tier === "admin") {
    const { count } = await supabase
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("organisation_id", me.organisation_id)
      .eq("access_tier", "admin");
    if ((count ?? 0) <= 1) {
      return { ok: false, error: "This is the only admin. Promote someone else first." };
    }
  }

  // Deleting the auth user is the one step with no RLS equivalent. The
  // profiles row (and everything that cascades from it - sign-offs,
  // credentials, contracts, identity documents, review history) is removed
  // by the FK cascade once the row itself is gone, via the caller's own
  // RLS-scoped client, not the service-role client.
  const admin = createAdminClient();
  const { error: authError } = await admin.auth.admin.deleteUser(profileId);
  if (authError) return { ok: false, error: authError.message };

  const { data, error } = await supabase
    .from("profiles")
    .delete()
    .eq("id", profileId)
    .select("id");
  if (error) return { ok: false, error: error.message };
  if (!data || data.length === 0) {
    return {
      ok: false,
      error: "The login was deleted but the staff record was not - that delete was not allowed.",
    };
  }

  revalidatePath("/admin/staff", "layout");
  return { ok: true };
}
