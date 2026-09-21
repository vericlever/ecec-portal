"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  REVIEW_PERIODS,
  REVIEW_PERIOD_LABELS,
  SOP_SIGNING_WINDOWS,
  SOP_SIGNING_WINDOW_LABELS,
  cleanSigningWindow,
  type SopSigningWindow,
} from "@/lib/constants";
import {
  NQS_QUALITY_AREAS,
  CHILD_SAFE_STANDARDS,
  MAX_QUALITY_AREAS,
  MAX_CHILD_SAFE_STANDARDS,
} from "@/lib/tags";
import { TagSelect } from "@/app/admin/_tags/tag-select";
import { finishBulkSops, discardBulkSopBatch } from "../../actions";
import { readBulkSopDefaults } from "../bulk-defaults";

type Row = {
  stagingId: string;
  fileName: string;
  title: string;
  hasText: boolean;
  extractionNote: string | null;
  duplicateOfId: string | null;
  duplicateOfName: string | null;
  duplicateScore: number | null;
  filenameFlag: boolean;
  blankFlag: boolean;
  needsReview: boolean;
};

type Action = "create" | "skip" | "replace";

type State = {
  title: string;
  action: Action;
  jobRoleIds: string[];
  categoryId: string;
  serviceId: string;
  reviewPeriod: number;
  signingWindow: SopSigningWindow;
  linkedPolicyIds: string[];
  qualityAreaIds: number[];
  childSafeStandardIds: number[];
  publish: boolean;
};

export function SopBulkReview({
  rows,
  batchId,
  policies,
  jobRoles,
  services,
  categories,
}: {
  rows: Row[];
  batchId: string;
  policies: { id: string; name: string }[];
  jobRoles: { id: string; name: string }[];
  services: { id: string; name: string }[];
  categories: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    created: number;
    replaced: number;
    skipped: number;
    flagged: number;
  } | null>(null);

  const [state, setState] = useState<Record<string, State>>(() => {
    const defaults = readBulkSopDefaults(batchId);
    return Object.fromEntries(
      rows.map((r) => [
        r.stagingId,
        {
          title: r.title,
          // A flagged duplicate defaults to skip - the safer call when the
          // library might already have this content, per Step 47's intent
          // of protecting a dirty library rather than silently doubling it.
          action: (r.duplicateOfId ? "skip" : "create") as Action,
          jobRoleIds: [...defaults.jobRoleIds],
          categoryId: defaults.categoryId,
          serviceId: defaults.serviceId,
          reviewPeriod: defaults.reviewPeriod,
          signingWindow: defaults.signingWindow,
          linkedPolicyIds: [] as string[],
          qualityAreaIds: [...defaults.qualityAreaIds],
          childSafeStandardIds: [...defaults.childSafeStandardIds],
          publish: r.hasText && !r.duplicateOfId,
        },
      ]),
    );
  });

  const policyName = useMemo(() => new Map(policies.map((p) => [p.id, p.name])), [policies]);
  const roleName = useMemo(() => new Map(jobRoles.map((r) => [r.id, r.name])), [jobRoles]);

  function patch(id: string, next: Partial<State>) {
    setState((cur) => ({ ...cur, [id]: { ...cur[id], ...next } }));
  }

  const commitCount = rows.filter((r) => state[r.stagingId]?.action !== "skip").length;

  function commit() {
    start(async () => {
      setError(null);
      const items = rows.map((r) => {
        const s = state[r.stagingId];
        return {
          stagingId: r.stagingId,
          action: s.action,
          title: s.title,
          jobRoleIds: s.jobRoleIds,
          serviceId: s.serviceId || null,
          categoryId: s.categoryId || null,
          signoffType: "self",
          reviewPeriod: s.reviewPeriod,
          signingWindow: s.signingWindow,
          linkedPolicyIds: s.linkedPolicyIds,
          qualityAreaIds: s.qualityAreaIds,
          childSafeStandardIds: s.childSafeStandardIds,
          publish: s.publish && r.hasText,
          replaceTargetId: s.action === "replace" ? r.duplicateOfId : null,
        };
      });
      const res = await finishBulkSops(items);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setResult(res);
      router.refresh();
    });
  }

  function cancelBatch() {
    if (!confirm("Discard this whole batch? Nothing has been created yet, so this just clears it.")) return;
    start(async () => {
      await discardBulkSopBatch(batchId);
      router.push("/admin/sops/bulk");
    });
  }

  if (result) {
    return (
      <div className="mt-6 space-y-4">
        <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-800">
          <p className="font-medium">
            {result.created} created &middot; {result.replaced} replaced &middot;{" "}
            {result.skipped} skipped
          </p>
          <p className="mt-1">
            {result.flagged} row{result.flagged === 1 ? "" : "s"} had been flagged (duplicate,
            filename-style title, or no text) before you decided.
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/admin/sops"
            className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white"
          >
            Go to Procedures
          </Link>
          <Link
            href="/admin/sops/bulk"
            className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700"
          >
            Upload more
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-6 space-y-3">
      {rows.map((r) => {
        const s = state[r.stagingId];
        const linkablePolicies = policies.filter((p) => !s.linkedPolicyIds.includes(p.id));
        const addableRoles = jobRoles.filter((jr) => !s.jobRoleIds.includes(jr.id));
        const flagged = r.duplicateOfId || r.filenameFlag || r.blankFlag || r.needsReview;
        return (
          <div
            key={r.stagingId}
            className={`rounded-lg border p-4 ${flagged ? "border-amber-300 bg-amber-50/40" : "border-slate-200 bg-white"}`}
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <p className="text-xs text-slate-400">{r.fileName}</p>
                <input
                  value={s.title}
                  onChange={(e) => patch(r.stagingId, { title: e.target.value })}
                  className="mt-0.5 w-full rounded-md border border-slate-300 px-2 py-1 text-sm font-medium"
                />
                <div className="mt-1.5 flex flex-wrap gap-2 text-xs">
                  {r.hasText ? (
                    <span className="rounded-full bg-green-100 px-2 py-0.5 font-medium text-green-700">
                      Text ready
                    </span>
                  ) : (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 font-medium text-amber-800">
                      No text found &middot; stays a draft
                    </span>
                  )}
                  {r.blankFlag && (
                    <span className="rounded-full bg-red-100 px-2 py-0.5 font-medium text-red-700">
                      Blank content
                    </span>
                  )}
                  {r.filenameFlag && (
                    <span className="rounded-full bg-red-100 px-2 py-0.5 font-medium text-red-700">
                      Looks like a filename
                    </span>
                  )}
                  {r.needsReview && (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 font-medium text-amber-800">
                      Needs review
                    </span>
                  )}
                  {s.jobRoleIds.length === 0 && (
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-500">
                      No job role &middot; staff will not see it
                    </span>
                  )}
                </div>
                {r.extractionNote && (
                  <p className="mt-1 text-xs text-amber-700">{r.extractionNote}</p>
                )}
              </div>
            </div>

            {r.duplicateOfId && (
              <div className="mt-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm">
                <p className="font-medium text-amber-900">
                  Looks like an existing procedure: &ldquo;{r.duplicateOfName}&rdquo;
                  {r.duplicateScore != null ? ` (${Math.round(r.duplicateScore * 100)}% match)` : ""}
                </p>
                <div className="mt-2 flex flex-wrap gap-3">
                  {(["skip", "replace", "create"] as Action[]).map((a) => (
                    <label key={a} className="flex items-center gap-1.5 text-xs text-amber-900">
                      <input
                        type="radio"
                        name={`action-${r.stagingId}`}
                        checked={s.action === a}
                        onChange={() => patch(r.stagingId, { action: a })}
                      />
                      {a === "skip" ? "Skip this file" : a === "replace" ? "Replace the existing one" : "Create anyway"}
                    </label>
                  ))}
                </div>
              </div>
            )}

            {s.action !== "skip" && (
              <>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div className="text-sm">
                    <span className="text-xs font-medium text-slate-500">
                      Job roles (who sees this procedure)
                    </span>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      {s.jobRoleIds.map((rid) => (
                        <span
                          key={rid}
                          className="flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700"
                        >
                          {roleName.get(rid) ?? "Role"}
                          <button
                            type="button"
                            onClick={() =>
                              patch(r.stagingId, { jobRoleIds: s.jobRoleIds.filter((x) => x !== rid) })
                            }
                            className="text-slate-400 hover:text-slate-700"
                            aria-label="Remove job role"
                          >
                            &times;
                          </button>
                        </span>
                      ))}
                      {addableRoles.length > 0 && (
                        <select
                          value=""
                          onChange={(e) => {
                            if (!e.target.value) return;
                            patch(r.stagingId, { jobRoleIds: [...s.jobRoleIds, e.target.value] });
                          }}
                          className="rounded-md border border-slate-300 px-2 py-1 text-xs"
                        >
                          <option value="">Add a job role…</option>
                          {addableRoles.map((jr) => (
                            <option key={jr.id} value={jr.id}>
                              {jr.name}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                  </div>
                  <label className="block text-sm">
                    <span className="text-xs font-medium text-slate-500">Category</span>
                    <select
                      value={s.categoryId}
                      onChange={(e) => patch(r.stagingId, { categoryId: e.target.value })}
                      className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                    >
                      <option value="">None</option>
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <div className="mt-3 grid gap-3 sm:grid-cols-3">
                  <label className="block text-sm">
                    <span className="text-xs font-medium text-slate-500">Site</span>
                    <select
                      value={s.serviceId}
                      onChange={(e) => patch(r.stagingId, { serviceId: e.target.value })}
                      className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                    >
                      <option value="">All sites</option>
                      {services.map((sv) => (
                        <option key={sv.id} value={sv.id}>
                          {sv.name} only
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block text-sm">
                    <span className="text-xs font-medium text-slate-500">Review every</span>
                    <select
                      value={s.reviewPeriod}
                      onChange={(e) => patch(r.stagingId, { reviewPeriod: Number(e.target.value) })}
                      className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                    >
                      {REVIEW_PERIODS.map((p) => (
                        <option key={p} value={p}>
                          {REVIEW_PERIOD_LABELS[p]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block text-sm">
                    <span className="text-xs font-medium text-slate-500">Signing window</span>
                    <select
                      value={s.signingWindow}
                      onChange={(e) => patch(r.stagingId, { signingWindow: cleanSigningWindow(e.target.value) })}
                      className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                    >
                      {SOP_SIGNING_WINDOWS.map((p) => (
                        <option key={p} value={p}>
                          {SOP_SIGNING_WINDOW_LABELS[p]}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <div className="mt-3 text-sm">
                  <span className="text-xs font-medium text-slate-500">Linked policies</span>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    {s.linkedPolicyIds.map((pid) => (
                      <span
                        key={pid}
                        className="flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700"
                      >
                        {policyName.get(pid) ?? "Policy"}
                        <button
                          type="button"
                          onClick={() =>
                            patch(r.stagingId, { linkedPolicyIds: s.linkedPolicyIds.filter((x) => x !== pid) })
                          }
                          className="text-slate-400 hover:text-slate-700"
                          aria-label="Remove link"
                        >
                          &times;
                        </button>
                      </span>
                    ))}
                    {linkablePolicies.length > 0 && (
                      <select
                        value=""
                        onChange={(e) => {
                          if (!e.target.value) return;
                          patch(r.stagingId, { linkedPolicyIds: [...s.linkedPolicyIds, e.target.value] });
                        }}
                        className="rounded-md border border-slate-300 px-2 py-1 text-xs"
                      >
                        <option value="">Link a policy…</option>
                        {linkablePolicies.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                </div>

                <div className="mt-3 flex flex-col gap-3">
                  <TagSelect
                    legend="NQS quality areas"
                    options={NQS_QUALITY_AREAS}
                    selectedIds={s.qualityAreaIds}
                    max={MAX_QUALITY_AREAS}
                    onToggle={(id, checked) =>
                      patch(r.stagingId, {
                        qualityAreaIds: checked
                          ? [...s.qualityAreaIds, id]
                          : s.qualityAreaIds.filter((x) => x !== id),
                      })
                    }
                  />
                  <TagSelect
                    legend="Child safe standards"
                    options={CHILD_SAFE_STANDARDS}
                    selectedIds={s.childSafeStandardIds}
                    max={MAX_CHILD_SAFE_STANDARDS}
                    onToggle={(id, checked) =>
                      patch(r.stagingId, {
                        childSafeStandardIds: checked
                          ? [...s.childSafeStandardIds, id]
                          : s.childSafeStandardIds.filter((x) => x !== id),
                      })
                    }
                  />
                </div>

                <label className="mt-3 flex items-center gap-1.5 text-sm">
                  <input
                    type="checkbox"
                    checked={s.publish}
                    disabled={!r.hasText}
                    onChange={(e) => patch(r.stagingId, { publish: e.target.checked })}
                  />
                  Publish immediately
                </label>
              </>
            )}
          </div>
        );
      })}

      {error && (
        <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      )}

      <div className="flex items-center gap-3 pt-1">
        <button
          type="button"
          disabled={pending}
          onClick={commit}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
        >
          {pending ? "Committing…" : `Commit ${commitCount} and save all`}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={cancelBatch}
          className="rounded-md border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700 disabled:opacity-40"
        >
          Cancel batch
        </button>
        <span className="text-xs text-slate-500">
          {rows.length} file{rows.length === 1 ? "" : "s"} in this batch
        </span>
      </div>
    </div>
  );
}
