import Link from "next/link";
import { notFound } from "next/navigation";
import { query } from "@/lib/db";
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

type SopRow = {
  id: string;
  name: string;
  target_tier: string;
  status: string | null;
  signoff_type: string | null;
  notes: string | null;
  body: string | null;
  current_version: number;
  signed_at: string | null;
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
  const [sop] = await query<SopRow>(
    `
    select s.id, s.name, s.target_tier, s.status, s.signoff_type, s.notes,
           s.body, s.current_version,
           (
             select so.signed_at from sign_offs so
             where so.user_id = $3
               and so.sop_id = s.id
               and so.sop_version = s.current_version
             limit 1
           ) as signed_at
    from sops s
    where s.id = $1 and s.organisation_id = $2
    `,
    [params.sopId, RSG_ORGANISATION_ID, DEV_USER_ID],
  );

  if (!sop) notFound();

  const policies = await query<{ name: string }>(
    `
    select p.name
    from policy_sop_links l
    join policies p on p.id = l.policy_id
    where l.sop_id = $1
    order by p.name
    `,
    [sop.id],
  );

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
          <div className="whitespace-pre-wrap text-[15px] leading-relaxed text-slate-800">
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

      {sop.signed_at ? (
        <div className="mt-6 rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-800">
          Signed on {formatDate(sop.signed_at)} (version {sop.current_version}).
        </div>
      ) : (
        <SignForm sopId={sop.id} />
      )}
    </div>
  );
}
