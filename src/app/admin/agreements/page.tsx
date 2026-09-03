import Link from "next/link";
import { requireContentEditor } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Row = {
  id: string;
  name: string;
  body: string | null;
  published_body: string | null;
  published_version: number | null;
  all_staff: boolean;
};

function statusOf(a: Row): { label: string; tone: string } {
  if (!a.published_version) {
    if (!a.body || !a.body.trim())
      return { label: "Needs content", tone: "bg-slate-100 text-slate-500" };
    return { label: "Draft", tone: "bg-blue-100 text-blue-700" };
  }
  if ((a.body ?? "") !== (a.published_body ?? ""))
    return {
      label: "Published · unpublished changes",
      tone: "bg-amber-100 text-amber-800",
    };
  return { label: "Published", tone: "bg-green-100 text-green-700" };
}

export default async function AgreementsPage() {
  await requireContentEditor();
  const supabase = createClient();

  const [{ data: agreements }, { data: roleLinks }, { data: signoffs }] =
    await Promise.all([
      supabase
        .from("hr_agreements")
        .select("id, name, body, published_body, published_version, all_staff")
        .order("name"),
      supabase.from("hr_agreement_job_roles").select("agreement_id"),
      supabase
        .from("hr_agreement_signoffs")
        .select("agreement_id, agreement_version"),
    ]);

  const roleCount = new Map<string, number>();
  for (const l of roleLinks ?? [])
    roleCount.set(l.agreement_id, (roleCount.get(l.agreement_id) ?? 0) + 1);

  const rows = (agreements ?? []) as Row[];
  const signCount = new Map<string, number>();
  for (const s of signoffs ?? []) {
    const a = rows.find((r) => r.id === s.agreement_id);
    if (a && s.agreement_version === a.published_version) {
      signCount.set(a.id, (signCount.get(a.id) ?? 0) + 1);
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Agreements</h1>
        <Link
          href="/admin/agreements/new"
          className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white"
        >
          New agreement
        </Link>
      </div>
      <p className="mt-1 max-w-prose text-sm text-slate-500">
        Documents a staff member reads and signs: Code of Conduct,
        Confidentiality, Uniform Receipt, an Individual Flexibility Agreement, a
        trainee Training Agreement, and plain acknowledgements. Re-publishing an
        agreement asks everyone who signed the old version to sign again.
      </p>

      <ul className="mt-6 divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
        {rows.length === 0 && (
          <li className="px-4 py-3 text-sm text-slate-500">
            No agreements yet.
          </li>
        )}
        {rows.map((a) => {
          const st = statusOf(a);
          return (
            <li key={a.id}>
              <Link
                href={`/admin/agreements/${a.id}`}
                className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-slate-50"
              >
                <div className="min-w-0">
                  <div className="text-sm font-medium">{a.name}</div>
                  <div className="mt-0.5 text-xs text-slate-400">
                    {a.all_staff
                      ? "All staff"
                      : `${roleCount.get(a.id) ?? 0} job role${(roleCount.get(a.id) ?? 0) === 1 ? "" : "s"}`}
                    {a.published_version != null &&
                      ` · ${signCount.get(a.id) ?? 0} signed`}
                  </div>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${st.tone}`}
                >
                  {st.label}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
