import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";
import { assignedJobRoleIds } from "@/lib/staff-job-roles";
import { SignForm } from "./sign-form";
import { ReadAloud } from "./read-aloud";

export const dynamic = "force-dynamic";

const SIGNOFF_LABELS: Record<string, string> = {
  self: "Self sign-off",
  self_and_manager: "Staff and manager sign-off",
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
  const profile = await requireProfile();
  const supabase = createClient();

  const { data: sop } = await supabase
    .from("sops")
    .select(
      "id, name, signoff_type, notes, published_body, published_version, published_at",
    )
    .eq("id", params.sopId)
    .maybeSingle();

  if (!sop || sop.published_version == null) notFound();

  const roleIds = await assignedJobRoleIds(supabase, profile.id);
  const [{ data: links }, { data: signOff }, { data: inSuite }] =
    await Promise.all([
      supabase.from("policy_sop_links").select("policy_id").eq("sop_id", sop.id),
      supabase
        .from("sign_offs")
        .select("signed_at, verified_at, verified_by")
        .eq("user_id", profile.id)
        .eq("sop_id", sop.id)
        .eq("sop_version", sop.published_version)
        .maybeSingle(),
      roleIds.length > 0
        ? supabase
            .from("job_role_sops")
            .select("sop_id")
            .in("job_role_id", roleIds)
            .eq("sop_id", sop.id)
            .limit(1)
        : Promise.resolve({ data: [] as { sop_id: string }[] }),
    ]);

  // Linked policies the staff member is allowed to open. RLS on `policies`
  // already limits this to published policies that target them, matching their
  // view-only access on the Policies page, so anything returned here is safe to
  // link straight through.
  const policyIds = (links ?? []).map((l) => l.policy_id);
  const { data: policyRows } = policyIds.length
    ? await supabase.from("policies").select("id, name").in("id", policyIds)
    : { data: [] as { id: string; name: string }[] };
  const policies = (policyRows ?? [])
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name));

  const isInSuite = Boolean(inSuite && inSuite.length > 0);
  const needsManager = sop.signoff_type === "self_and_manager";

  return (
    <div>
      <Link href="/sops" className="text-sm text-slate-500 hover:text-slate-900">
        ← All Procedures
      </Link>

      <h1 className="mt-3 text-xl font-semibold">{sop.name}</h1>

      <div className="mt-2 flex flex-wrap gap-2 text-xs">
        {sop.signoff_type && (
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-600">
            {SIGNOFF_LABELS[sop.signoff_type] ?? sop.signoff_type}
          </span>
        )}
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-600">
          Version {sop.published_version}
        </span>
      </div>

      {sop.published_body && (
        <div className="mt-6">
          <ReadAloud text={sop.published_body} />
        </div>
      )}

      <article className="mt-3 rounded-lg border border-slate-200 bg-white p-5">
        <div className="whitespace-pre-wrap text-[15px] leading-relaxed text-slate-800">
          {sop.published_body || "(No text)"}
        </div>
      </article>

      {policies.length > 0 && (
        <section className="mt-4">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Source {policies.length === 1 ? "policy" : "policies"}
          </h2>
          <ul className="mt-2 space-y-1 text-sm">
            {policies.map((p) => (
              <li key={p.id}>
                <Link
                  href={`/policies/${p.id}`}
                  className="text-slate-700 underline hover:text-slate-900"
                >
                  {p.name}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {signOff ? (
        needsManager && !signOff.verified_at ? (
          <div className="mt-6 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            You signed this on {formatDate(signOff.signed_at)}. It now needs a
            manager to countersign with you.
          </div>
        ) : (
          <div className="mt-6 rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-800">
            Signed on {formatDate(signOff.signed_at)} (version{" "}
            {sop.published_version}).
            {signOff.verified_at &&
              ` Countersigned by a manager on ${formatDate(signOff.verified_at)}.`}
          </div>
        )
      ) : isInSuite ? (
        <SignForm sopId={sop.id} needsManager={needsManager} />
      ) : (
        <p className="mt-6 rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-500">
          This procedure is not part of your assigned job role, so it is shown for
          reference only.
        </p>
      )}
    </div>
  );
}
