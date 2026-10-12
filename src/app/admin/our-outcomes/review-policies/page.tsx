import Link from "next/link";
import { requireManager } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { EditableReviewDate } from "../editable-review-date";

export const dynamic = "force-dynamic";

export default async function ReviewPoliciesPage() {
  const me = await requireManager();
  const supabase = createClient();

  const { data: policies } = await supabase
    .from("policies")
    .select("id, name")
    .eq("organisation_id", me.organisation_id!)
    .not("published_version", "is", null)
    .order("name");

  const { data: statusRows } = await supabase
    .from("policy_review_status")
    .select("policy_id, next_review_date");
  const nextReviewDateByPolicy = new Map(
    (statusRows ?? []).map((r) => [r.policy_id as string, r.next_review_date as string | null]),
  );

  const sorted = (policies ?? [])
    .map((p) => ({
      id: p.id as string,
      name: p.name as string,
      nextReviewDate: nextReviewDateByPolicy.get(p.id as string) ?? null,
    }))
    .sort((a, b) => {
      if (!a.nextReviewDate) return 1;
      if (!b.nextReviewDate) return -1;
      return a.nextReviewDate.localeCompare(b.nextReviewDate);
    });

  return (
    <div className="max-w-2xl">
      <h1 className="text-xl font-semibold">Review policies</h1>
      <p className="mt-1 text-sm text-slate-500">Sorted by next review date.</p>
      <ul className="mt-4 space-y-2">
        {sorted.map((p) => (
          <li
            key={p.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white p-3 text-sm"
          >
            <Link href={`/admin/policies/${p.id}`} className="font-medium text-slate-800 underline">
              {p.name}
            </Link>
            <EditableReviewDate itemType="policy" itemId={p.id} currentDate={p.nextReviewDate} />
          </li>
        ))}
      </ul>
    </div>
  );
}
