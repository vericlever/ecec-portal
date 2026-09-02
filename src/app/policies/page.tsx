import Link from "next/link";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  policyCategories,
  policyCategoryLinks,
} from "@/lib/policy-categories";

export const dynamic = "force-dynamic";

export default async function PoliciesPage() {
  const profile = await requireProfile();
  const supabase = createClient();

  // RLS returns only published policies that target this person.
  const [{ data: policies }, { data: views }, categories] = await Promise.all([
    supabase
      .from("policies")
      .select("id, name, published_version")
      .not("published_version", "is", null)
      .order("name"),
    supabase
      .from("policy_views")
      .select("policy_id, policy_version")
      .eq("user_id", profile.id),
    policyCategories(supabase),
  ]);

  const rows = policies ?? [];
  const catByPolicy = await policyCategoryLinks(
    supabase,
    rows.map((p) => p.id),
  );

  const viewed = new Set(
    (views ?? []).map((v) => `${v.policy_id}:${v.policy_version}`),
  );
  const isViewed = (p: { id: string; published_version: number | null }) =>
    viewed.has(`${p.id}:${p.published_version}`);
  const viewedCount = rows.filter(isViewed).length;

  // Group by category. A policy in more than one category shows under each, so
  // it turns up wherever a staff member looks.
  const groups: { key: string; label: string; rows: typeof rows }[] =
    categories.map((c) => ({ key: c.id, label: c.name, rows: [] }));
  const uncategorised: typeof rows = [];
  for (const p of rows) {
    const cats = catByPolicy.get(p.id) ?? [];
    if (cats.length === 0) uncategorised.push(p);
    for (const cid of cats) groups.find((g) => g.key === cid)?.rows.push(p);
  }
  if (uncategorised.length)
    groups.push({ key: "none", label: "Other", rows: uncategorised });
  const present = groups.filter((g) => g.rows.length > 0);

  return (
    <div>
      <h1 className="text-xl font-semibold">Policies</h1>
      {rows.length === 0 ? (
        <p className="mt-3 max-w-prose text-sm text-slate-500">
          There are no policies to view yet.
        </p>
      ) : (
        <>
          <p className="mt-1 text-sm text-slate-500">
            {viewedCount} of {rows.length} viewed. Opening a policy records that
            you have seen the current version.
          </p>

          <div className="mt-6 space-y-8">
            {present.map((g) => (
              <section key={g.key}>
                {present.length > 1 && (
                  <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                    {g.label}
                  </h2>
                )}
                <ul className="mt-2 divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
                  {g.rows.map((p) => (
                    <li key={p.id}>
                      <Link
                        href={`/policies/${p.id}`}
                        className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-slate-50"
                      >
                        <span className="text-sm">{p.name}</span>
                        {isViewed(p) ? (
                          <span className="shrink-0 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                            Viewed
                          </span>
                        ) : (
                          <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">
                            Not viewed
                          </span>
                        )}
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
