"use server";

import { revalidatePath } from "next/cache";
import { randomBytes } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { getProfile, isAdmin } from "@/lib/auth";

export type CreateStaffState =
  | { status: "idle" }
  | { status: "error"; error: string }
  | { status: "created"; email: string; tempPassword: string };

function tempPassword(): string {
  // Readable-ish temporary password, replaced by the staff member on first use.
  return "rsg-" + randomBytes(6).toString("base64url");
}

export async function createStaff(
  _prev: CreateStaffState,
  formData: FormData,
): Promise<CreateStaffState> {
  const me = await getProfile();
  if (!me || !isAdmin(me.role) || !me.organisation_id) {
    return { status: "error", error: "You are not allowed to add staff." };
  }

  const fullName = String(formData.get("full_name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const roleInput = String(formData.get("role") ?? "educator");
  const siteId = String(formData.get("site_id") ?? "").trim() || null;

  if (!fullName || !email) {
    return { status: "error", error: "Name and email are required." };
  }
  // Admins may create educators and centre directors, not other admins.
  const role = roleInput === "centre_director" ? "centre_director" : "educator";

  const admin = createAdminClient();

  // The site, if given, must belong to this admin's organisation.
  if (siteId) {
    const { data: site } = await admin
      .from("sites")
      .select("id")
      .eq("id", siteId)
      .eq("organisation_id", me.organisation_id)
      .maybeSingle();
    if (!site) {
      return { status: "error", error: "That site is not in your organisation." };
    }
  }

  const password = tempPassword();

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (createErr || !created?.user) {
    const msg = createErr?.message ?? "Could not create the account.";
    return {
      status: "error",
      error: msg.includes("already been registered")
        ? "An account with that email already exists."
        : msg,
    };
  }

  // organisation_id comes from the admin's own profile, never from the form,
  // so an admin can only ever add staff to their own organisation.
  const { error: profileErr } = await admin.from("profiles").insert({
    id: created.user.id,
    organisation_id: me.organisation_id,
    site_id: siteId,
    full_name: fullName,
    email,
    role,
    is_active: true,
  });

  if (profileErr) {
    await admin.auth.admin.deleteUser(created.user.id);
    return { status: "error", error: profileErr.message };
  }

  revalidatePath("/admin/staff");
  return { status: "created", email, tempPassword: password };
}
