import Link from "next/link";
import { notFound } from "next/navigation";
import { createServiceClient } from "@/lib/supabase";
import {
  RSG_ORGANISATION_ID,
  DEV_USER_ID,
  SOP_TIER_LABELS,
} from "@/lib/constants";
import { SignForm } from "./sign-form";

export const dynamic = "force-dynamic";

const SIGNOFF_LABELS: Record<string, string> = {
  self: "Self sign-off",
  supervisor: "Supervisor verified",
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("en-AU", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export default async function SopDetailPage({
  params,
}: {
  params: { sopId: string };
}) {
  const supabase = createServiceClient();

  const { data: sop } = await supabase
    .from("sops")
    .select(
      "id, name, target_tier, status, signoff_type, priority, notes, body, current_version",
    )
    .eq("id", params.sopId)
    .eq("organisation_id", RSG_ORGANISATION_ID)
    .maybeSingle();

  if (!sop) notFound();

  const [{ data: links }, { data: signOff }] = await Promise.all([
    supabase.from("policy_sop_links").select("policy_id").eq("sop_id", sop.id),
    supabase
      .from("sign_offs")
      .select("signed_at")
      .eq("user_id", DEV_USER_ID)
      .eq("sop_id", sop.id)
      .eq("sop_version", sop.current_version)
      .maybeSingle(),
  ]);

  const policyIds = (links ?? []).map((l) => l.policy_id);
  const { data: policyRows } = policyIds.length
    ? await supabase.from("policies").select("name").in("id", policyIds)
    : { data: [] as { name: string }[] };
  const policies = (policyRows ?? [])
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div>
      <Link href="/sops" className="text-sm text-slate-500 hover:text-slate-900">
        ← All SOPs
      </Link>

      <h1 className="mt-3 text-xl font-semibold">{sop.name}</h1>

      <div className="mt-2 flex flex-wrap gap-2 text-xs">
        <span className="rounded-full bg-slate-200 px-2 py-0.5 font-medium text-slate-700">
          {SOP_TIER_LABELS[sop.target_tier] ?? sop.target_tier}
        </span>
        {sop.signoff_type && (
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-600">
            {SIGNOFF_LABELS[sop.signoff_type] ?? sop.signoff_type}
          </span>
        )}
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-600">
          Version {sop.current_version}
        </span>
      </div>

      <article className="mt-6 rounded-lg border border-slate-200 bg-white p-5">
        {sop.body ? (
          <div className="whitespace-pre-wrap text-sm leading-relaxed text-slate-800">
            {sop.body}
          </div>
        ) : (
          <p className="text-sm italic text-slate-500">
            The written procedure for this SOP has not been uploaded yet.
            {sop.notes ? ` Note on file: ${sop.notes}` : ""}
          </p>
        )}
      </article>

      {policies.length > 0 && (
        <section className="mt-4">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Governed by
          </h2>
          <ul className="mt-2 text-sm text-slate-600">
            {policies.map((p) => (
              <li key={p.name}>{p.name}</li>
            ))}
          </ul>
        </section>
      )}

      {signOff ? (
        <div className="mt-6 rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-800">
          Signed on {formatDate(signOff.signed_at)} (version {sop.current_version}).
        </div>
      ) : (
        <SignForm sopId={sop.id} />
      )}
    </div>
  );
}
