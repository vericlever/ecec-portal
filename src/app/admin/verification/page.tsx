import Link from "next/link";
import { requireStaffAccess, isHrManager } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { verificationGroups, type VerificationItem } from "@/lib/verification";
import { SightingControl } from "../staff/[profileId]/record-controls";
import { CountersignControl } from "./countersign-control";

export const dynamic = "force-dynamic";

// Step 57 follow-up: one inbox for every staff member with something waiting
// on a leader, instead of a bare count that only pointed at sighting and then
// dropped you on their whole profile. A large service with many staff and a
// handful of documents each needs this collected in one place, not chased one
// profile at a time. Grouped by person, only people with something
// outstanding appear at all. Agreements aren't included yet - they're
// currently pure employee self-sign with no leader-side action to take.
function ItemRow({ item, canAct }: { item: VerificationItem; canAct: boolean }) {
  if (item.kind === "sighting") {
    return (
      <li className="px-4 py-3">
        <p className="text-sm text-slate-800">{item.label}</p>
        <div className="mt-1.5">
          <SightingControl
            table={item.table}
            recordId={item.recordId}
            sightedAt={null}
            sightedBy={null}
            canVerify={canAct}
          />
        </div>
      </li>
    );
  }
  if (item.kind === "contract_countersign") {
    return (
      <li className="px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-slate-800">{item.label}</p>
          {item.documentId && (
            <a
              href={`/api/documents/${item.documentId}`}
              className="shrink-0 text-xs text-slate-500 underline hover:text-slate-800"
            >
              View contract
            </a>
          )}
        </div>
        {canAct ? (
          <CountersignControl contractId={item.contractId} />
        ) : (
          <p className="mt-1 text-sm text-amber-700">Awaiting countersignature by a leader</p>
        )}
      </li>
    );
  }
  // contract_unsigned - the employee's own action, nothing to click here.
  return (
    <li className="px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-slate-500">{item.label}</p>
        {item.documentId && (
          <a
            href={`/api/documents/${item.documentId}`}
            className="shrink-0 text-xs text-slate-500 underline hover:text-slate-800"
          >
            View contract
          </a>
        )}
      </div>
    </li>
  );
}

export default async function VerificationPage() {
  const me = await requireStaffAccess();
  const supabase = createClient();
  const canAct = isHrManager(me);

  const groups = await verificationGroups(supabase, me.id);

  return (
    <div>
      <h1 className="text-xl font-semibold">Document verification</h1>
      <p className="mt-1 max-w-prose text-sm text-slate-500">
        Staff with a document waiting to be sighted or a contract waiting on a
        countersignature. Only people with something outstanding appear here.
      </p>

      {!canAct && (
        <p className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          You can see what is outstanding, but only an HR manager can sight a
          document or countersign a contract.
        </p>
      )}

      {groups.length === 0 ? (
        <p className="mt-6 text-sm text-slate-500">Nothing is waiting on you.</p>
      ) : (
        <div className="mt-6 space-y-6">
          {groups.map((g) => (
            <section
              key={g.profileId}
              id={g.profileId}
              className="overflow-hidden rounded-lg border border-slate-200 bg-white"
            >
              <div className="flex items-center justify-between gap-4 border-b border-slate-200 bg-slate-50 px-4 py-2.5">
                <span className="text-sm font-semibold text-slate-800">{g.name}</span>
                <Link
                  href={`/admin/staff/${g.profileId}`}
                  className="shrink-0 text-xs text-slate-500 underline hover:text-slate-800"
                >
                  View profile
                </Link>
              </div>
              <ul className="divide-y divide-slate-100">
                {g.items.map((item, i) => (
                  <ItemRow key={i} item={item} canAct={canAct} />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}