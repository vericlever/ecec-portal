import Link from "next/link";
import { requireContentEditor } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  policyCategories,
  policyCategoryLinks,
} from "@/lib/policy-categories";

export const dynamic = "force-dynamic";

type PolicyRow = {
  id: string;
  name: string;
  status: string;
  is_parent_facing: boolean;
  body: string | null;
  published_body: string | null;
  published_version: number | null;
  source_document_id: string | null;
  service_id: string | null;
};

function statusOf(p: PolicyRow): { label: string; tone: string } {
  if (p.status === "must_be_written")
    return { label: "To be written", tone: "bg-amber-100 text-amber-800" };
  if (p.status === "does_not_exist")
    return { label: "Does not exist", tone: "bg-slate-100 text-slate-500" };
  if (!p.published_version) {
    if (!p.body || !p.body.trim())
      return { label: "Needs a document", tone: "bg-slate-100 text-slate-500" };
    return { label: "Draft", tone: "bg-blue-100 text-blue-700" };
  }
  if ((p.body ?? "") !== (p.published_body ?? ""))
    return {
      label: "Published · unpublished changes",
      tone: "bg-amber-100 text-amber-800",
    };
  return { label: "Published", tone: "bg-green-100 text-green-700" };
}

export default async function AdminPoliciesPage() {
  await requireContentEditor();
  const supabase = createClient();

  const [
    { data: policies },
    { data: services },
    { data: links },
    categories,
  ] = await Promise.all([
    supabase
      .from("policies")
      .select(
        "id, name, status, is_parent_facing, body, published_body, published_version, source_document_id, service_id",
      )
      .order("name"),
    supabase.from("services").select("id, name"),
    supabase.from("policy_sop_links").select("policy_id"),
    policyCategories(supabase),
  ]);

  const rows = (policies ?? []) as PolicyRow[];
  const catByPolicy = await policyCategoryLinks(
    supabase,
    rows.map((p) => p.id),
  );

  const serviceName = new Map((services ?? []).map((s) => [s.id, s.name]));
  const linkCount = new Map<string, number>();
  for (const l of links ?? [])
    linkCount.set(l.policy_id, (linkCount.get(l.policy_id) ?? 0) + 1);

  const publishedCount = rows.filter((p) => p.published_version).length;

  // Group by category. A policy in more than one appears under each. Anything
  // with no category falls into a trailing "Uncategorised" group.
  const groups: { key: string; label: string; rows: PolicyRow[] }[] =
    categories.map((c) => ({ key: c.id, label: c.name, rows: [] }));
  const uncategorised: PolicyRow[] = [];
  for (const p of rows) {
    const cats = catByPolicy.get(p.id) ?? [];
    if (cats.length === 0) uncategorised.push(p);
    for (const cid of cats) {
      groups.find((g) => g.key === cid)?.rows.push(p);
    }
  }
  if (uncategorised.length)
    groups.push({ key: "none", label: "Uncategorised", rows: uncategorised });

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Policies</h1>
        <div className="flex gap-2">
          <Link
            href="/admin/policies/bulk"
            className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Bulk upload
          </Link>
          <Link
            href="/admin/policies/new"
            className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white"
          >
            New policy
          </Link>
        </div>
      </div>

      <p className="mt-1 text-sm text-slate-500">
        {rows.length} policies · {publishedCount} published
      </p>

      <div className="mt-6 space-y-8">
        {groups
          .filter((g) => g.rows.length > 0)
          .map((g) => (
            <section key={g.key}>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                {g.label}
                <span className="ml-2 font-normal text-slate-400">
                  {g.rows.length}
                </span>
              </h2>
              <ul className="mt-2 divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
                {g.rows.map((p) => {
                  const s = statusOf(p);
                  const sopN = linkCount.get(p.id) ?? 0;
                  return (
                    <li key={p.id}>
                      <Link
                        href={`/admin/policies/${p.id}`}
                        className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-slate-50"
                      >
                        <div className="min-w-0">
                          <div className="text-sm font-medium">
                            {p.name}
                            {p.is_parent_facing && (
                              <span className="ml-2 rounded-full bg-purple-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-purple-700">
                                Parent-facing
                              </span>
                            )}
                          </div>
                          <div className="mt-0.5 text-xs text-slate-400">
                            {p.service_id
                              ? `${serviceName.get(p.service_id) ?? "one site"} only`
                              : "all sites"}
                            {sopN > 0 &&
                              ` · ${sopN} procedure${sopN === 1 ? "" : "s"}`}
                          </div>
                        </div>
                        <span
                          className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${s.tone}`}
                        >
                          {s.label}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
      </div>
    </div>
  );
}
