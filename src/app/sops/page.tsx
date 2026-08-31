import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";
import { SOP_TIER_LABELS, SOP_TIER_ORDER } from "@/lib/constants";

export const dynamic = "force-dynamic";

type SopRow = {
  id: string;
  name: string;
  target_tier: string;
  signoff_type: string | null;
  current_version: number;
};

export default async function SopListPage() {
  const profile = await requireProfile();
  const supabase = createClient();

  if (!profile.job_role_id) {
    return (
      <div>
        <h1 className="text-xl font-semibold">Standard operating procedures</h1>
        <p className="mt-3 max-w-prose text-sm text-slate-500">
          You have not been assigned a job role yet, so you have no SOPs to sign.
          Ask an administrator to set your job role.
        </p>
      </div>
    );
  }

  // The SOPs a person must sign are exactly the suite attached to their job
  // role, nothing else.
  const { data: suite, error: suiteError } = await supabase
    .from("job_role_sops")
    .select("sop_id")
    .eq("job_role_id", profile.job_role_id);

  if (suiteError) {
    return <p className="text-red-600">Could not load your SOPs: {suiteError.message}</p>;
  }

  const sopIds = (suite ?? []).map((r) => r.sop_id as string);
  if (sopIds.length === 0) {
    return (
      <div>
        <h1 className="text-xl font-semibold">Standard operating procedures</h1>
        <p className="mt-3 max-w-prose text-sm text-slate-500">
          Your job role has no SOPs attached yet.
        </p>
      </div>
    );
  }

  const [{ data: sops, error }, { data: signOffs }] = await Promise.all([
    supabase
      .from("sops")
      .select("id, name, target_tier, signoff_type, current_version")
      .in("id", sopIds)
      .order("name"),
    supabase
      .from("sign_offs")
      .select("sop_id, sop_version")
      .eq("user_id", profile.id),
  ]);

  if (error) {
    return <p className="text-red-600">Could not load your SOPs: {error.message}</p>;
  }

  const signed = new Set(
    (signOffs ?? []).map((s) => `${s.sop_id}:${s.sop_version}`),
  );
  const isSigned = (s: SopRow) => signed.has(`${s.id}:${s.current_version}`);

  const rows = (sops ?? []) as SopRow[];
  const byTier = new Map<string, SopRow[]>();
  for (const sop of rows) {
    const list = byTier.get(sop.target_tier) ?? [];
    list.push(sop);
    byTier.set(sop.target_tier, list);
  }
  const tiersPresent = SOP_TIER_ORDER.filter((t) => byTier.has(t));

  const signedCount = rows.filter(isSigned).length;

  return (
    <div>
      <h1 className="text-xl font-semibold">Standard operating procedures</h1>
      <p className="mt-1 text-sm text-slate-500">
        {signedCount} of {rows.length} signed
      </p>

      <div className="mt-6 space-y-8">
        {tiersPresent.map((tier) => (
          <section key={tier}>
            {tiersPresent.length > 1 && (
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                {SOP_TIER_LABELS[tier] ?? tier}
              </h2>
            )}
            <ul className="mt-2 divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
              {(byTier.get(tier) ?? []).map((sop) => (
                <li key={sop.id}>
                  <Link
                    href={`/sops/${sop.id}`}
                    className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-slate-50"
                  >
                    <span className="text-sm">{sop.name}</span>
                    {isSigned(sop) ? (
                      <span className="shrink-0 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                        Signed
                      </span>
                    ) : (
                      <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">
                        Not signed
                      </span>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
