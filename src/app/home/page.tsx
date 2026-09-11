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
  const unsignedSops: string[] = [];
  const awaitingCosignSops: string[] = [];
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
        if (!so) {
          unsignedSops.push(s.name as string);
        } else if (s.signoff_type === "self_and_manager" && !so.verified_at) {
          awaitingCosignSops.push(s.name as string);
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
  const credentialItems = credentialAlerts.map((a) => {
    const when =
      a.daysLeft < 0
        ? `expired ${Math.abs(a.daysLeft)} ${Math.abs(a.daysLeft) === 1 ? "day" : "days"} ago`
        : a.daysLeft === 0
          ? "expires today"
          : `expires in ${a.daysLeft} ${a.daysLeft === 1 ? "day" : "days"}`;
    return `${a.label} — ${fmtDate(a.expiryDate)} (${when})`;
  });

  const agreements = await agreementsForProfile(supabase, {
    id: me.id,
    job_role_id: me.job_role_id,
  });
  const unsignedAgreements = agreements.filter((a) => !a.signed).map((a) => a.name);

  const onboardingOutstanding = Boolean(me.job_role_id && !wd?.onboarding_completed_at);

  const outstandingCount =
    (onboardingOutstanding ? 1 : 0) +
    unsignedSops.length +
    awaitingCosignSops.length +
    unsignedAgreements.length +
    credentialItems.length;

  return (
    <div>
      <h1 className="text-xl font-semibold">Welcome back, {me.full_name.split(" ")[0]}</h1>
      <p className="mt-1 text-sm text-slate-500">
        Here&apos;s what&apos;s outstanding on your record, and where your sign-off fits
        into the wider chain.
      </p>

      <section className="mt-5 rounded-lg border border-slate-200 bg-white p-5">
        <div className="flex items-center gap-3 sm:gap-5">
          <StageArc stage="policy" size={36} muted />
          <ChainLink />
          <StageArc stage="procedure" size={36} />
          <ChainLink />
          <StageArc stage="training" size={36} />
          <ChainLink />
          <StageArc stage="outcomes" size={36} />
        </div>
        <div className="mt-3 grid grid-cols-4 gap-2 text-center text-xs">
          <div className="text-slate-400">
            <div className="font-medium">Policy</div>
            <div>Set by your service</div>
          </div>
          <div className="text-slate-700">
            <div className="font-medium">Procedure</div>
            <div className="text-slate-500">What you train on</div>
          </div>
          <div className="text-slate-700">
            <div className="font-medium">Training</div>
            <div className="text-slate-500">Your sign-off</div>
          </div>
          <div className="text-slate-700">
            <div className="font-medium">Outcomes</div>
            <div className="text-slate-500">Your evidence on file</div>
          </div>
        </div>
        <p className="mt-4 text-xs leading-relaxed text-slate-400">
          Policy sets the rule your service works to, and procedures carry the actual
          work. You don&apos;t edit either one directly - your part is training on the
          procedure and signing off, and that sign-off is exactly what becomes the
          outcomes evidence your service holds.
        </p>
      </section>

      <section className="mt-6">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Outstanding{outstandingCount > 0 ? ` (${outstandingCount})` : ""}
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
                items={onboardingOutstanding ? ["Not completed"] : []}
                href="/onboarding"
              />
              <WorklistGroup
                title="Procedures not signed"
                items={unsignedSops}
                href="/sops"
              />
              <WorklistGroup
                title="Procedures waiting on a manager countersignature"
                items={awaitingCosignSops}
                href="/sops"
              />
              <WorklistGroup
                title="Agreements not signed"
                items={unsignedAgreements}
                href="/agreements"
              />
              <WorklistGroup
                title="Credentials expired or expiring"
                items={credentialItems}
                href="/onboarding"
              />
            </div>
          )}
        </div>
      </section>

      {me.job_role_id && sopTotal > 0 && (
        <p className="mt-4 text-sm text-slate-500">
          {sopTotal - unsignedSops.length - awaitingCosignSops.length} of {sopTotal}{" "}
          procedures fully signed.{" "}
          <Link href="/sops" className="font-medium text-slate-700 underline">
            Go to your procedures
          </Link>
        </p>
      )}
    </div>
  );
}

function ChainLink() {
  return <div className="h-px w-4 shrink-0 bg-slate-300 sm:w-8" aria-hidden="true" />;
}

function WorklistGroup({
  title,
  items,
  href,
}: {
  title: string;
  items: string[];
  href: string;
}) {
  if (items.length === 0) return null;
  return (
    <div>
      <div className="flex items-baseline gap-2 text-sm">
        <span className="font-medium text-slate-700">{title}</span>
        <span className="text-slate-400">({items.length})</span>
      </div>
      <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-slate-600">
        {items.map((it, i) => (
          <li key={i}>{it}</li>
        ))}
      </ul>
      <Link href={href} className="mt-1 inline-block text-xs font-medium text-slate-500 underline">
        Go there
      </Link>
    </div>
  );
}
