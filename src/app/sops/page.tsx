import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";
import { assignedJobRoleIds, assignedRoleDates } from "@/lib/staff-job-roles";
import {
  earliestRoleStartBySop,
  sopDueDate,
  dueSignoffPhrase,
  signingState,
} from "@/lib/signoff-clock";
import { cleanSigningWindow } from "@/lib/constants";
import { StageArc } from "@/components/bauhaus";
import { OutcomeFlagForm } from "@/app/home/outcome-flag-form";

export const dynamic = "force-dynamic";

type SopRow = {
  id: string;
  name: string;
  signoff_type: string | null;
  priority: number | null;
  signing_window: string | null;
  published_version: number;
  published_at: string | null;
};

export default async function SopListPage() {
  const profile = await requireProfile();
  const supabase = createClient();

  const roleIds = await assignedJobRoleIds(supabase, profile.id);
  if (roleIds.length === 0) {
    return (
      <div>
        <h1 className="text-xl font-semibold">Standard operating procedures</h1>
        <p className="mt-3 max-w-prose text-sm text-slate-500">
          You have not been assigned a job role yet, so you have no procedures to sign.
          Ask an administrator to set your job role.
        </p>
        <OutcomesSection sops={[]} />
      </div>
    );
  }

  const [{ data: roleLinks }, roleDates] = await Promise.all([
    supabase.from("job_role_sops").select("job_role_id, sop_id").in("job_role_id", roleIds),
    assignedRoleDates(supabase, profile.id),
  ]);
  const links = (roleLinks ?? []) as { job_role_id: string; sop_id: string }[];
  const sopIds = Array.from(new Set(links.map((l) => l.sop_id)));
  const roleStartBySop = earliestRoleStartBySop(links, roleDates);

  const [{ data: sops }, { data: signOffs }] = await Promise.all([
    sopIds.length
      ? supabase
          .from("sops")
          .select("id, name, signoff_type, priority, signing_window, published_version, published_at")
          .in("id", sopIds)
          .not("published_version", "is", null)
      : Promise.resolve({ data: [] }),
    supabase
      .from("sign_offs")
      .select("sop_id, sop_version, verified_at")
      .eq("user_id", profile.id),
  ]);

  const signOffFor = new Map(
    (signOffs ?? []).map((s) => [`${s.sop_id}:${s.sop_version}`, s]),
  );

  const rows = ((sops ?? []) as SopRow[])
    .slice()
    .sort(
      (a, b) =>
        (a.priority ?? 999) - (b.priority ?? 999) ||
        a.name.localeCompare(b.name),
    );

  function state(s: SopRow): "signed" | "awaiting_manager" | "not_signed" {
    const so = signOffFor.get(`${s.id}:${s.published_version}`);
    if (!so) return "not_signed";
    if (s.signoff_type === "self_and_manager" && !so.verified_at)
      return "awaiting_manager";
    return "signed";
  }

  function due(s: SopRow): Date | null {
    const start = roleStartBySop.get(s.id);
    if (!start) return null;
    return sopDueDate(
      start,
      s.published_at,
      cleanSigningWindow(s.signing_window),
      profile.signing_paused_days_banked,
    );
  }

  function clockOf(s: SopRow): "paused" | "overdue" | "due_soon" | "not_due" | null {
    const dueDate = due(s);
    if (!dueDate) return null;
    return signingState(dueDate, { paused: Boolean(profile.signing_paused_at) });
  }

  const signedCount = rows.filter((s) => state(s) === "signed").length;

  return (
    <div>
      <h1 className="text-xl font-semibold">Standard operating procedures</h1>
      {rows.length === 0 ? (
        <p className="mt-3 max-w-prose text-sm text-slate-500">
          There are no published procedures for your role yet.
        </p>
      ) : (
        <>
          <p className="mt-1 text-sm text-slate-500">
            {signedCount} of {rows.length} signed
          </p>
          <ul className="mt-6 divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
            {rows
              .slice()
              .sort((a, b) => {
                const rank = (s: SopRow) =>
                  state(s) !== "not_signed" ? 2 : clockOf(s) === "overdue" ? 0 : 1;
                return rank(a) - rank(b);
              })
              .map((sop) => {
                const st = state(sop);
                const dueDate = st === "not_signed" ? due(sop) : null;
                const clock = st === "not_signed" ? clockOf(sop) : null;
                return (
                  <li key={sop.id}>
                    <Link
                      href={`/sops/${sop.id}`}
                      className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-slate-50"
                    >
                      <span className="text-sm">{sop.name}</span>
                      <span className="flex shrink-0 items-center gap-2">
                        {clock === "paused" ? (
                          <span className="text-xs text-slate-400">Paused</span>
                        ) : (
                          dueDate && (
                            <span
                              className={
                                clock === "overdue"
                                  ? "text-xs font-medium text-red-700"
                                  : clock === "due_soon"
                                    ? "text-xs font-medium text-amber-700"
                                    : "text-xs text-slate-400"
                              }
                            >
                              {dueSignoffPhrase(dueDate)}
                            </span>
                          )
                        )}
                        {st === "signed" ? (
                          <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                            Signed
                          </span>
                        ) : st === "awaiting_manager" ? (
                          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                            Awaiting manager
                          </span>
                        ) : (
                          <span
                            className={
                              clock === "overdue"
                                ? "rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700"
                                : clock === "due_soon"
                                  ? "rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800"
                                  : "rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500"
                            }
                          >
                            Not signed
                          </span>
                        )}
                      </span>
                    </Link>
                  </li>
                );
              })}
          </ul>
        </>
      )}
      <OutcomesSection sops={rows.map((s) => ({ id: s.id, name: s.name }))} />
    </div>
  );
}

// Step: a second entry point to the same "My Outcomes" reflection, identical
// to the one on /home and feeding the same table (sop_outcome_flags) through
// the same server action - another chance to capture the signal without
// staff needing to go back to the dashboard for it.
function OutcomesSection({ sops }: { sops: { id: string; name: string }[] }) {
  return (
    <section className="mt-6 rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex items-center gap-2.5">
        <StageArc stage="outcomes" size={28} />
        <h2 className="text-sm font-semibold text-slate-800">My Outcomes</h2>
      </div>
      <OutcomeFlagForm sops={sops} />
    </section>
  );
}
