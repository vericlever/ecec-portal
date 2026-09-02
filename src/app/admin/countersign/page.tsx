import { requireManager } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { CountersignRow } from "./countersign-row";

export const dynamic = "force-dynamic";

export default async function CountersignPage() {
  const me = await requireManager();
  const supabase = createClient();

  // RLS limits sign_offs to the manager's own service.
  const { data: pending } = await supabase
    .from("sign_offs")
    .select("id, user_id, sop_id, signed_at")
    .is("verified_at", null)
    .order("signed_at", { ascending: true });

  const rows = (pending ?? []).filter((r) => r.user_id !== me.id);
  const sopIds = [...new Set(rows.map((r) => r.sop_id))];
  const userIds = [...new Set(rows.map((r) => r.user_id))];

  const [{ data: sops }, { data: profiles }] = await Promise.all([
    sopIds.length
      ? supabase.from("sops").select("id, name, signoff_type").in("id", sopIds)
      : Promise.resolve({ data: [] }),
    userIds.length
      ? supabase.from("profiles").select("id, full_name").in("id", userIds)
      : Promise.resolve({ data: [] }),
  ]);

  const sopById = new Map((sops ?? []).map((s) => [s.id, s]));
  const nameById = new Map((profiles ?? []).map((p) => [p.id, p.full_name]));

  const queue = rows
    .filter((r) => sopById.get(r.sop_id)?.signoff_type === "self_and_manager")
    .map((r) => ({
      id: r.id,
      staffName: nameById.get(r.user_id) ?? "Unknown",
      sopName: sopById.get(r.sop_id)?.name ?? "SOP",
      signedAt: r.signed_at as string,
    }));

  return (
    <div>
      <h1 className="text-xl font-semibold">SOP countersigning</h1>
      <p className="mt-1 max-w-prose text-sm text-slate-500">
        SOPs that need a manager to sign alongside the staff member. Staff at
        your service who have signed but are still waiting on you.
      </p>

      {queue.length === 0 ? (
        <p className="mt-6 text-sm text-slate-500">Nothing is waiting.</p>
      ) : (
        <ul className="mt-6 divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
          {queue.map((q) => (
            <CountersignRow
              key={q.id}
              id={q.id}
              staffName={q.staffName}
              sopName={q.sopName}
              signedAt={q.signedAt}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
