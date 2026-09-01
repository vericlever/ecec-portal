"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  parseImportFile,
  validateRow,
  type ImportContext,
  type ParsedWorker,
  type RawRecord,
} from "@/lib/nqaits-import";

export type ImportFormat = "csv" | "json";

export type PreviewRow = {
  line: number;
  email: string;
  name: string;
  status: "ok" | "error";
  messages: string[];
};

export type PreviewResult =
  | { ok: false; error: string }
  | { ok: true; rows: PreviewRow[]; validCount: number; errorCount: number };

export type ImportResultRow = {
  line: number;
  email: string;
  name: string;
  outcome: "created" | "rejected";
  tempPassword?: string;
  detail?: string;
};

export type RunResult =
  | { ok: false; error: string }
  | { ok: true; rows: ImportResultRow[]; createdCount: number; rejectedCount: number };

async function loadContext(): Promise<ImportContext> {
  const supabase = createClient();
  const [{ data: services }, { data: jobRoles }] = await Promise.all([
    supabase.from("services").select("id, name"),
    supabase.from("job_roles").select("id, name"),
  ]);
  return { services: services ?? [], jobRoles: jobRoles ?? [] };
}

// Validate every row, and flag emails that repeat within the file.
function validateAll(records: RawRecord[], ctx: ImportContext) {
  const results = records.map((rec) => ({ rec, v: validateRow(rec, ctx) }));
  const willImport = new Map<string, number>();
  for (const { v } of results) {
    if (v.ok) willImport.set(v.email, (willImport.get(v.email) ?? 0) + 1);
  }
  return results.map(({ rec, v }) => {
    if (v.ok && (willImport.get(v.email) ?? 0) > 1) {
      return {
        rec,
        line: v.line,
        email: v.email,
        name: v.name,
        ok: false as const,
        errors: ["This email appears on more than one row in the file."],
      };
    }
    return v.ok
      ? { rec, line: v.line, email: v.email, name: v.name, ok: true as const, worker: v.worker, warnings: v.warnings }
      : { rec, line: v.line, email: v.email, name: v.name, ok: false as const, errors: v.errors };
  });
}

export async function previewImport(
  text: string,
  format: ImportFormat,
): Promise<PreviewResult> {
  await requireAdmin();

  const parsed = parseImportFile(text, format);
  if (!parsed.ok) return { ok: false, error: parsed.error };
  if (parsed.records.length === 0) {
    return { ok: false, error: "The file has a header row but no staff rows." };
  }

  const ctx = await loadContext();
  const rows: PreviewRow[] = validateAll(parsed.records, ctx).map((r) =>
    r.ok
      ? { line: r.line, email: r.email, name: r.name, status: "ok", messages: r.warnings }
      : { line: r.line, email: r.email, name: r.name, status: "error", messages: r.errors },
  );

  const errorCount = rows.filter((r) => r.status === "error").length;
  return { ok: true, rows, validCount: rows.length - errorCount, errorCount };
}

export async function runImport(
  text: string,
  format: ImportFormat,
): Promise<RunResult> {
  const me = await requireAdmin();
  if (!me.organisation_id) {
    return { ok: false, error: "Your account has no organisation." };
  }

  const parsed = parseImportFile(text, format);
  if (!parsed.ok) return { ok: false, error: parsed.error };

  const ctx = await loadContext();
  const validated = validateAll(parsed.records, ctx);
  const admin = createAdminClient();
  const org = me.organisation_id;
  const source = format === "json" ? "json" : "csv";

  const rows: ImportResultRow[] = [];

  for (const r of validated) {
    if (!r.ok) {
      await admin.from("staff_import_records").insert({
        organisation_id: org,
        source,
        raw_data: r.rec.values,
        status: "rejected",
        error_detail: r.errors.join("; "),
      });
      rows.push({
        line: r.line,
        email: r.email,
        name: r.name,
        outcome: "rejected",
        detail: r.errors.join("; "),
      });
      continue;
    }

    const result = await importOne(admin, org, r.worker);
    await admin.from("staff_import_records").insert({
      organisation_id: org,
      source,
      raw_data: r.rec.values,
      matched_user_id: result.ok ? result.userId : null,
      status: result.ok ? "imported" : "rejected",
      error_detail: result.ok ? result.problems.join("; ") || null : result.error,
    });

    if (result.ok) {
      rows.push({
        line: r.line,
        email: r.email,
        name: r.name,
        outcome: "created",
        tempPassword: result.tempPassword,
        detail: result.problems.join("; ") || undefined,
      });
    } else {
      rows.push({
        line: r.line,
        email: r.email,
        name: r.name,
        outcome: "rejected",
        detail: result.error,
      });
    }
  }

  revalidatePath("/admin/staff");

  const createdCount = rows.filter((r) => r.outcome === "created").length;
  return {
    ok: true,
    rows,
    createdCount,
    rejectedCount: rows.length - createdCount,
  };
}

type OneResult =
  | { ok: true; userId: string; tempPassword: string; problems: string[] }
  | { ok: false; error: string };

async function importOne(
  admin: ReturnType<typeof createAdminClient>,
  org: string,
  w: ParsedWorker,
): Promise<OneResult> {
  const tempPassword = "vc-" + randomBytes(6).toString("base64url");

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email: w.email,
    password: tempPassword,
    email_confirm: true,
  });
  if (createErr || !created?.user) {
    const msg = createErr?.message ?? "Could not create the account.";
    return {
      ok: false,
      error: msg.includes("already been registered")
        ? "An account with that email already exists (bulk import is for new people only)."
        : msg,
    };
  }
  const userId = created.user.id;

  const { error: profileErr } = await admin.from("profiles").insert({
    id: userId,
    organisation_id: org,
    service_id: w.service_id,
    job_role_id: w.job_role_id,
    full_name: w.full_name,
    email: w.email,
    access_tier: w.access_tier,
    is_active: true,
  });
  if (profileErr) {
    await admin.auth.admin.deleteUser(userId);
    return { ok: false, error: profileErr.message };
  }

  // Everything past this point is data on an account that now exists. A failure
  // here is captured as a problem note, not a rejection - the admin can fill the
  // gap from the staff record rather than re-create the account.
  const problems: string[] = [];

  const { error: wdErr } = await admin.from("worker_details").insert({
    profile_id: userId,
    organisation_id: org,
    ...w.worker_details,
    onboarding_completed_at: w.onboarding_complete
      ? new Date().toISOString()
      : null,
  });
  if (wdErr) problems.push(`worker details: ${wdErr.message}`);

  if (w.wwcc) {
    const { error } = await admin.from("wwcc_checks").insert({
      profile_id: userId,
      organisation_id: org,
      check_number: w.wwcc.check_number,
      expiry_date: w.wwcc.expiry_date,
      state_of_issue: w.wwcc.state_of_issue,
      sighted_at: w.wwcc.sighted_at,
      sighted_by: w.wwcc.sighted_by,
    });
    if (error) problems.push(`WWCC: ${error.message}`);
  }

  if (w.teacher) {
    const { error } = await admin.from("teacher_registrations").insert({
      profile_id: userId,
      organisation_id: org,
      check_number: w.teacher.check_number,
      expiry_date: w.teacher.expiry_date,
      state_of_issue: w.teacher.state_of_issue,
      sighted_at: w.teacher.sighted_at,
      sighted_by: w.teacher.sighted_by,
    });
    if (error) problems.push(`teacher registration: ${error.message}`);
  }

  if (w.qualification) {
    const { error } = await admin.from("qualifications").insert({
      profile_id: userId,
      organisation_id: org,
      qualification_type: w.qualification.qualification_type,
      rto_name: w.qualification.rto_name,
      rto_number: w.qualification.rto_number,
      course_code: w.qualification.course_code,
      working_towards: w.qualification.working_towards,
      date_attained: w.qualification.date_attained,
      date_commenced: w.qualification.date_commenced,
      sighted_at: w.qualification.sighted_at,
      sighted_by: w.qualification.sighted_by,
    });
    if (error) problems.push(`qualification: ${error.message}`);
  }

  for (const t of w.training) {
    const { error } = await admin.from("training_records").insert({
      profile_id: userId,
      organisation_id: org,
      training_type: t.training_type,
      other_description: t.other_description,
      rto_name: t.rto_name,
      rto_number: t.rto_number,
      course_code: t.course_code,
      date_attained: t.date_attained,
      expiry_date: t.expiry_date,
      sighted_at: t.sighted_at,
      sighted_by: t.sighted_by,
    });
    if (error) problems.push(`${t.training_type} training: ${error.message}`);
  }

  return { ok: true, userId, tempPassword, problems };
}
