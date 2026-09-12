import Link from "next/link";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { classifyPersonCredentials } from "@/lib/credentials";
import { agreementsForProfile } from "@/lib/agreements";
import { StageArc } from "@/components/bauhaus";

export const dynamic = "force-dynamic";

function fmtDate(v: string) {
  return new Date(v).toLocaleDateString("en-AU", { dateStyle: "medium" });
}

type WorklistItem = { label: string; href: string };

export default async function StaffHomePage() {
  const me = await requireProfile();
  const supabase = createClient();

  const [{ data: wd }, { data: wwcc }, { data: teacher }, { data: training }] =
    await Promise.all([
      supabase
        .from("worker_details")
        .select("onboarding_completed_at, visa_expiry")
        .eq("profile_id", me.id)
        .maybeSingle(),
      supabase
        .from("wwcc_checks")
        .select("expiry_date")
        .eq("profile_id", me.id)
        .not("expiry_date", "is", null),
      supabase
        .from("teacher_registrations")
        .select("expiry_date")
        .eq("profile_id", me.id)
        .not("expiry_date", "is", null),
      supabase
        .from("training_records")
        .select("training_type, other_description, expiry_date")
        .eq("profile_id", me.id)
        .not("expiry_date", "is", null),
    ]);

  // Procedure sign-off state: the same suite-and-sign-off shapes as
  // /sops/page.tsx, so "outstanding" here always matches what that page would
  // show as not-yet-signed.
  const unsignedSops: WorklistItem[] = [];
  const awaitingCosignSops: WorklistItem[] = [];
  let sopTotal = 0;
  if (me.job_role_id) {
    const { data: suite } = await supabase
      .from("job_role_sops")
      .select("sop_id")
      .eq("job_role_id", me.job_role_id);
    const sopIds = (suite ?? []).map((r) => r.sop_id as string);
    if (sopIds.length > 0) {
      const [{ data: sops }, { data: signOffs }] = await Promise.all([
        supabase
          .from("sops")
          .select("id, name, signoff_type, published_version")
          .in("id", sopIds)
          .not("published_version", "is", null),
        supabase
          .from("sign_offs")
          .select("sop_id, sop_version, verified_at")
          .eq("user_id", me.id),
      ]);
      const signOffFor = new Map(
        (signOffs ?? []).map((s) => [`${s.sop_id}:${s.sop_version}`, s]),
      );
      const published = sops ?? [];
      sopTotal = published.length;
      for (const s of published) {
        const so = signOffFor.get(`${s.id}:${s.published_version}`);
        const item = { label: s.name as string, href: `/sops/${s.id}` };
        if (!so) {
          unsignedSops.push(item);
        } else if (s.signoff_type === "self_and_manager" && !so.verified_at) {
          awaitingCosignSops.push(item);
        }
      }
    }
  }

  const credentialAlerts = classifyPersonCredentials({
    wwcc: (wwcc ?? []) as { expiry_date: string | null }[],
    teacher: (teacher ?? []) as { expiry_date: string | null }[],
    training: (training ?? []) as {
      training_type: string;
      other_description: string | null;
      expiry_date: string | null;
    }[],
    visaExpiry: wd?.visa_expiry ?? null,
  });
  const credentialItems: WorklistItem[] = credentialAlerts.map((a) => {
    const when =
      a.daysLeft < 0
        ? `expired ${Math.abs(a.daysLeft)} ${Math.abs(a.daysLeft) === 1 ? "day" : "days"} ago`
        : a.daysLeft === 0
          ? "expires today"
          : `expires in ${a.daysLeft} ${a.daysLeft === 1 ? "day" : "days"}`;
    return { label: `${a.label} — ${fmtDate(a.expiryDate)} (${when})`, href: "/onboarding" };
  });

  const agreements = await agreementsForProfile(supabase, {
    id: me.id,
    job_role_id: me.job_role_id,
  });
  const unsignedAgreements: WorklistItem[] = agreements
    .filter((a) => !a.signed)
    .map((a) => ({ label: a.name, href: `/agreements/${a.id}` }));

  const onboardingOutstanding = Boolean(me.job_role_id && !wd?.onboarding_completed_at);

  // Policy viewed %, same shape as the admin staff-record page's "Policies
  // viewed" stat, just scoped to the signed-in user instead of someone else's
  // record.
  const [{ data: targetPolicies }, { data: policyViewRows }, { data: jobRole }] =
    await Promise.all([
      supabase.rpc("visible_published_policies", { p_profile: me.id }),
      supabase
        .from("policy_views")
        .select("policy_id, policy_version")
        .eq("user_id", me.id),
      me.job_role_id
        ? supabase.from("job_roles").select("name").eq("id", me.job_role_id).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);
  const policyRows = (targetPolicies ?? []) as {
    id: string;
    published_version: number;
  }[];
  const policyTotal = policyRows.length;
  const viewedSet = new Set(
    (policyViewRows ?? []).map((v) => `${v.policy_id}:${v.policy_version}`),
  );
  const policyViewed = policyRows.filter((p) =>
    viewedSet.has(`${p.id}:${p.published_version}`),
  ).length;
  const policyPct = policyTotal > 0 ? Math.round((policyViewed / policyTotal) * 100) : null;

  const sopSignedCount = sopTotal - unsignedSops.length - awaitingCosignSops.length;
  const sopPct = sopTotal > 0 ? Math.round((sopSignedCount / sopTotal) * 100) : null;

  // Training, per assigned job role. A profile carries a single job_role_id
  // today, so this is one line in practice - built so a future move to
  // multiple roles per person only needs a data change here, not a UI one.
  const trainingByRole = me.job_role_id
    ? [{ name: jobRole?.name ?? "Your role", pct: sopPct }]
    : [];

  // Procedures have their own card above (My Procedures) with a live %, so
  // this count is just the items actually listed in the section below it.
  const outstandingCount =
    (onboardingOutstanding ? 1 : 0) + unsignedAgreements.length + credentialItems.length;

  return (
    <div>
      <h1 className="text-xl font-semibold">Welcome back, {me.full_name.split(" ")[0]}</h1>
      <p className="mt-1 text-sm text-slate-500">
        Where your sign-off fits into the wider chain, and what&apos;s outstanding on
        your record.
      </p>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <StageSection
          stage="policy"
          title="My Policies"
          pct={policyPct}
          detail={
            policyTotal > 0
              ? `${policyViewed} of ${policyTotal} viewed`
              : "No published policies target you yet."
          }
          buttonLabel="View policies"
          buttonHref="/policies"
        />
        <StageSection
          stage="procedure"
          title="My Procedures"
          pct={sopPct}
          detail={
            sopTotal > 0
              ? `${sopSignedCount} of ${sopTotal} signed`
              : me.job_role_id
                ? "No published procedures for your role yet."
                : "No job role assigned yet."
          }
          buttonLabel="View procedures"
          buttonHref="/sops"
        />

        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <SectionHeading stage="training" title="My Training" />
          {trainingByRole.length === 0 ? (
            <p className="mt-3 text-sm text-slate-500">No job role assigned yet.</p>
          ) : (
            <ul className="mt-3 space-y-1.5">
              {trainingByRole.map((r) => (
                <li key={r.name} className="flex items-center justify-between text-sm">
                  <span className="text-slate-700">{r.name}</span>
                  <span className="font-medium text-slate-900">
                    {r.pct === null ? "—" : `${r.pct}% complete`}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <SectionHeading stage="outcomes" title="My Outcomes" />
          <p className="mt-3 text-sm text-slate-500">
            Flagging a procedure with a reflection for your manager is coming soon.
          </p>
        </section>
      </div>

      <section className="mt-6">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Other outstanding{outstandingCount > 0 ? ` (${outstandingCount})` : ""}
        </h2>
        <div className="mt-2 rounded-lg border border-slate-200 bg-white p-4">
          {outstandingCount === 0 ? (
            <p className="text-sm text-slate-500">
              Nothing outstanding. Everything expected of you is signed, sighted and up
              to date.
            </p>
          ) : (
            <div className="space-y-4">
              <WorklistGroup
                title="Onboarding questionnaire"
                items={
                  onboardingOutstanding
                    ? [{ label: "Not completed", href: "/onboarding" }]
                    : []
                }
              />
              <WorklistGroup title="Agreements not signed" items={unsignedAgreements} />
              <WorklistGroup
                title="Credentials expired or expiring"
                items={credentialItems}
              />
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function SectionHeading({
  stage,
  title,
}: {
  stage: "policy" | "procedure" | "training" | "outcomes";
  title: string;
}) {
  return (
    <div className="flex items-center gap-2.5">
      <StageArc stage={stage} size={28} />
      <h2 className="text-sm font-semibold text-slate-800">{title}</h2>
    </div>
  );
}

function StageSection({
  stage,
  title,
  pct,
  detail,
  buttonLabel,
  buttonHref,
}: {
  stage: "policy" | "procedure" | "training" | "outcomes";
  title: string;
  pct: number | null;
  detail: string;
  buttonLabel: string;
  buttonHref: string;
}) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4">
      <SectionHeading stage={stage} title={title} />
      <div className="mt-3 flex items-baseline gap-2">
        <span className="text-2xl font-semibold text-slate-900">
          {pct === null ? "—" : `${pct}%`}
        </span>
        <span className="text-xs text-slate-500">complete</span>
      </div>
      <p className="mt-1 text-xs text-slate-500">{detail}</p>
      <Link
        href={buttonHref}
        className="mt-3 inline-block rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800"
      >
        {buttonLabel}
      </Link>
    </section>
  );
}

function WorklistGroup({ title, items }: { title: string; items: WorklistItem[] }) {
  if (items.length === 0) return null;
  return (
    <div>
      <div className="flex items-baseline gap-2 text-sm">
        <span className="font-medium text-slate-700">{title}</span>
        <span className="text-slate-400">({items.length})</span>
      </div>
      <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm">
        {items.map((it, i) => (
          <li key={i}>
            <Link href={it.href} className="text-slate-600 underline hover:text-slate-900">
              {it.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
