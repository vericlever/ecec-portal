"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { REVIEW_PERIODS, REVIEW_PERIOD_LABELS } from "@/lib/constants";
import type { PolicyCategory } from "@/lib/policy-categories";
import {
  NQS_QUALITY_AREAS,
  CHILD_SAFE_STANDARDS,
  MAX_QUALITY_AREAS,
  MAX_CHILD_SAFE_STANDARDS,
} from "@/lib/tags";
import { TagSelect } from "@/app/admin/_tags/tag-select";
import { finishBulkPolicies, discardBulkPolicyBatch } from "../../actions";
import { readBulkPolicyDefaults } from "../bulk-defaults";

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
  categoryIds: string[];
  serviceId: string;
  reviewPeriod: number;
  nextReviewDate: string;
  publish: boolean;
  linkedSopIds: string[];
  qualityAreaIds: number[];
  childSafeStandardIds: number[];
};

function isoInDays(days: number): string {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

export function PolicyBulkReview({
  rows,
  batchId,
  categories,
  sops,
  services,
}: {
  rows: Row[];
  batchId: string;
  categories: PolicyCategory[];
  sops: { id: string; name: string }[];
  services: { id: string; name: string }[];
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
    const defaults = readBulkPolicyDefaults(batchId);
    const defaultCategoryIds =
      defaults.categoryIds.length > 0
        ? defaults.categoryIds
        : categories.filter((c) => c.slug === "general").map((c) => c.id);
    return Object.fromEntries(
      rows.map((r, i) => [
        r.stagingId,
        {
          title: r.title,
          action: (r.duplicateOfId ? "skip" : "create") as Action,
          categoryIds: [...defaultCategoryIds],
          serviceId: defaults.serviceId,
          reviewPeriod: defaults.reviewPeriod,
          nextReviewDate: isoInDays(i * 7),
          publish: r.hasText && !r.duplicateOfId,
          linkedSopIds: [] as string[],
          qualityAreaIds: [...defaults.qualityAreaIds],
          childSafeStandardIds: [...defaults.childSafeStandardIds],
        },
      ]),
    );
  });

  const sopName = useMemo(() => new Map(sops.map((s) => [s.id, s.name])), [sops]);

  function patch(id: string, next: Partial<State>) {
    setState((cur) => ({ ...cur, [id]: { ...cur[id], ...next } }));
  }

  function spreadFromHere(id: string) {
    const idx = rows.findIndex((r) => r.stagingId === id);
    if (idx < 0) return;
    const startVal = state[id].nextReviewDate;
    const base = /^\d{4}-\d{2}-\d{2}$/.test(startVal) ? new Date(startVal) : new Date();
    setState((cur) => {
      const nextState = { ...cur };
      rows.forEach((r, i) => {
        if (i < idx) return;
        const d = new Date(base);
        d.setDate(d.getDate() + (i - idx) * 7);
        nextState[r.stagingId] = {
          ...nextState[r.stagingId],
          nextReviewDate: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`,
        };
      });
      return nextState;
    });
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
          categoryIds: s.categoryIds,
          serviceId: s.serviceId || null,
          reviewPeriod: s.reviewPeriod,
          nextReviewDate: s.nextReviewDate,
          linkedSopIds: s.linkedSopIds,
          qualityAreaIds: s.qualityAreaIds,
          childSafeStandardIds: s.childSafeStandardIds,
          publish: s.publish && r.hasText,
          replaceTargetId: s.action === "replace" ? r.duplicateOfId : null,
        };
      });
      const res = await finishBulkPolicies(items);
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
      await discardBulkPolicyBatch(batchId);
      router.push("/admin/policies/bulk");
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
            href="/admin/policies"
            className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white"
          >
            Go to policies
          </Link>
          <Link
            href="/admin/policies/bulk"
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
        const linkable = sops.filter((p) => !s.linkedSopIds.includes(p.id));
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
                </div>
                {r.extractionNote && (
                  <p className="mt-1 text-xs text-amber-700">{r.extractionNote}</p>
                )}
              </div>
            </div>

            {r.duplicateOfId && (
              <div className="mt-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm">
                <p className="font-medium text-amber-900">
                  Looks like an existing policy: &ldquo;{r.duplicateOfName}&rdquo;
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
                    <span className="text-xs font-medium text-slate-500">Categories</span>
                    <div className="mt-1 space-y-1">
                      {categories.map((c) => (
                        <label key={c.id} className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={s.categoryIds.includes(c.id)}
                            onChange={(e) =>
                              patch(r.stagingId, {
                                categoryIds: e.target.checked
                                  ? [...s.categoryIds, c.id]
                                  : s.categoryIds.filter((x) => x !== c.id),
                              })
                            }
                          />
                          <span>{c.name}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-3 text-sm">
                    <label className="block">
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
                    <div>
                      <span className="text-xs font-medium text-slate-500">Next review date</span>
                      <div className="mt-1 flex items-center gap-2">
                        <input
                          type="date"
                          value={s.nextReviewDate}
                          onChange={(e) => patch(r.stagingId, { nextReviewDate: e.target.value })}
                          className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                        />
                        <button
                          type="button"
                          onClick={() => spreadFromHere(r.stagingId)}
                          className="text-xs text-slate-500 underline hover:text-slate-800"
                          title="Set this date here and step every policy below it a week later"
                        >
                          Spread from here
                        </button>
                      </div>
                    </div>
                    <label className="block">
                      <span className="text-xs font-medium text-slate-500">Then review every</span>
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
                  </div>
                </div>

                <div className="mt-3 text-sm">
                  <span className="text-xs font-medium text-slate-500">Linked Procedures</span>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    {s.linkedSopIds.map((sid) => (
                      <span
                        key={sid}
                        className="flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700"
                      >
                        {sopName.get(sid) ?? "Procedure"}
                        <button
                          type="button"
                          onClick={() =>
                            patch(r.stagingId, { linkedSopIds: s.linkedSopIds.filter((x) => x !== sid) })
                          }
                          className="text-slate-400 hover:text-slate-700"
                          aria-label="Remove link"
                        >
                          &times;
                        </button>
                      </span>
                    ))}
                    {linkable.length > 0 && (
                      <select
                        value=""
                        onChange={(e) => {
                          if (!e.target.value) return;
                          patch(r.stagingId, { linkedSopIds: [...s.linkedSopIds, e.target.value] });
                        }}
                        className="rounded-md border border-slate-300 px-2 py-1 text-xs"
                      >
                        <option value="">Link a procedure…</option>
                        {linkable.map((p) => (
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
