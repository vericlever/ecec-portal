import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail, emailEnabled, esc } from "@/lib/email";

// Step 19 reminder engine. Run once a day by the Vercel cron at
// /api/cron/reminders. Builds one digest per person (staff or manager) covering
// everything relevant to them, and sends it at most once per cadence window.
// notification_log is the send history that enforces the cadence.

type Admin = ReturnType<typeof createAdminClient>;

const CADENCE_DAYS = 7; // a person hears from us at most weekly
const CRED_WINDOW_DAYS = 60; // flag a credential this close to expiry, or past
const CONTRACT_WINDOW_DAYS = 28; // 4 weeks of contract-renewal run-up
const REVIEW_WINDOW_DAYS = 14; // flag a SOP or policy review this close, or past

export type ReminderRunResult = {
  emailConfigured: boolean;
  dryRun: boolean;
  staffDigests: number;
  managerDigests: number;
  skippedRecentlySent: number;
  nothingOutstanding: number;
  errors: string[];
  // In a dry run, the digests that would have gone out.
  preview?: {
    to: string;
    kind: string;
    subject: string;
    lines: string[];
  }[];
};

type Section = { heading: string; items: string[] };

type Digest = {
  organisationId: string;
  profileId: string;
  email: string;
  name: string;
  orgName: string;
  kind: "staff_digest" | "manager_digest";
  sections: Section[];
};

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function daysUntil(isoDate: string): number {
  const d = new Date(isoDate + (isoDate.length === 10 ? "T00:00:00" : ""));
  return Math.round((d.getTime() - startOfToday().getTime()) / 86_400_000);
}

function fmtDate(isoDate: string): string {
  const d = new Date(isoDate + (isoDate.length === 10 ? "T00:00:00" : ""));
  return d.toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function expiryPhrase(isoDate: string): string {
  const n = daysUntil(isoDate);
  if (n < 0) return `expired ${fmtDate(isoDate)}`;
  if (n === 0) return `expires today`;
  return `expires ${fmtDate(isoDate)} (${n} day${n === 1 ? "" : "s"})`;
}

// --- data gathering -------------------------------------------------------

type Person = {
  id: string;
  organisation_id: string | null;
  service_id: string | null;
  job_role_id: string | null;
  full_name: string;
  email: string;
  access_tier: string;
  hr_manager: boolean;
  is_active: boolean;
};

function isManager(t: string) {
  return t === "manager_staff" || t === "manager_policy" || t === "admin";
}
function isContentEditor(t: string) {
  return t === "manager_policy" || t === "admin";
}

export async function runReminders(opts?: {
  dryRun?: boolean;
}): Promise<ReminderRunResult> {
  const dryRun = opts?.dryRun ?? false;
  const admin = createAdminClient();
  const result: ReminderRunResult = {
    emailConfigured: emailEnabled(),
    dryRun,
    staffDigests: 0,
    managerDigests: 0,
    skippedRecentlySent: 0,
    nothingOutstanding: 0,
    errors: [],
    preview: dryRun ? [] : undefined,
  };

  const [
    { data: orgs },
    { data: profiles },
    { data: roleSops },
    { data: profileRoles },
    { data: pubSops },
    { data: pubPolicies },
    { data: signOffs },
    { data: policyViews },
    { data: worker },
    { data: wwcc },
    { data: teacher },
    { data: training },
    { data: contracts },
    { data: agreements },
    { data: agreementRoles },
    { data: agreementSignoffs },
    sightings,
  ] = await Promise.all([
    admin.from("organisations").select("id, name"),
    admin
      .from("profiles")
      .select(
        "id, organisation_id, service_id, job_role_id, full_name, email, access_tier, hr_manager, is_active",
      ),
    admin.from("job_role_sops").select("job_role_id, sop_id"),
    admin.from("profile_job_roles").select("profile_id, job_role_id"),
    admin
      .from("sops")
      .select("id, name, organisation_id, published_version, signoff_type, next_review_date")
      .not("published_version", "is", null),
    admin
      .from("policies")
      .select("id, name, organisation_id, service_id, published_version, next_review_date")
      .not("published_version", "is", null),
    admin.from("sign_offs").select("user_id, sop_id, sop_version, verified_at"),
    admin.from("policy_views").select("user_id, policy_id, policy_version"),
    admin
      .from("worker_details")
      .select("profile_id, onboarding_completed_at, visa_expiry"),
    admin.from("wwcc_checks").select("profile_id, expiry_date").not("expiry_date", "is", null),
    admin
      .from("teacher_registrations")
      .select("profile_id, expiry_date")
      .not("expiry_date", "is", null),
    admin
      .from("training_records")
      .select("profile_id, training_type, other_description, expiry_date")
      .not("expiry_date", "is", null),
    admin
      .from("contracts")
      .select("profile_id, expiry_date, period_type, signed_at")
      .is("superseded_at", null),
    admin
      .from("hr_agreements")
      .select("id, name, organisation_id, published_version, all_staff")
      .not("published_version", "is", null),
    admin.from("hr_agreement_job_roles").select("agreement_id, job_role_id"),
    admin.from("hr_agreement_signoffs").select("user_id, agreement_id, agreement_version"),
    gatherPendingSightings(admin),
  ]);

  const orgName = new Map((orgs ?? []).map((o) => [o.id as string, o.name as string]));
  const people = (profiles ?? []) as Person[];
  const peopleById = new Map(people.map((p) => [p.id, p]));

  // A person can hold more than one job role (build addendum, "My Training").
  // profile_job_roles is the source of truth for suite and agreement
  // targeting; profiles.job_role_id is just the kept-in-sync primary.
  const rolesByProfile = new Map<string, string[]>();
  for (const r of profileRoles ?? []) {
    const list = rolesByProfile.get(r.profile_id as string) ?? [];
    list.push(r.job_role_id as string);
    rolesByProfile.set(r.profile_id as string, list);
  }

  // suite (published SOP ids) per job role
  const pubSopById = new Map(
    (pubSops ?? []).map((s) => [
      s.id as string,
      {
        name: s.name as string,
        version: s.published_version as number,
        needsManager: s.signoff_type === "self_and_manager",
      },
    ]),
  );
  const suiteByRole = new Map<string, string[]>();
  for (const rs of roleSops ?? []) {
    if (!pubSopById.has(rs.sop_id as string)) continue;
    const list = suiteByRole.get(rs.job_role_id as string) ?? [];
    list.push(rs.sop_id as string);
    suiteByRole.set(rs.job_role_id as string, list);
  }

  // sign-off state per user: `${sopId}:${version}` -> verified?
  const signedByUser = new Map<string, Map<string, boolean>>();
  for (const s of signOffs ?? []) {
    const m = signedByUser.get(s.user_id as string) ?? new Map<string, boolean>();
    m.set(`${s.sop_id}:${s.sop_version}`, Boolean(s.verified_at));
    signedByUser.set(s.user_id as string, m);
  }

  const viewedByUser = new Map<string, Set<string>>();
  for (const v of policyViews ?? []) {
    const set = viewedByUser.get(v.user_id as string) ?? new Set<string>();
    set.add(`${v.policy_id}:${v.policy_version}`);
    viewedByUser.set(v.user_id as string, set);
  }

  const workerByProfile = new Map(
    (worker ?? []).map((w) => [w.profile_id as string, w]),
  );

  // latest expiry per person per credential kind
  type Cred = { label: string; expiry: string };
  const credsByProfile = new Map<string, Cred[]>();
  const noteCred = (pid: string, label: string, expiry: string | null) => {
    if (!expiry) return;
    const list = credsByProfile.get(pid) ?? [];
    const existing = list.find((c) => c.label === label);
    if (existing) {
      if (expiry > existing.expiry) existing.expiry = expiry;
    } else {
      list.push({ label, expiry });
    }
    credsByProfile.set(pid, list);
  };
  for (const r of wwcc ?? [])
    noteCred(r.profile_id as string, "Working with Children Check", r.expiry_date as string);
  for (const r of teacher ?? [])
    noteCred(r.profile_id as string, "Teacher registration", r.expiry_date as string);
  for (const r of training ?? [])
    noteCred(
      r.profile_id as string,
      trainingLabel(r.training_type as string, r.other_description as string | null),
      r.expiry_date as string,
    );
  for (const w of worker ?? [])
    noteCred(w.profile_id as string, "Visa / working rights", w.visa_expiry as string | null);

  // contracts per person
  const contractsByProfile = new Map<
    string,
    { expiry: string | null; fixed: boolean; signed: boolean }[]
  >();
  for (const c of contracts ?? []) {
    const list = contractsByProfile.get(c.profile_id as string) ?? [];
    list.push({
      expiry: (c.expiry_date as string | null) ?? null,
      fixed: c.period_type === "fixed",
      signed: Boolean(c.signed_at),
    });
    contractsByProfile.set(c.profile_id as string, list);
  }

  // agreements a person must sign
  const agreementRoleSet = new Map<string, Set<string>>();
  for (const r of agreementRoles ?? []) {
    const set = agreementRoleSet.get(r.agreement_id as string) ?? new Set<string>();
    set.add(r.job_role_id as string);
    agreementRoleSet.set(r.agreement_id as string, set);
  }
  const agreementSignedByUser = new Map<string, Set<string>>();
  for (const s of agreementSignoffs ?? []) {
    const set = agreementSignedByUser.get(s.user_id as string) ?? new Set<string>();
    set.add(`${s.agreement_id}:${s.agreement_version}`);
    agreementSignedByUser.set(s.user_id as string, set);
  }
  function unsignedAgreements(p: Person): string[] {
    const roleIds = rolesByProfile.get(p.id) ?? [];
    const out: string[] = [];
    for (const a of agreements ?? []) {
      if (a.organisation_id !== p.organisation_id) continue;
      const roles = agreementRoleSet.get(a.id as string);
      const applies = a.all_staff || (roles != null && roleIds.some((id) => roles.has(id)));
      if (!applies) continue;
      const signed = agreementSignedByUser
        .get(p.id)
        ?.has(`${a.id}:${a.published_version}`);
      if (!signed) out.push(a.name as string);
    }
    return out;
  }

  // --- staff digests ----------------------------------------------------

  const digests: Digest[] = [];

  for (const p of people) {
    if (!p.is_active || !p.organisation_id || !p.email) continue;
    const roleIds = rolesByProfile.get(p.id) ?? [];
    if (roleIds.length === 0) continue; // no suite yet, nothing to chase

    const sections: Section[] = [];

    // unsigned SOPs, unioned across every role this person holds
    const suite = Array.from(new Set(roleIds.flatMap((rid) => suiteByRole.get(rid) ?? [])));
    const signed = signedByUser.get(p.id) ?? new Map<string, boolean>();
    const unsignedSops = suite
      .filter((sopId) => {
        const s = pubSopById.get(sopId)!;
        const v = signed.get(`${sopId}:${s.version}`);
        if (v === undefined) return true;
        return s.needsManager ? !v : false;
      })
      .map((sopId) => pubSopById.get(sopId)!.name)
      .sort();
    if (unsignedSops.length) {
      sections.push({ heading: "Procedures to sign", items: unsignedSops });
    }

    // unviewed policies
    const expectedPolicies = (pubPolicies ?? []).filter(
      (pol) =>
        pol.organisation_id === p.organisation_id &&
        (pol.service_id == null || pol.service_id === p.service_id),
    );
    const viewed = viewedByUser.get(p.id) ?? new Set<string>();
    const unviewed = expectedPolicies
      .filter((pol) => !viewed.has(`${pol.id}:${pol.published_version}`))
      .map((pol) => pol.name as string)
      .sort();
    if (unviewed.length) {
      sections.push({ heading: "Policies to read", items: unviewed });
    }

    // agreements
    const ua = unsignedAgreements(p);
    if (ua.length) {
      sections.push({ heading: "Agreements to sign", items: ua });
    }

    // contract
    const myContracts = contractsByProfile.get(p.id) ?? [];
    const unsignedContract = myContracts.some((c) => !c.signed);
    if (unsignedContract) {
      sections.push({ heading: "Contract", items: ["Your contract is waiting for your signature"] });
    }

    // onboarding
    const w = workerByProfile.get(p.id);
    if (!w || !w.onboarding_completed_at) {
      sections.push({
        heading: "Onboarding",
        items: ["Your onboarding questionnaire is not finished"],
      });
    }

    // own credentials
    const creds = (credsByProfile.get(p.id) ?? []).filter(
      (c) => daysUntil(c.expiry) <= CRED_WINDOW_DAYS,
    );
    if (creds.length) {
      sections.push({
        heading: "Credentials expiring",
        items: creds
          .sort((a, b) => a.expiry.localeCompare(b.expiry))
          .map((c) => `${c.label} ${expiryPhrase(c.expiry)}`),
      });
    }

    if (sections.length === 0) {
      result.nothingOutstanding += 1;
      continue;
    }

    digests.push({
      organisationId: p.organisation_id,
      profileId: p.id,
      email: p.email,
      name: p.full_name,
      orgName: orgName.get(p.organisation_id) ?? "your service",
      kind: "staff_digest",
      sections,
    });
  }

  // --- manager digests -------------------------------------------------

  // review-due SOPs and policies per org (content editors only)
  const reviewDueByOrg = new Map<string, string[]>();
  for (const s of pubSops ?? []) {
    const d = s.next_review_date as string | null;
    if (!d || daysUntil(d) > REVIEW_WINDOW_DAYS) continue;
    const list = reviewDueByOrg.get(s.organisation_id as string) ?? [];
    list.push(`Procedure: ${s.name} (${reviewPhrase(d)})`);
    reviewDueByOrg.set(s.organisation_id as string, list);
  }
  for (const pol of pubPolicies ?? []) {
    const d = pol.next_review_date as string | null;
    if (!d || daysUntil(d) > REVIEW_WINDOW_DAYS) continue;
    const list = reviewDueByOrg.get(pol.organisation_id as string) ?? [];
    list.push(`Policy: ${pol.name} (${reviewPhrase(d)})`);
    reviewDueByOrg.set(pol.organisation_id as string, list);
  }

  for (const m of people) {
    if (!m.is_active || !m.organisation_id || !m.email) continue;
    if (!isManager(m.access_tier)) continue;

    // staff this manager is responsible for
    const scope = people.filter(
      (s) =>
        s.organisation_id === m.organisation_id &&
        s.access_tier === "staff" &&
        s.is_active &&
        (m.access_tier === "admin" || s.service_id === m.service_id),
    );
    const scopeIds = new Set(scope.map((s) => s.id));

    const sections: Section[] = [];

    // documents awaiting sighting
    let sightingCount = 0;
    for (const pid of sightings.keys()) {
      if (scopeIds.has(pid)) sightingCount += sightings.get(pid) ?? 0;
    }
    if (sightingCount > 0) {
      sections.push({
        heading: "Documents to sight",
        items: [`${sightingCount} document${sightingCount === 1 ? "" : "s"} waiting for you to record a sighting`],
      });
    }

    // SOPs awaiting countersign
    let countersign = 0;
    for (const s of signOffs ?? []) {
      if (s.verified_at) continue;
      if (!scopeIds.has(s.user_id as string)) continue;
      const sop = pubSopById.get(s.sop_id as string);
      if (sop?.needsManager) countersign += 1;
    }
    if (countersign > 0) {
      sections.push({
        heading: "Procedures to countersign",
        items: [`${countersign} staff sign-off${countersign === 1 ? "" : "s"} waiting on your countersignature`],
      });
    }

    // contract renewals (admin + hr_manager)
    if (m.access_tier === "admin" || m.hr_manager) {
      const items: string[] = [];
      for (const s of scope) {
        for (const c of contractsByProfile.get(s.id) ?? []) {
          if (c.fixed && c.expiry && daysUntil(c.expiry) <= CONTRACT_WINDOW_DAYS) {
            items.push(`${s.full_name}: contract ${expiryPhrase(c.expiry)}`);
          }
        }
      }
      if (items.length) {
        sections.push({ heading: "Contracts to renew", items: items.sort() });
      }
    }

    // staff credential expiries (admin + hr_manager)
    if (m.access_tier === "admin" || m.hr_manager) {
      const items: string[] = [];
      for (const s of scope) {
        for (const c of credsByProfile.get(s.id) ?? []) {
          if (daysUntil(c.expiry) <= CRED_WINDOW_DAYS) {
            items.push(`${s.full_name}: ${c.label} ${expiryPhrase(c.expiry)}`);
          }
        }
      }
      if (items.length) {
        sections.push({
          heading: "Staff credentials expiring",
          items: items.sort(),
        });
      }
    }

    // review-due documents (content editors)
    if (isContentEditor(m.access_tier)) {
      const due = reviewDueByOrg.get(m.organisation_id) ?? [];
      if (due.length) {
        sections.push({ heading: "Reviews due", items: [...due].sort() });
      }
    }

    if (sections.length === 0) {
      continue;
    }

    digests.push({
      organisationId: m.organisation_id,
      profileId: m.id,
      email: m.email,
      name: m.full_name,
      orgName: orgName.get(m.organisation_id) ?? "your service",
      kind: "manager_digest",
      sections,
    });
  }

  // --- send, respecting the cadence ----------------------------------

  const cadenceCutoff = new Date(
    Date.now() - CADENCE_DAYS * 86_400_000,
  ).toISOString();

  for (const d of digests) {
    try {
      const { data: recent } = await admin
        .from("notification_log")
        .select("id")
        .eq("recipient_profile_id", d.profileId)
        .eq("kind", d.kind)
        .gte("sent_at", cadenceCutoff)
        .limit(1);
      if (recent && recent.length) {
        result.skippedRecentlySent += 1;
        continue;
      }

      const subject =
        d.kind === "staff_digest"
          ? `${d.orgName}: items outstanding on VeriClever`
          : `${d.orgName}: team items to action on VeriClever`;

      if (dryRun) {
        result.preview!.push({
          to: d.email,
          kind: d.kind,
          subject,
          lines: d.sections.flatMap((s) => [
            `${s.heading}:`,
            ...s.items.map((i) => `  - ${i}`),
          ]),
        });
      } else {
        const sent = await sendEmail({
          to: d.email,
          subject,
          html: renderHtml(d),
          text: renderText(d),
        });
        if (!sent.ok) {
          result.errors.push(`${d.email}: ${sent.error}`);
          continue;
        }
        await admin.from("notification_log").insert({
          organisation_id: d.organisationId,
          recipient_profile_id: d.profileId,
          recipient_email: d.email,
          kind: d.kind,
          detail: { sections: d.sections },
        });
      }

      if (d.kind === "staff_digest") result.staffDigests += 1;
      else result.managerDigests += 1;
    } catch (e) {
      result.errors.push(
        `${d.email}: ${e instanceof Error ? e.message : "send failed"}`,
      );
    }
  }

  return result;
}

// --- helpers ------------------------------------------------------------

function reviewPhrase(isoDate: string): string {
  const n = daysUntil(isoDate);
  if (n < 0) return `review overdue since ${fmtDate(isoDate)}`;
  if (n === 0) return `review due today`;
  return `review due ${fmtDate(isoDate)}`;
}

function trainingLabel(type: string, other: string | null): string {
  const map: Record<string, string> = {
    first_aid: "First aid certificate",
    cpr: "CPR certificate",
    anaphylaxis: "Anaphylaxis training",
    asthma: "Asthma training",
    child_protection: "Child protection training",
    food_safety: "Food safety training",
    other: other?.trim() || "Training certificate",
  };
  return map[type] ?? (other?.trim() || "Training certificate");
}

async function gatherPendingSightings(admin: Admin): Promise<Map<string, number>> {
  const tables = [
    "wwcc_checks",
    "teacher_registrations",
    "qualifications",
    "training_records",
    "identity_documents",
  ] as const;
  const counts = new Map<string, number>();
  const results = await Promise.all(
    tables.map((t) => admin.from(t).select("profile_id").is("sighted_at", null)),
  );
  for (const { data } of results) {
    for (const row of data ?? []) {
      const pid = row.profile_id as string;
      counts.set(pid, (counts.get(pid) ?? 0) + 1);
    }
  }
  return counts;
}

function renderText(d: Digest): string {
  const lines = [`Hi ${d.name.split(/\s+/)[0] || "there"},`, ""];
  if (d.kind === "staff_digest") {
    lines.push(
      `This is your weekly reminder of what is still outstanding on VeriClever for ${d.orgName}.`,
    );
  } else {
    lines.push(
      `This is your weekly summary of team items waiting on you in VeriClever for ${d.orgName}.`,
    );
  }
  lines.push("");
  for (const s of d.sections) {
    lines.push(`${s.heading}`);
    for (const i of s.items) lines.push(`  - ${i}`);
    lines.push("");
  }
  const site = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://vericlever.site").replace(
    /\/+$/,
    "",
  );
  lines.push(`Sign in: ${site}`);
  return lines.join("\n");
}

function renderHtml(d: Digest): string {
  const site = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://vericlever.site").replace(
    /\/+$/,
    "",
  );
  const intro =
    d.kind === "staff_digest"
      ? `This is your weekly reminder of what is still outstanding on VeriClever for ${esc(d.orgName)}.`
      : `This is your weekly summary of team items waiting on you in VeriClever for ${esc(d.orgName)}.`;
  const blocks = d.sections
    .map(
      (s) => `<p style="margin:18px 0 4px;font-weight:600">${esc(s.heading)}</p>
<ul style="margin:0;padding-left:20px">${s.items
        .map((i) => `<li style="margin:2px 0">${esc(i)}</li>`)
        .join("")}</ul>`,
    )
    .join("");
  return `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;font-size:15px;line-height:1.5;color:#0f172a">
  <p>Hi ${esc(d.name.split(/\s+/)[0] || "there")},</p>
  <p>${intro}</p>
  ${blocks}
  <p style="margin:24px 0">
    <a href="${esc(site)}" style="background:#0f172a;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;font-weight:600">Open VeriClever</a>
  </p>
</div>`;
}
