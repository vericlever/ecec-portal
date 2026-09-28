import Link from "next/link";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { agreementsForProfile } from "@/lib/agreements";
import { assignedJobRoleIds } from "@/lib/staff-job-roles";
import { activeContract, executionState, type ContractRow } from "@/lib/contracts";

export const dynamic = "force-dynamic";

const EXECUTION_LABEL: Record<ReturnType<typeof executionState>, string> = {
  deed: "Deed - signed on paper",
  unsigned: "To sign",
  awaiting_countersign: "Awaiting countersignature",
  executed: "Signed",
};
const EXECUTION_TONE: Record<ReturnType<typeof executionState>, string> = {
  deed: "bg-slate-100 text-slate-500",
  unsigned: "bg-amber-100 text-amber-800",
  awaiting_countersign: "bg-blue-100 text-blue-700",
  executed: "bg-green-100 text-green-700",
};

// This page is the one place a staff member (or a manager looking at their
// own record) goes to see everything that needs their signature - their
// employment contract as well as the generic agreements below. Upload and
// the actual sign pad both stay on /onboarding (ContractPanel) rather than
// being duplicated here; this is just the same at-a-glance list pattern the
// admin Agreements page already uses for its own Contracts section.
async function MyContractSection({ profileId }: { profileId: string }) {
  const supabase = createClient();
  const { data: contracts } = await supabase
    .from("contracts")
    .select(
      "id, profile_id, is_deed, requires_countersign, signed_at, countersigned_at, superseded_at, start_date",
    )
    .eq("profile_id", profileId)
    .is("superseded_at", null)
    .maybeSingle();
  if (!contracts) return null;

  const contract = contracts as unknown as ContractRow;
  const state = executionState(activeContract([contract]));

  return (
    <section className="mb-8">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        Your contract
      </h2>
      <ul className="mt-2 divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
        <li>
          <Link
            href="/onboarding#contract"
            className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-slate-50"
          >
            <span className="text-sm font-medium">Employment contract</span>
            <span
              className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${EXECUTION_TONE[state]}`}
            >
              {EXECUTION_LABEL[state]}
            </span>
          </Link>
        </li>
      </ul>
    </section>
  );
}

export default async function AgreementsListPage() {
  const profile = await requireProfile();
  const supabase = createClient();
  const jobRoleIds = await assignedJobRoleIds(supabase, profile.id);
  const items = await agreementsForProfile(supabase, { id: profile.id, jobRoleIds });

  const outstanding = items.filter((a) => !a.signed);

  return (
    <div>
      <MyContractSection profileId={profile.id} />

      <h1 className="text-xl font-semibold">My Agreements</h1>
      <p className="mt-1 text-sm text-slate-500">
        Workplace agreements and acknowledgements you need to read and sign.
      </p>

      {items.length === 0 ? (
        <p className="mt-6 text-sm text-slate-500">
          You have no agreements to sign.
        </p>
      ) : (
        <>
          {outstanding.length > 0 && (
            <p className="mt-4 text-sm text-amber-800">
              {outstanding.length}{" "}
              {outstanding.length === 1 ? "agreement needs" : "agreements need"}{" "}
              your signature.
            </p>
          )}
          <ul className="mt-4 divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
            {items.map((a) => (
              <li key={a.id}>
                <Link
                  href={`/agreements/${a.id}`}
                  className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-slate-50"
                >
                  <span className="text-sm font-medium">{a.name}</span>
                  {a.signed ? (
                    <span className="shrink-0 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                      Signed
                    </span>
                  ) : (
                    <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                      To sign
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
