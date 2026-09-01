import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { RegistryUploader } from "./uploader";

export const dynamic = "force-dynamic";

function fmt(v: string | null | undefined) {
  if (!v) return "never";
  return new Date(v).toLocaleString("en-AU", { dateStyle: "medium", timeStyle: "short" });
}

export default async function RegistryPage() {
  await requireAdmin();
  const supabase = createClient();

  const [rto, comp, refreshes] = await Promise.all([
    supabase.from("rto_registry").select("*", { count: "exact", head: true }),
    supabase.from("training_components").select("*", { count: "exact", head: true }),
    supabase
      .from("registry_refreshes")
      .select("kind, source, rows_seen, rows_upserted, ran_at")
      .order("ran_at", { ascending: false })
      .limit(8),
  ]);

  const lastRto = (refreshes.data ?? []).find((r) => r.kind === "rto");
  const lastComp = (refreshes.data ?? []).find((r) => r.kind === "component");

  return (
    <div>
      <Link href="/admin/staff" className="text-sm text-slate-500 hover:text-slate-900">
        ← Staff
      </Link>

      <h1 className="mt-3 text-xl font-semibold">Training register</h1>
      <p className="mt-1 max-w-prose text-sm text-slate-500">
        A local copy of the training.gov.au National Register, used to
        autocomplete RTO numbers and course codes during onboarding. Refresh it
        from a monthly bulk extract. Nothing here calls training.gov.au directly.
      </p>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Registered training organisations
          </div>
          <div className="mt-1 text-2xl font-semibold">{rto.count ?? 0}</div>
          <div className="mt-1 text-xs text-slate-500">
            Last refreshed {fmt(lastRto?.ran_at)}
          </div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Training components
          </div>
          <div className="mt-1 text-2xl font-semibold">{comp.count ?? 0}</div>
          <div className="mt-1 text-xs text-slate-500">
            Last refreshed {fmt(lastComp?.ran_at)}
          </div>
        </div>
      </div>

      <RegistryUploader />

      {(refreshes.data ?? []).length > 0 && (
        <div className="mt-8">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Recent refreshes
          </h2>
          <ul className="mt-2 divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white text-sm">
            {(refreshes.data ?? []).map((r, i) => (
              <li key={i} className="flex items-center justify-between px-4 py-2">
                <span>
                  {r.kind === "rto" ? "RTOs" : "Components"} · {r.source}
                </span>
                <span className="text-slate-500">
                  {r.rows_upserted} of {r.rows_seen} · {fmt(r.ran_at)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
