import Link from "next/link";
import { notFound } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { AgreementSignForm } from "./sign-form";

export const dynamic = "force-dynamic";

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("en-AU", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export default async function AgreementDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const profile = await requireProfile();
  const supabase = createClient();

  const { data: agreement } = await supabase
    .from("hr_agreements")
    .select(
      "id, name, published_body, published_version, all_staff, linked_policy_id",
    )
    .eq("id", params.id)
    .maybeSingle();

  if (!agreement || agreement.published_version == null) notFound();

  // Does it apply to this person?
  let applies = agreement.all_staff;
  if (!applies && profile.job_role_id) {
    const { data: link } = await supabase
      .from("hr_agreement_job_roles")
      .select("agreement_id")
      .eq("agreement_id", agreement.id)
      .eq("job_role_id", profile.job_role_id)
      .maybeSingle();
    applies = Boolean(link);
  }

  const [{ data: signoff }, { data: linkedPolicy }] = await Promise.all([
    supabase
      .from("hr_agreement_signoffs")
      .select("signed_at")
      .eq("agreement_id", agreement.id)
      .eq("user_id", profile.id)
      .eq("agreement_version", agreement.published_version)
      .maybeSingle(),
    agreement.linked_policy_id
      ? supabase
          .from("policies")
          .select("id, name, published_version")
          .eq("id", agreement.linked_policy_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  return (
    <div>
      <Link
        href="/agreements"
        className="text-sm text-slate-500 hover:text-slate-900"
      >
        ← Agreements
      </Link>
      <h1 className="mt-3 text-xl font-semibold">{agreement.name}</h1>
      <div className="mt-2 text-xs">
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-600">
          Version {agreement.published_version}
        </span>
      </div>

      <article className="mt-6 rounded-lg border border-slate-200 bg-white p-5">
        <div className="whitespace-pre-wrap text-[15px] leading-relaxed text-slate-800">
          {agreement.published_body || "(No text)"}
        </div>
      </article>

      {linkedPolicy && linkedPolicy.published_version != null && (
        <p className="mt-4 text-sm">
          <Link
            href={`/policies/${linkedPolicy.id}`}
            className="text-slate-700 underline hover:text-slate-900"
          >
            Open the linked policy: {linkedPolicy.name}
          </Link>
        </p>
      )}

      {signoff ? (
        <div className="mt-6 rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-800">
          Signed on {formatDate(signoff.signed_at)} (version{" "}
          {agreement.published_version}).
        </div>
      ) : applies ? (
        <AgreementSignForm agreementId={agreement.id} />
      ) : (
        <p className="mt-6 rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-500">
          This agreement does not apply to your job role, so it is shown for
          reference only.
        </p>
      )}
    </div>
  );
}
