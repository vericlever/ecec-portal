import Link from "next/link";
import { requireContentEditor } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type PolicyRow = {
  id: string;
  name: string;
  status: string;
  document_type: string;
  is_parent_facing: boolean;
  body: string | null;
  published_body: string | null;
  published_version: number | null;
  source_document_id: string | null;
  service_id: string | null;
};

function statusOf(p: PolicyRow): { label: string; tone: "grey" | "amber" | "green" | "blue" } {
  if (p.status === "must_be_written") return { label: "To be written", tone: "amber" };
  if (p.status === "does_not_exist") return { label: "Does not exist", tone: "grey" };
  if (!p.published_version) {
    if (!p.body || !p.body.trim())
      return { label: "Needs a document", tone: "grey" };
    return { label: "Draft", tone: "blue" };
  }
  if ((p.body ?? "") !== (p.published_body ?? ""))
    return { label: "Published · unpublished changes", tone: "amber" };
  return { label: "Published", tone: "green" };
}

const TONE: Record<string, string> = {
  grey: "bg-slate-100 text-slate-500",
  amber: "bg-amber-100 text-amber-800",
  green: "bg-green-100 text-green-700",
  blue: "bg-blue-100 text-blue-700",
};

export default async function AdminPoliciesPage() {
  await requireContentEditor();
  const supabase = createClient();

  const [{ data: policies }, { data: services }, { data: links }, { data: audiences }] =
    await Promise.all([
      supabase
        .from("policies")
        .select(
          "id, name, status, document_type, is_parent_facing, body, published_body, published_version, source_document_id, service_id",
        )
        .order("name"),
      supabase.from("services").select("id, name"),
      supabase.from("policy_sop_links").select("policy_id"),
      supabase.from("policy_audiences").select("policy_id"),
    ]);

  const serviceName = new Map((services ?? []).map((s) => [s.id, s.name]));
  const linkCount = new Map<string, number>();
  for (const l of links ?? [])
    linkCount.set(l.policy_id, (linkCount.get(l.policy_id) ?? 0) + 1);
  const audienceCount = new Map<string, number>();
  for (const a of audiences ?? [])
    audienceCount.set(a.policy_id, (audienceCount.get(a.policy_id) ?? 0) + 1);

  const rows = (policies ?? []) as PolicyRow[];
  const publishedCount = rows.filter((p) => p.published_version).length;
  const needsDoc = rows.filter((p) => statusOf(p).label === "Needs a document").length;

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
        {needsDoc > 0 && ` · ${needsDoc} still need a document`}
      </p>

      <ul className="mt-6 divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
        {rows.map((p) => {
          const s = statusOf(p);
          const audiences = audienceCount.get(p.id) ?? 0;
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
                    {p.document_type}
                    {p.service_id
                      ? ` · ${serviceName.get(p.service_id) ?? "one site"} only`
                      : audiences > 0
                        ? " · targeted"
                        : " · all staff"}
                    {(linkCount.get(p.id) ?? 0) > 0 &&
                      ` · ${linkCount.get(p.id)} SOP${linkCount.get(p.id) === 1 ? "" : "s"}`}
                  </div>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${TONE[s.tone]}`}
                >
                  {s.label}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
