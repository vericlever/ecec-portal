import Link from "next/link";
import { query } from "@/lib/db";
import {
  RSG_ORGANISATION_ID,
  DEV_USER_ID,
  SOP_TIER_LABELS,
  SOP_TIER_ORDER,
} from "@/lib/constants";

export const dynamic = "force-dynamic";

type SopRow = {
  id: string;
  name: string;
  target_tier: string;
  signoff_type: string | null;
  current_version: number;
  signed: boolean;
};

export default async function SopListPage() {
  const sops = await query<SopRow>(
    `
    select s.id,
           s.name,
           s.target_tier,
           s.signoff_type,
           s.current_version,
           exists (
             select 1 from sign_offs so
             where so.user_id = $2
               and so.sop_id = s.id
               and so.sop_version = s.current_version
           ) as signed
    from sops s
    where s.organisation_id = $1
    order by s.name
    `,
    [RSG_ORGANISATION_ID, DEV_USER_ID],
  );

  const byTier = new Map<string, SopRow[]>();
  for (const sop of sops) {
    const list = byTier.get(sop.target_tier) ?? [];
    list.push(sop);
    byTier.set(sop.target_tier, list);
  }

  const signedCount = sops.filter((s) => s.signed).length;

  return (
    <div>
      <h1 className="text-xl font-semibold">Standard operating procedures</h1>
      <p className="mt-1 text-sm text-slate-500">
        {signedCount} of {sops.length} signed
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
                    {sop.signed ? (
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
