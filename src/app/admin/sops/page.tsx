import Link from "next/link";
import { requireContentEditor } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { SOP_TIER_LABELS } from "@/lib/constants";

export const dynamic = "force-dynamic";

type SopRow = {
  id: string;
  name: string;
  target_tier: string | null;
  signoff_type: string;
  priority: number | null;
  body: string | null;
  published_body: string | null;
  published_version: number | null;
  service_id: string | null;
};

function statusOf(s: SopRow): { label: string; tone: "grey" | "amber" | "green" | "blue" } {
  if (!s.published_version) {
    if (!s.body || !s.body.trim()) return { label: "Needs content", tone: "grey" };
    return { label: "Draft", tone: "blue" };
  }
  if ((s.body ?? "") !== (s.published_body ?? ""))
    return { label: "Published · unpublished changes", tone: "amber" };
  return { label: "Published", tone: "green" };
}

const TONE: Record<string, string> = {
  grey: "bg-slate-100 text-slate-500",
  amber: "bg-amber-100 text-amber-800",
  green: "bg-green-100 text-green-700",
  blue: "bg-blue-100 text-blue-700",
};

export default async function AdminSopsPage() {
  await requireContentEditor();
  const supabase = createClient();

  const [{ data: sops }, { data: services }, { data: roleLinks }] =
    await Promise.all([
      supabase
        .from("sops")
        .select(
          "id, name, target_tier, signoff_type, priority, body, published_body, published_version, service_id",
        )
        .order("name"),
      supabase.from("services").select("id, name"),
      supabase.from("job_role_sops").select("sop_id"),
    ]);

  const serviceName = new Map((services ?? []).map((s) => [s.id, s.name]));
  const roleCount = new Map<string, number>();
  for (const l of roleLinks ?? [])
    roleCount.set(l.sop_id, (roleCount.get(l.sop_id) ?? 0) + 1);

  const rows = (sops ?? []) as SopRow[];
  const publishedCount = rows.filter((s) => s.published_version).length;
  const needsContent = rows.filter((s) => statusOf(s).label === "Needs content").length;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">SOPs</h1>
        <div className="flex gap-2">
          <Link
            href="/admin/sops/bulk"
            className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Bulk upload
          </Link>
          <Link
            href="/admin/sops/new"
            className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white"
          >
            New SOP
          </Link>
        </div>
      </div>

      <p className="mt-1 text-sm text-slate-500">
        {rows.length} SOPs · {publishedCount} published
        {needsContent > 0 && ` · ${needsContent} still need content`}
      </p>

      <ul className="mt-6 divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
        {rows.map((s) => {
          const st = statusOf(s);
          const roles = roleCount.get(s.id) ?? 0;
          return (
            <li key={s.id}>
              <Link
                href={`/admin/sops/${s.id}`}
                className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-slate-50"
              >
                <div className="min-w-0">
                  <div className="text-sm font-medium">
                    {s.name}
                    {s.signoff_type === "self_and_manager" && (
                      <span className="ml-2 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-800">
                        Manager co-sign
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 text-xs text-slate-400">
                    {s.target_tier
                      ? (SOP_TIER_LABELS[s.target_tier] ?? s.target_tier)
                      : "no category"}
                    {s.service_id
                      ? ` · ${serviceName.get(s.service_id) ?? "one site"} only`
                      : ""}
                    {roles > 0
                      ? ` · ${roles} job role${roles === 1 ? "" : "s"}`
                      : " · not in any role"}
                  </div>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${TONE[st.tone]}`}
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
