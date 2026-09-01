import Link from "next/link";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const TYPE_LABEL: Record<string, string> = {
  policy: "Policies",
  procedure: "Procedures",
  handbook: "Handbooks",
  disaster_plan: "Disaster plans",
};
const TYPE_ORDER = ["policy", "procedure", "handbook", "disaster_plan"];

export default async function PoliciesPage() {
  const profile = await requireProfile();
  const supabase = createClient();

  // RLS returns only published policies that target this person.
  const [{ data: policies }, { data: views }] = await Promise.all([
    supabase
      .from("policies")
      .select("id, name, document_type, published_version, is_parent_facing")
      .not("published_version", "is", null)
      .order("name"),
    supabase
      .from("policy_views")
      .select("policy_id, policy_version")
      .eq("user_id", profile.id),
  ]);

  const viewed = new Set(
    (views ?? []).map((v) => `${v.policy_id}:${v.policy_version}`),
  );
  const rows = policies ?? [];
  const isViewed = (p: { id: string; published_version: number | null }) =>
    viewed.has(`${p.id}:${p.published_version}`);
  const viewedCount = rows.filter(isViewed).length;

  const byType = new Map<string, typeof rows>();
  for (const p of rows) {
    const list = byType.get(p.document_type) ?? [];
    list.push(p);
    byType.set(p.document_type, list);
  }
  const typesPresent = [
    ...TYPE_ORDER.filter((t) => byType.has(t)),
    ...[...byType.keys()].filter((t) => !TYPE_ORDER.includes(t)),
  ];

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
            {typesPresent.map((type) => (
              <section key={type}>
                {typesPresent.length > 1 && (
                  <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                    {TYPE_LABEL[type] ?? type}
                  </h2>
                )}
                <ul className="mt-2 divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
                  {(byType.get(type) ?? []).map((p) => (
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
