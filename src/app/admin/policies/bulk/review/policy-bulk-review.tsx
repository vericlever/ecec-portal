"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { REVIEW_PERIODS, REVIEW_PERIOD_LABELS } from "@/lib/constants";
import type { PolicyCategory } from "@/lib/policy-categories";
import { finishBulkPolicies } from "../../actions";

type Row = {
  id: string;
  name: string;
  hasText: boolean;
  alreadyPublished: boolean;
  categoryIds: string[];
  reviewPeriod: number;
  nextReviewDate: string | null;
  linkedSopIds: string[];
};

type State = {
  categoryIds: string[];
  reviewPeriod: number;
  nextReviewDate: string;
  publish: boolean;
  linkedSopIds: string[];
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
  categories,
  sops,
}: {
  rows: Row[];
  categories: PolicyCategory[];
  sops: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    published: number;
    drafted: number;
    failed: { name: string; error: string }[];
  } | null>(null);

  const [state, setState] = useState<Record<string, State>>(() =>
    Object.fromEntries(
      rows.map((r, i) => [
        r.id,
        {
          categoryIds: r.categoryIds,
          reviewPeriod: REVIEW_PERIODS.includes(r.reviewPeriod as 3 | 6 | 12)
            ? r.reviewPeriod
            : 6,
          nextReviewDate: r.nextReviewDate ?? isoInDays(i * 7),
          publish: r.hasText,
          linkedSopIds: r.linkedSopIds,
        },
      ]),
    ),
  );

  const sopName = useMemo(
    () => new Map(sops.map((s) => [s.id, s.name])),
    [sops],
  );

  function patch(id: string, next: Partial<State>) {
    setState((cur) => ({ ...cur, [id]: { ...cur[id], ...next } }));
  }

  function spreadFromHere(id: string) {
    const idx = rows.findIndex((r) => r.id === id);
    if (idx < 0) return;
    const startVal = state[id].nextReviewDate;
    const base = /^\d{4}-\d{2}-\d{2}$/.test(startVal)
      ? new Date(startVal)
      : new Date();
    setState((cur) => {
      const nextState = { ...cur };
      rows.forEach((r, i) => {
        if (i < idx) return;
        const d = new Date(base);
        d.setDate(d.getDate() + (i - idx) * 7);
        nextState[r.id] = {
          ...nextState[r.id],
          nextReviewDate: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`,
        };
      });
      return nextState;
    });
  }

  const publishCount = rows.filter(
    (r) => state[r.id]?.publish && r.hasText,
  ).length;

  function run() {
    start(async () => {
      setError(null);
      const items = rows.map((r) => ({
        policyId: r.id,
        categoryIds: state[r.id].categoryIds,
        reviewPeriod: state[r.id].reviewPeriod,
        nextReviewDate: state[r.id].nextReviewDate,
        linkedSopIds: state[r.id].linkedSopIds,
        publish: state[r.id].publish && r.hasText,
      }));
      const res = await finishBulkPolicies(items);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setResult(res);
      router.refresh();
    });
  }

  if (result) {
    return (
      <div className="mt-6 space-y-4">
        <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-800">
          <p className="font-medium">
            {result.published} polic{result.published === 1 ? "y" : "ies"}{" "}
            published
            {result.drafted > 0 && (
              <>
                {" "}
                &middot; {result.drafted} kept as{" "}
                {result.drafted === 1 ? "a draft" : "drafts"}
              </>
            )}
          </p>
          {result.published > 0 && (
            <p className="mt-1">Staff can see the published policies now.</p>
          )}
        </div>
        {result.failed.length > 0 && (
          <ul className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {result.failed.map((f, i) => (
              <li key={i}>
                <span className="font-medium">{f.name}</span>: {f.error}
              </li>
            ))}
          </ul>
        )}
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
        const s = state[r.id];
        const linkable = sops.filter((p) => !s.linkedSopIds.includes(p.id));
        return (
          <div
            key={r.id}
            className="rounded-lg border border-slate-200 bg-white p-4"
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-medium text-slate-800">{r.name}</p>
                <div className="mt-1 flex flex-wrap gap-2 text-xs">
                  {r.hasText ? (
                    <span className="rounded-full bg-green-100 px-2 py-0.5 font-medium text-green-700">
                      Text ready
                    </span>
                  ) : (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 font-medium text-amber-800">
                      No text found &middot; stays a draft
                    </span>
                  )}
                  {r.alreadyPublished && (
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-600">
                      Publishing a new version
                    </span>
                  )}
                </div>
              </div>
              <label className="flex items-center gap-1.5 text-sm">
                <input
                  type="checkbox"
                  checked={s.publish && r.hasText}
                  disabled={!r.hasText}
                  onChange={(e) => patch(r.id, { publish: e.target.checked })}
                />
                Publish
              </label>
            </div>

            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div className="text-sm">
                <span className="text-xs font-medium text-slate-500">
                  Categories
                </span>
                <div className="mt-1 space-y-1">
                  {categories.map((c) => (
                    <label key={c.id} className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={s.categoryIds.includes(c.id)}
                        onChange={(e) =>
                          patch(r.id, {
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
                <div>
                  <span className="text-xs font-medium text-slate-500">
                    Next review date
                  </span>
                  <div className="mt-1 flex items-center gap-2">
                    <input
                      type="date"
                      value={s.nextReviewDate}
                      onChange={(e) =>
                        patch(r.id, { nextReviewDate: e.target.value })
                      }
                      className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => spreadFromHere(r.id)}
                      className="text-xs text-slate-500 underline hover:text-slate-800"
                      title="Set this date here and step every policy below it a week later"
                    >
                      Spread from here
                    </button>
                  </div>
                </div>
                <label className="block">
                  <span className="text-xs font-medium text-slate-500">
                    Then review every
                  </span>
                  <select
                    value={s.reviewPeriod}
                    onChange={(e) =>
                      patch(r.id, { reviewPeriod: Number(e.target.value) })
                    }
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
              <span className="text-xs font-medium text-slate-500">
                Linked SOPs
              </span>
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                {s.linkedSopIds.map((sid) => (
                  <span
                    key={sid}
                    className="flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700"
                  >
                    {sopName.get(sid) ?? "SOP"}
                    <button
                      type="button"
                      onClick={() =>
                        patch(r.id, {
                          linkedSopIds: s.linkedSopIds.filter((x) => x !== sid),
                        })
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
                      patch(r.id, {
                        linkedSopIds: [...s.linkedSopIds, e.target.value],
                      });
                    }}
                    className="rounded-md border border-slate-300 px-2 py-1 text-xs"
                  >
                    <option value="">Link a SOP…</option>
                    {linkable.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </div>
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
          onClick={run}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
        >
          {pending ? "Publishing…" : `Publish ${publishCount} and save all`}
        </button>
        <span className="text-xs text-slate-500">
          {rows.length} polic{rows.length === 1 ? "y" : "ies"} in this batch
        </span>
      </div>
    </div>
  );
}
