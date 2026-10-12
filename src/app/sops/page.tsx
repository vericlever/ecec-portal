import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";
import { assignedJobRoles, assignedRoleDates } from "@/lib/staff-job-roles";
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

  const myRoles = await assignedJobRoles(supabase, profile.id);
  const roleIds = myRoles.map((r) => r.id);
  if (roleIds.length === 0) {
    return (
      <div>
        <h1 className="text-xl font-semibold">My Procedures</h1>
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

  const rank = (s: SopRow) =>
    state(s) !== "not_signed" ? 2 : clockOf(s) === "overdue" ? 0 : 1;

  function renderRow(sop: SopRow, keyPrefix: string) {
    const st = state(sop);
    const dueDate = st === "not_signed" ? due(sop) : null;
    const clock = st === "not_signed" ? clockOf(sop) : null;
    return (
      <li key={keyPrefix + sop.id}>
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
  }

  // One collapsible section per job role the person holds. A procedure that
  // sits in two of their roles is listed under both. The first section starts
  // open (most staff hold one role), the rest start closed.
  const sopsByRole = new Map<string, Set<string>>();
  for (const l of links) {
    const set = sopsByRole.get(l.job_role_id) ?? new Set<string>();
    set.add(l.sop_id);
    sopsByRole.set(l.job_role_id, set);
  }
  const groups = myRoles
    .map((r) => ({
      id: r.id,
      name: r.name,
      rows: rows
        .filter((s) => sopsByRole.get(r.id)?.has(s.id))
        .sort((a, b) => rank(a) - rank(b)),
    }))
    .filter((g) => g.rows.length > 0);


  return (
    <div>
      <h1 className="text-xl font-semibold">My Procedures</h1>
      {rows.length === 0 ? (
        <p className="mt-3 max-w-prose text-sm text-slate-500">
          There are no published procedures for your role yet.
        </p>
      ) : (
        <>
          <p className="mt-1 text-sm text-slate-500">
            {signedCount} of {rows.length} signed
          </p>
          <div className="mt-6 space-y-2">
            {groups.map((g, i) => {
              const signed = g.rows.filter((s) => state(s) === "signed").length;
              const overdue = g.rows.filter(
                (s) => state(s) === "not_signed" && clockOf(s) === "overdue",
              ).length;
              return (
                <details
                  key={g.id}
                  open={i === 0}
                  className="group rounded-lg border border-slate-200 bg-white"
                >
                  <summary className="flex cursor-pointer list-none flex-wrap items-center gap-2 px-4 py-3 text-sm font-semibold uppercase tracking-wide text-slate-600 hover:bg-slate-50 [&::-webkit-details-marker]:hidden">
                    <span
                      aria-hidden
                      className="inline-block text-slate-400 transition-transform group-open:rotate-90"
                    >
                      ›
                    </span>
                    {g.name}
                    <span className="font-normal normal-case tracking-normal text-slate-400">
                      {signed} of {g.rows.length} signed
                    </span>
                    {overdue > 0 && (
                      <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium normal-case tracking-normal text-red-700">
                        {overdue} overdue
                      </span>
                    )}
                  </summary>
                  <ul className="divide-y divide-slate-200 border-t border-slate-200">
                    {g.rows.map((sop) => renderRow(sop, g.id + ":"))}
                  </ul>
                </details>
              );
            })}
          </div>
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
