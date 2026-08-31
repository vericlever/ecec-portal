"use server";

import { revalidatePath } from "next/cache";
import { randomBytes } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { getProfile, isAdmin, isManager, type AccessTier } from "@/lib/auth";

export type CreateStaffState =
  | { status: "idle" }
  | { status: "error"; error: string }
  | { status: "created"; email: string; tempPassword: string };

const TIERS: AccessTier[] = ["staff", "manager_staff", "manager_policy", "admin"];

function tempPassword(): string {
  return "vc-" + randomBytes(6).toString("base64url");
}

export async function createStaff(
  _prev: CreateStaffState,
  formData: FormData,
): Promise<CreateStaffState> {
  const me = await getProfile();
  if (!me || !isManager(me.access_tier) || !me.organisation_id) {
    return { status: "error", error: "You are not allowed to add staff." };
  }

  const fullName = String(formData.get("full_name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const tierInput = String(formData.get("access_tier") ?? "staff") as AccessTier;
  const jobRoleId = String(formData.get("job_role_id") ?? "").trim() || null;
  const serviceInput = String(formData.get("service_id") ?? "").trim() || null;

  if (!fullName || !email) {
    return { status: "error", error: "Name and email are required." };
  }

  // An admin may create any tier. A manager may only create staff-tier accounts,
  // and only in their own service.
  const accessTier: AccessTier = isAdmin(me.access_tier)
    ? TIERS.includes(tierInput)
      ? tierInput
      : "staff"
    : "staff";
  const serviceId = isAdmin(me.access_tier) ? serviceInput : me.service_id;

  const admin = createAdminClient();

  if (serviceId) {
    const { data: service } = await admin
      .from("services")
      .select("id")
      .eq("id", serviceId)
      .eq("organisation_id", me.organisation_id)
      .maybeSingle();
    if (!service) {
      return { status: "error", error: "That service is not in your organisation." };
    }
  }

  if (jobRoleId) {
    const { data: role } = await admin
      .from("job_roles")
      .select("id")
      .eq("id", jobRoleId)
      .eq("organisation_id", me.organisation_id)
      .maybeSingle();
    if (!role) {
      return { status: "error", error: "That job role is not in your organisation." };
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

  // organisation_id comes from the caller's own profile, never the form.
  const { error: profileErr } = await admin.from("profiles").insert({
    id: created.user.id,
    organisation_id: me.organisation_id,
    service_id: serviceId,
    job_role_id: jobRoleId,
    full_name: fullName,
    email,
    access_tier: accessTier,
    is_active: true,
  });

  if (profileErr) {
    await admin.auth.admin.deleteUser(created.user.id);
    return { status: "error", error: profileErr.message };
  }

  revalidatePath("/admin/staff");
  return { status: "created", email, tempPassword: password };
}
