"use server";

import { revalidatePath } from "next/cache";
import {
  getProfile,
  requireContentEditor,
  isAdmin,
  isHrManager,
  canEditContent,
} from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

type Result = { ok: true; id?: string } | { ok: false; error: string };

async function ownedRole(id: string) {
  const me = await requireContentEditor();
  const supabase = createClient();
  const { data } = await supabase
    .from("job_roles")
    .select("id, organisation_id, name")
    .eq("id", id)
    .maybeSingle();
  if (!data || data.organisation_id !== me.organisation_id) return null;
  return { me, role: data };
}

export async function createJobRole(name: string): Promise<Result> {
  const me = await requireContentEditor();
  if (!me.organisation_id) return { ok: false, error: "No organisation." };
  const clean = name.trim();
  if (!clean) return { ok: false, error: "A name is required." };

  const db = createClient();
  const { data, error } = await db
    .from("job_roles")
    .insert({
      organisation_id: me.organisation_id,
      name: clean,
      is_placeholder: false,
    })
    .select("id")
    .single();
  if (error) {
    return {
      ok: false,
      error: error.message.includes("duplicate")
        ? "A job role with that name already exists."
        : error.message,
    };
  }
  revalidatePath("/admin/job-roles");
  return { ok: true, id: data.id };
}

export async function renameJobRole(id: string, name: string): Promise<Result> {
  const owned = await ownedRole(id);
  if (!owned) return { ok: false, error: "Job role not found." };
  const clean = name.trim();
  if (!clean) return { ok: false, error: "A name is required." };
  const db = createClient();
  const { error } = await db
    .from("job_roles")
    .update({ name: clean })
    .eq("id", id);
  if (error) {
    return {
      ok: false,
      error: error.message.includes("duplicate")
        ? "A job role with that name already exists."
        : error.message,
    };
  }
  revalidatePath("/admin/job-roles");
  revalidatePath(`/admin/job-roles/${id}`);
  return { ok: true };
}

export async function deleteJobRole(id: string): Promise<Result> {
  const owned = await ownedRole(id);
  if (!owned) return { ok: false, error: "Job role not found." };
  const db = createClient();
  const { count } = await db
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("job_role_id", id);
  if ((count ?? 0) > 0) {
    return {
      ok: false,
      error: `${count} staff member${count === 1 ? " is" : "s are"} assigned this role. Move them to another role first.`,
    };
  }
  const { error } = await db.from("job_roles").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/job-roles");
  return { ok: true };
}

export async function setSopInRole(
  roleId: string,
  sopId: string,
  attach: boolean,
): Promise<Result> {
  const owned = await ownedRole(roleId);
  if (!owned) return { ok: false, error: "Job role not found." };
  const db = createClient();

  if (attach) {
    const { data: sop } = await db
      .from("sops")
      .select("id, organisation_id")
      .eq("id", sopId)
      .maybeSingle();
    if (!sop || sop.organisation_id !== owned.role.organisation_id) {
      return { ok: false, error: "That procedure is not in your organisation." };
    }
    const { error } = await db.from("job_role_sops").insert({
      organisation_id: owned.role.organisation_id,
      job_role_id: roleId,
      sop_id: sopId,
    });
    if (error && !error.message.includes("duplicate")) {
      return { ok: false, error: error.message };
    }
  } else {
    const { error } = await db
      .from("job_role_sops")
      .delete()
      .eq("job_role_id", roleId)
      .eq("sop_id", sopId);
    if (error) return { ok: false, error: error.message };
  }

  await syncPlaceholder(db, roleId);
  revalidatePath(`/admin/job-roles/${roleId}`);
  revalidatePath("/admin/job-roles");
  revalidatePath("/admin/sops");
  return { ok: true };
}

// Assign a staff member to this role (moving them off whatever role they had),
// or remove them from it (leaving them with no job role). Admin, a content
// editor, or an HR manager for staff at their own service.
async function canAssignRoles(personServiceId: string | null) {
  const me = await getProfile();
  if (!me) return null;
  const ok =
    isAdmin(me.access_tier) ||
    canEditContent(me.access_tier) ||
    (isHrManager(me) && personServiceId === me.service_id);
  return ok ? me : null;
}

export async function assignStaffToRole(
  roleId: string,
  profileId: string,
): Promise<Result> {
  const db = createClient();
  const [{ data: role }, { data: person }] = await Promise.all([
    db.from("job_roles").select("id, organisation_id").eq("id", roleId).maybeSingle(),
    db
      .from("profiles")
      .select("id, organisation_id, service_id")
      .eq("id", profileId)
      .maybeSingle(),
  ]);
  if (!role || !person || role.organisation_id !== person.organisation_id) {
    return { ok: false, error: "Not found." };
  }
  const me = await canAssignRoles(person.service_id as string | null);
  if (!me || me.organisation_id !== role.organisation_id) {
    return { ok: false, error: "You cannot assign staff to this role." };
  }

  const { error } = await db
    .from("profiles")
    .update({ job_role_id: roleId })
    .eq("id", profileId);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/admin/job-roles/${roleId}`);
  revalidatePath("/admin/staff", "layout");
  revalidatePath("/sops");
  return { ok: true };
}

export async function removeStaffFromRole(
  roleId: string,
  profileId: string,
): Promise<Result> {
  const db = createClient();
  const { data: person } = await db
    .from("profiles")
    .select("id, organisation_id, service_id, job_role_id")
    .eq("id", profileId)
    .maybeSingle();
  if (!person || person.job_role_id !== roleId) {
    return { ok: false, error: "That person is not in this role." };
  }
  const me = await canAssignRoles(person.service_id as string | null);
  if (!me || me.organisation_id !== person.organisation_id) {
    return { ok: false, error: "You cannot change this person's role." };
  }

  const { error } = await db
    .from("profiles")
    .update({ job_role_id: null })
    .eq("id", profileId);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/admin/job-roles/${roleId}`);
  revalidatePath("/admin/staff", "layout");
  revalidatePath("/sops");
  return { ok: true };
}

async function syncPlaceholder(
  db: ReturnType<typeof createClient>,
  roleId: string,
) {
  const { count } = await db
    .from("job_role_sops")
    .select("sop_id", { count: "exact", head: true })
    .eq("job_role_id", roleId);
  await db
    .from("job_roles")
    .update({ is_placeholder: (count ?? 0) === 0 })
    .eq("id", roleId);
}
