"use server";

import { revalidatePath } from "next/cache";
import { requireContentEditor } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { storeDocument, deleteDocument } from "@/lib/documents/store";
import { cleanReviewPeriod } from "@/lib/constants";
import { reviewDateFromNow } from "@/lib/sop-review";
import { writeDocumentTag } from "@/lib/document-tags";

type Result = { ok: true; id?: string } | { ok: false; error: string };

type SopEvent = "edit" | "period_change" | "review";

async function logSopEvent(
  admin: ReturnType<typeof createAdminClient>,
  opts: {
    organisationId: string;
    sopId: string;
    eventType: SopEvent;
    actorId: string;
    note?: string;
    detail?: Record<string, unknown>;
  },
) {
  await admin.from("sop_history").insert({
    organisation_id: opts.organisationId,
    sop_id: opts.sopId,
    event_type: opts.eventType,
    actor_profile_id: opts.actorId,
    note: opts.note ?? null,
    detail: opts.detail ?? null,
  });
}

const CATEGORIES = [
  "educator",
  "room_leader",
  "educational_leader",
  "director",
  "finance_admin",
];
const SIGNOFF_TYPES = ["self", "self_and_manager"];

async function ownedSop(id: string) {
  const me = await requireContentEditor();
  const supabase = createClient();
  const { data } = await supabase
    .from("sops")
    .select(
      "id, organisation_id, name, body, published_body, published_version, review_period_months, next_review_date",
    )
    .eq("id", id)
    .maybeSingle();
  if (!data || data.organisation_id !== me.organisation_id) return null;
  return { me, sop: data };
}

export async function createSop(input: {
  name: string;
  body: string;
  signoffType: string;
  category: string;
}): Promise<Result> {
  const me = await requireContentEditor();
  if (!me.organisation_id) return { ok: false, error: "No organisation." };
  const name = input.name.trim();
  if (!name) return { ok: false, error: "A name is required." };

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("sops")
    .insert({
      organisation_id: me.organisation_id,
      name,
      status: null,
      signoff_type: SIGNOFF_TYPES.includes(input.signoffType)
        ? input.signoffType
        : "self",
      target_tier: CATEGORIES.includes(input.category) ? input.category : null,
      body: input.body.trim() || null,
      updated_by: me.id,
    })
    .select("id")
    .single();

  if (error) {
    return {
      ok: false,
      error: error.message.includes("duplicate")
        ? "A SOP with that name already exists."
        : error.message,
    };
  }
  revalidatePath("/admin/sops");
  return { ok: true, id: data.id };
}

export async function updateSopMeta(
  id: string,
  input: {
    name: string;
    signoffType: string;
    category: string;
    priority: string;
    notes: string;
    serviceId: string | null;
  },
): Promise<Result> {
  const owned = await ownedSop(id);
  if (!owned) return { ok: false, error: "SOP not found." };
  const name = input.name.trim();
  if (!name) return { ok: false, error: "A name is required." };

  const priority = input.priority.trim() === "" ? null : Number(input.priority);
  if (priority != null && !Number.isFinite(priority)) {
    return { ok: false, error: "Priority must be a number." };
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("sops")
    .update({
      name,
      signoff_type: SIGNOFF_TYPES.includes(input.signoffType)
        ? input.signoffType
        : "self",
      target_tier: CATEGORIES.includes(input.category) ? input.category : null,
      priority,
      notes: input.notes.trim() || null,
      service_id: input.serviceId,
      updated_by: owned.me.id,
    })
    .eq("id", id);
  if (error) {
    return {
      ok: false,
      error: error.message.includes("duplicate")
        ? "A SOP with that name already exists."
        : error.message,
    };
  }
  revalidatePath("/admin/sops");
  revalidatePath(`/admin/sops/${id}`);
  return { ok: true };
}

// The per-SOP "suggested evidence" hint a manager sees at review time (Step 22).
export async function updateSopSuggestedEvidence(
  id: string,
  text: string,
): Promise<Result> {
  const owned = await ownedSop(id);
  if (!owned) return { ok: false, error: "SOP not found." };
  const admin = createAdminClient();
  const { error } = await admin
    .from("sops")
    .update({ suggested_evidence: text.trim() || null, updated_by: owned.me.id })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/admin/sops/${id}`);
  revalidatePath(`/admin/observations/${id}`);
  return { ok: true };
}

export async function updateSopBody(
  id: string,
  body: string,
  resetReviewClock = false,
): Promise<Result> {
  const owned = await ownedSop(id);
  if (!owned) return { ok: false, error: "SOP not found." };
  const admin = createAdminClient();

  const patch: Record<string, unknown> = {
    body: body.trim() || null,
    updated_by: owned.me.id,
  };
  const period = cleanReviewPeriod(owned.sop.review_period_months);
  let newDue: string | null = null;
  if (resetReviewClock) {
    newDue = reviewDateFromNow(period);
    patch.next_review_date = newDue;
  }

  const { error } = await admin.from("sops").update(patch).eq("id", id);
  if (error) return { ok: false, error: error.message };

  await logSopEvent(admin, {
    organisationId: owned.sop.organisation_id,
    sopId: id,
    eventType: "edit",
    actorId: owned.me.id,
    note: resetReviewClock
      ? `Content edited; review clock reset to ${newDue}`
      : "Content edited",
    detail: resetReviewClock
      ? {
          review_clock_reset: true,
          previous_due: owned.sop.next_review_date,
          new_due: newDue,
        }
      : { review_clock_reset: false },
  });

  revalidatePath(`/admin/sops/${id}`);
  revalidatePath("/admin/sops");
  return { ok: true };
}

// Save the review schedule: the cadence and the explicit next date. Any change
// to either writes one period_change event so the history shows the schedule
// moving.
export async function updateSopReview(
  id: string,
  input: { reviewPeriod: number; nextReviewDate: string },
): Promise<Result> {
  const owned = await ownedSop(id);
  if (!owned) return { ok: false, error: "SOP not found." };

  const period = cleanReviewPeriod(input.reviewPeriod);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(input.nextReviewDate)
    ? input.nextReviewDate
    : null;

  const prevPeriod = cleanReviewPeriod(owned.sop.review_period_months);
  const prevDate = (owned.sop.next_review_date as string | null) ?? null;
  if (period === prevPeriod && date === prevDate) return { ok: true };

  const admin = createAdminClient();
  const { error } = await admin
    .from("sops")
    .update({
      review_period_months: period,
      next_review_date: date,
      updated_by: owned.me.id,
    })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };

  const parts: string[] = [];
  if (period !== prevPeriod)
    parts.push(`cadence ${prevPeriod} → ${period} months`);
  if (date !== prevDate)
    parts.push(`next review ${prevDate ?? "unset"} → ${date ?? "unset"}`);

  await logSopEvent(admin, {
    organisationId: owned.sop.organisation_id,
    sopId: id,
    eventType: "period_change",
    actorId: owned.me.id,
    note: `Review schedule changed: ${parts.join(", ")}`,
    detail: {
      from_period: prevPeriod,
      to_period: period,
      from_date: prevDate,
      to_date: date,
    },
  });

  revalidatePath(`/admin/sops/${id}`);
  revalidatePath("/admin/sops");
  return { ok: true };
}

// Record that a review happened now: the next review date moves to the SOP's
// cadence from today, and a review event is logged.
export async function markSopReviewed(
  id: string,
  note?: string,
): Promise<Result> {
  const owned = await ownedSop(id);
  if (!owned) return { ok: false, error: "SOP not found." };

  const period = cleanReviewPeriod(owned.sop.review_period_months);
  const newDue = reviewDateFromNow(period);

  const admin = createAdminClient();
  const { error } = await admin
    .from("sops")
    // Recording a review also clears any needs-review flag a practice
    // observation raised (Step 21).
    .update({
      next_review_date: newDue,
      needs_review: false,
      updated_by: owned.me.id,
    })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };

  await logSopEvent(admin, {
    organisationId: owned.sop.organisation_id,
    sopId: id,
    eventType: "review",
    actorId: owned.me.id,
    note: note?.trim()
      ? `Reviewed. ${note.trim()}`
      : `Reviewed. Next review ${newDue}.`,
    detail: {
      previous_due: owned.sop.next_review_date,
      new_due: newDue,
      period_months: period,
    },
  });

  revalidatePath(`/admin/sops/${id}`);
  revalidatePath("/admin/sops");
  return { ok: true };
}

export async function publishSop(id: string): Promise<Result> {
  const owned = await ownedSop(id);
  if (!owned) return { ok: false, error: "SOP not found." };
  if (!owned.sop.body || !owned.sop.body.trim()) {
    return { ok: false, error: "Add the procedure text before publishing." };
  }
  const admin = createAdminClient();
  const next = (owned.sop.published_version ?? 0) + 1;
  const { error } = await admin
    .from("sops")
    .update({
      published_version: next,
      published_body: owned.sop.body,
      published_at: new Date().toISOString(),
      published_by: owned.me.id,
      current_version: next,
      // A fresh published version resolves any needs-review flag (Step 21).
      needs_review: false,
    })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/sops");
  revalidatePath(`/admin/sops/${id}`);
  revalidatePath("/sops");
  return { ok: true };
}

export async function unpublishSop(id: string): Promise<Result> {
  const owned = await ownedSop(id);
  if (!owned) return { ok: false, error: "SOP not found." };
  const admin = createAdminClient();
  const { error } = await admin
    .from("sops")
    .update({ published_version: null, published_at: null, published_body: null })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/sops");
  revalidatePath(`/admin/sops/${id}`);
  revalidatePath("/sops");
  return { ok: true };
}

export async function deleteSop(id: string): Promise<Result> {
  const owned = await ownedSop(id);
  if (!owned) return { ok: false, error: "SOP not found." };
  const admin = createAdminClient();
  const { data: docs } = await admin
    .from("documents")
    .select("id")
    .eq("owner_type", "sop")
    .eq("owner_id", id);
  for (const d of docs ?? []) await deleteDocument(d.id);
  const { error } = await admin.from("sops").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/sops");
  return { ok: true };
}

export async function uploadSopDocument(
  id: string,
  formData: FormData,
): Promise<Result> {
  const owned = await ownedSop(id);
  if (!owned) return { ok: false, error: "SOP not found." };
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Choose a file." };
  }

  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("documents")
    .select("id")
    .eq("owner_type", "sop")
    .eq("owner_id", id);
  for (const d of existing ?? []) await deleteDocument(d.id);

  const bytes = new Uint8Array(await file.arrayBuffer());
  const stored = await storeDocument({
    organisationId: owned.sop.organisation_id,
    ownerType: "sop",
    ownerId: id,
    fileName: file.name,
    mimeType: file.type || null,
    bytes,
    uploadedBy: owned.me.id,
  });
  if (!stored.ok) return { ok: false, error: stored.error };

  const patch: Record<string, unknown> = {
    source_document_id: stored.document.id,
    updated_by: owned.me.id,
  };
  if ((!owned.sop.body || !owned.sop.body.trim()) && stored.document.extracted_text) {
    patch.body = stored.document.extracted_text;
  }
  await admin.from("sops").update(patch).eq("id", id);

  revalidatePath(`/admin/sops/${id}`);
  return { ok: true };
}

export async function setJobRole(
  sopId: string,
  jobRoleId: string,
  attach: boolean,
): Promise<Result> {
  const owned = await ownedSop(sopId);
  if (!owned) return { ok: false, error: "SOP not found." };
  const admin = createAdminClient();

  if (attach) {
    const { data: role } = await admin
      .from("job_roles")
      .select("id, organisation_id")
      .eq("id", jobRoleId)
      .maybeSingle();
    if (!role || role.organisation_id !== owned.sop.organisation_id) {
      return { ok: false, error: "That job role is not in your organisation." };
    }
    const { error } = await admin.from("job_role_sops").insert({
      organisation_id: owned.sop.organisation_id,
      job_role_id: jobRoleId,
      sop_id: sopId,
    });
    if (error && !error.message.includes("duplicate")) {
      return { ok: false, error: error.message };
    }
  } else {
    const { error } = await admin
      .from("job_role_sops")
      .delete()
      .eq("sop_id", sopId)
      .eq("job_role_id", jobRoleId);
    if (error) return { ok: false, error: error.message };
  }

  const { count } = await admin
    .from("job_role_sops")
    .select("sop_id", { count: "exact", head: true })
    .eq("job_role_id", jobRoleId);
  await admin
    .from("job_roles")
    .update({ is_placeholder: (count ?? 0) === 0 })
    .eq("id", jobRoleId);

  revalidatePath(`/admin/sops/${sopId}`);
  revalidatePath("/admin/job-roles");
  return { ok: true };
}

// Quality area / child safe standard tags (Steps 28, 29). The picker toggles
// one tag at a time, matching the job-role and policy-category controls.
export async function setSopQualityArea(
  sopId: string,
  areaId: number,
  attach: boolean,
): Promise<Result> {
  const owned = await ownedSop(sopId);
  if (!owned) return { ok: false, error: "SOP not found." };
  const r = await writeDocumentTag({
    kind: "quality_area",
    documentType: "sop",
    documentId: sopId,
    organisationId: owned.sop.organisation_id,
    tagId: areaId,
    attach,
    actorId: owned.me.id,
  });
  if (!r.ok) return r;
  revalidatePath(`/admin/sops/${sopId}`);
  return { ok: true };
}

export async function setSopChildSafeStandard(
  sopId: string,
  standardId: number,
  attach: boolean,
): Promise<Result> {
  const owned = await ownedSop(sopId);
  if (!owned) return { ok: false, error: "SOP not found." };
  const r = await writeDocumentTag({
    kind: "child_safe_standard",
    documentType: "sop",
    documentId: sopId,
    organisationId: owned.sop.organisation_id,
    tagId: standardId,
    attach,
    actorId: owned.me.id,
  });
  if (!r.ok) return r;
  revalidatePath(`/admin/sops/${sopId}`);
  return { ok: true };
}

export type SopBulkOutcome = {
  fileName: string;
  sopName: string;
  sopId?: string;
  hasText?: boolean;
  outcome: "created" | "attached" | "error";
  detail?: string;
};

export async function bulkImportSops(
  formData: FormData,
): Promise<
  { ok: false; error: string } | { ok: true; outcomes: SopBulkOutcome[] }
> {
  const me = await requireContentEditor();
  if (!me.organisation_id) return { ok: false, error: "No organisation." };
  const files = formData.getAll("files").filter((f): f is File => f instanceof File);
  if (files.length === 0) return { ok: false, error: "No files." };

  // Defaults applied only to SOPs newly created by this upload, never to ones
  // that matched an existing entry.
  const newRoleIds = formData
    .getAll("newRoleIds")
    .map((v) => String(v))
    .filter(Boolean);
  const newSignoff = SIGNOFF_TYPES.includes(String(formData.get("newSignoffType")))
    ? String(formData.get("newSignoffType"))
    : "self";

  const admin = createAdminClient();

  // Validate the chosen roles belong to this org up front.
  let validRoleIds: string[] = [];
  if (newRoleIds.length) {
    const { data: roles } = await admin
      .from("job_roles")
      .select("id")
      .eq("organisation_id", me.organisation_id)
      .in("id", newRoleIds);
    validRoleIds = (roles ?? []).map((r) => r.id as string);
  }

  const outcomes: SopBulkOutcome[] = [];

  for (const file of files) {
    const sopName = file.name.replace(/\.[A-Za-z0-9]+$/, "").trim();
    try {
      const { data: existing } = await admin
        .from("sops")
        .select("id, body")
        .eq("organisation_id", me.organisation_id)
        .ilike("name", sopName)
        .maybeSingle();

      let sopId: string;
      let attached = false;
      if (existing) {
        sopId = existing.id;
        attached = true;
      } else {
        const { data: created, error } = await admin
          .from("sops")
          .insert({
            organisation_id: me.organisation_id,
            name: sopName,
            status: null,
            signoff_type: newSignoff,
            target_tier: null,
            updated_by: me.id,
          })
          .select("id")
          .single();
        if (error || !created) {
          outcomes.push({
            fileName: file.name,
            sopName,
            outcome: "error",
            detail: error?.message ?? "Could not create the SOP.",
          });
          continue;
        }
        sopId = created.id;

        // Attach the new SOP to the chosen job roles.
        for (const roleId of validRoleIds) {
          await admin.from("job_role_sops").insert({
            organisation_id: me.organisation_id,
            job_role_id: roleId,
            sop_id: sopId,
          });
        }
      }

      const bytes = new Uint8Array(await file.arrayBuffer());
      const stored = await storeDocument({
        organisationId: me.organisation_id,
        ownerType: "sop",
        ownerId: sopId,
        fileName: file.name,
        mimeType: file.type || null,
        bytes,
        uploadedBy: me.id,
      });
      if (!stored.ok) {
        outcomes.push({ fileName: file.name, sopName, outcome: "error", detail: stored.error });
        continue;
      }

      const patch: Record<string, unknown> = {
        source_document_id: stored.document.id,
        updated_by: me.id,
      };
      const currentBody = existing?.body as string | null | undefined;
      const hadBody = !!(currentBody && currentBody.trim());
      const gotText = !!(stored.document.extracted_text && stored.document.extracted_text.trim());
      if (!hadBody && gotText) {
        patch.body = stored.document.extracted_text;
      }
      await admin.from("sops").update(patch).eq("id", sopId);

      outcomes.push({
        fileName: file.name,
        sopName,
        sopId,
        hasText: hadBody || gotText,
        outcome: attached ? "attached" : "created",
        detail: stored.document.extraction_note ?? undefined,
      });
    } catch (e) {
      outcomes.push({
        fileName: file.name,
        sopName,
        outcome: "error",
        detail: e instanceof Error ? e.message : "Failed.",
      });
    }
  }

  // A role that just gained SOPs is no longer a placeholder.
  for (const roleId of validRoleIds) {
    const { count } = await admin
      .from("job_role_sops")
      .select("sop_id", { count: "exact", head: true })
      .eq("job_role_id", roleId);
    await admin
      .from("job_roles")
      .update({ is_placeholder: (count ?? 0) === 0 })
      .eq("id", roleId);
  }

  revalidatePath("/admin/sops");
  revalidatePath("/admin/job-roles");
  return { ok: true, outcomes };
}

// Page two of the bulk wizard. One call sets the job roles (which decide staff
// visibility), the review period and next review date, and the policy links for
// every uploaded SOP, then publishes the ones marked to publish that have text.
// A SOP with no text stays an unpublished draft.
export type SopBulkFinishItem = {
  sopId: string;
  jobRoleIds: string[];
  reviewPeriod: number;
  nextReviewDate: string;
  linkedPolicyIds: string[];
  publish: boolean;
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function finishBulkSops(
  items: SopBulkFinishItem[],
): Promise<
  | { ok: false; error: string }
  | {
      ok: true;
      published: number;
      drafted: number;
      failed: { name: string; error: string }[];
    }
> {
  const me = await requireContentEditor();
  if (!me.organisation_id) return { ok: false, error: "No organisation." };
  if (items.length === 0) return { ok: false, error: "Nothing to publish." };

  const admin = createAdminClient();
  const ids = items.map((i) => i.sopId);
  const { data: rows } = await admin
    .from("sops")
    .select("id, name, organisation_id, body, published_version")
    .in("id", ids);
  const byId = new Map((rows ?? []).map((r) => [r.id as string, r]));

  const { data: policies } = await admin
    .from("policies")
    .select("id")
    .eq("organisation_id", me.organisation_id);
  const validPolicy = new Set((policies ?? []).map((p) => p.id as string));

  const { data: roles } = await admin
    .from("job_roles")
    .select("id")
    .eq("organisation_id", me.organisation_id);
  const validRole = new Set((roles ?? []).map((r) => r.id as string));

  const { data: currentLinks } = await admin
    .from("job_role_sops")
    .select("sop_id, job_role_id")
    .in("sop_id", ids);
  const rolesBySop = new Map<string, Set<string>>();
  for (const l of currentLinks ?? []) {
    const set = rolesBySop.get(l.sop_id as string) ?? new Set<string>();
    set.add(l.job_role_id as string);
    rolesBySop.set(l.sop_id as string, set);
  }

  const touchedRoles = new Set<string>();
  let published = 0;
  let drafted = 0;
  const failed: { name: string; error: string }[] = [];

  for (const item of items) {
    const sop = byId.get(item.sopId);
    if (!sop || sop.organisation_id !== me.organisation_id) continue;

    const update: Record<string, unknown> = {
      review_period_months: cleanReviewPeriod(item.reviewPeriod),
      next_review_date: ISO_DATE.test(item.nextReviewDate)
        ? item.nextReviewDate
        : null,
      updated_by: me.id,
    };

    const hasBody = !!(sop.body && String(sop.body).trim());
    const doPublish = item.publish && hasBody;
    if (doPublish) {
      const next = ((sop.published_version as number | null) ?? 0) + 1;
      update.published_version = next;
      update.published_body = sop.body;
      update.published_at = new Date().toISOString();
      update.published_by = me.id;
      update.current_version = next;
    }

    const { error } = await admin
      .from("sops")
      .update(update)
      .eq("id", item.sopId);
    if (error) {
      failed.push({ name: sop.name as string, error: error.message });
      continue;
    }

    // Sync job role attachment to the choices on page two.
    const want = new Set(item.jobRoleIds.filter((r) => validRole.has(r)));
    const have = rolesBySop.get(item.sopId) ?? new Set<string>();
    for (const roleId of want) {
      if (!have.has(roleId)) {
        await admin.from("job_role_sops").insert({
          organisation_id: me.organisation_id,
          job_role_id: roleId,
          sop_id: item.sopId,
        });
        touchedRoles.add(roleId);
      }
    }
    for (const roleId of have) {
      if (!want.has(roleId)) {
        await admin
          .from("job_role_sops")
          .delete()
          .eq("sop_id", item.sopId)
          .eq("job_role_id", roleId);
        touchedRoles.add(roleId);
      }
    }

    for (const pid of item.linkedPolicyIds) {
      if (!validPolicy.has(pid)) continue;
      const { error: linkErr } = await admin.from("policy_sop_links").insert({
        organisation_id: me.organisation_id,
        policy_id: pid,
        sop_id: item.sopId,
      });
      if (linkErr && !linkErr.message.includes("duplicate")) {
        failed.push({ name: sop.name as string, error: linkErr.message });
      }
    }

    if (doPublish) published += 1;
    else drafted += 1;
  }

  // A role that gained or lost SOPs may no longer (or now) be a placeholder.
  for (const roleId of touchedRoles) {
    const { count } = await admin
      .from("job_role_sops")
      .select("sop_id", { count: "exact", head: true })
      .eq("job_role_id", roleId);
    await admin
      .from("job_roles")
      .update({ is_placeholder: (count ?? 0) === 0 })
      .eq("id", roleId);
  }

  revalidatePath("/admin/sops");
  revalidatePath("/admin/job-roles");
  revalidatePath("/admin/policies");
  revalidatePath("/sops");
  revalidatePath("/policies");
  return { ok: true, published, drafted, failed };
}
