import Link from "next/link";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { agreementsForProfile } from "@/lib/agreements";
import { assignedJobRoleIds } from "@/lib/staff-job-roles";

export const dynamic = "force-dynamic";

export default async function AgreementsListPage() {
  const profile = await requireProfile();
  const supabase = createClient();
  const jobRoleIds = await assignedJobRoleIds(supabase, profile.id);
  const items = await agreementsForProfile(supabase, { id: profile.id, jobRoleIds });

  const outstanding = items.filter((a) => !a.signed);

  return (
    <div>
      <h1 className="text-xl font-semibold">Agreements</h1>
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
