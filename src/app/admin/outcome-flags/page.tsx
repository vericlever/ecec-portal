import Link from "next/link";
import { requireManager } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fmtReviewDate } from "@/lib/sop-review";

export const dynamic = "force-dynamic";

export default async function OutcomeFlagsPage() {
  await requireManager();
  const supabase = createClient();

  const { data: flags } = await supabase
    .from("sop_outcome_flags")
    .select("id, sop_id, reflection, created_at, flagged_by")
    .is("resolved_at", null)
    .order("created_at", { ascending: false });

  const sopIds = [...new Set((flags ?? []).map((f) => f.sop_id as string))];
  const flaggerIds = [...new Set((flags ?? []).map((f) => f.flagged_by as string))];
  const [{ data: sops }, { data: people }] = await Promise.all([
    sopIds.length
      ? supabase.from("sops").select("id, name").in("id", sopIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    flaggerIds.length
      ? supabase.from("profiles").select("id, full_name").in("id", flaggerIds)
      : Promise.resolve({ data: [] as { id: string; full_name: string }[] }),
  ]);
  const sopName = new Map((sops ?? []).map((s) => [s.id as string, s.name as string]));
  const personName = new Map((people ?? []).map((p) => [p.id as string, p.full_name as string]));

  const rows = (flags ?? []).map((f) => ({
    id: f.id as string,
    sopId: f.sop_id as string,
    sopName: sopName.get(f.sop_id as string) ?? "Unknown procedure",
    reflection: f.reflection as string,
    at: f.created_at as string,
    by: personName.get(f.flagged_by as string) ?? "A staff member",
  }));

  return (
    <div className="max-w-2xl">
      <h1 className="text-xl font-semibold">Staff outcome flags</h1>
      <p className="mt-1 text-sm text-slate-500">
        Reflections staff have raised on a procedure&apos;s child outcomes, waiting on
        that procedure&apos;s next review.
      </p>

      {rows.length === 0 ? (
        <p className="mt-6 text-sm text-slate-500">Nothing outstanding.</p>
      ) : (
        <ul className="mt-6 space-y-3">
          {rows.map((r) => (
            <li key={r.id} className="rounded-lg border border-slate-200 bg-white p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <Link
                  href={`/admin/sops/${r.sopId}/review`}
                  className="text-sm font-medium text-slate-800 underline"
                >
                  {r.sopName}
                </Link>
                <span className="text-xs text-slate-400">
                  {r.by} · {fmtReviewDate(r.at)}
                </span>
              </div>
              <p className="mt-1.5 text-sm text-slate-700">{r.reflection}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
