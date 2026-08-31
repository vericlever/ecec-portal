import Link from "next/link";
import { createServiceClient } from "@/lib/supabase";
import {
  RSG_ORGANISATION_ID,
  DEV_USER_ID,
  SOP_TIER_LABELS,
  SOP_TIER_ORDER,
} from "@/lib/constants";

export const dynamic = "force-dynamic";

type Sop = {
  id: string;
  name: string;
  target_tier: string;
  signoff_type: string | null;
  status: string | null;
  current_version: number;
};

export default async function SopListPage() {
  const supabase = createServiceClient();

  const [{ data: sops, error: sopsError }, { data: signOffs, error: signError }] =
    await Promise.all([
      supabase
        .from("sops")
        .select("id, name, target_tier, signoff_type, status, current_version")
        .eq("organisation_id", RSG_ORGANISATION_ID)
        .order("name"),
      supabase
        .from("sign_offs")
        .select("sop_id, sop_version")
        .eq("user_id", DEV_USER_ID),
    ]);

  if (sopsError || signError) {
    return (
      <p className="text-red-600">
        Could not load SOPs: {(sopsError ?? signError)?.message}
      </p>
    );
  }

  const signedKey = new Set(
    (signOffs ?? []).map((s) => `${s.sop_id}:${s.sop_version}`),
  );
  const isSigned = (sop: Sop) =>
    signedKey.has(`${sop.id}:${sop.current_version}`);

  const byTier = new Map<string, Sop[]>();
  for (const sop of (sops ?? []) as Sop[]) {
    const list = byTier.get(sop.target_tier) ?? [];
    list.push(sop);
    byTier.set(sop.target_tier, list);
  }

  const total = sops?.length ?? 0;
  const signedCount = ((sops ?? []) as Sop[]).filter(isSigned).length;

  return (
    <div>
      <h1 className="text-xl font-semibold">Standard operating procedures</h1>
      <p className="mt-1 text-sm text-slate-500">
        {signedCount} of {total} signed
      </p>

      <div className="mt-6 space-y-8">
        {SOP_TIER_ORDER.filter((tier) => byTier.has(tier)).map((tier) => (
          <section key={tier}>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
              {SOP_TIER_LABELS[tier] ?? tier}
            </h2>
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
