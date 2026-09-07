"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  REVIEW_PERIODS,
  REVIEW_PERIOD_LABELS,
  SOP_TIER_LABELS,
  SOP_TIER_ORDER,
} from "@/lib/constants";
import { finishBulkSops } from "../../actions";

type Row = {
  id: string;
  name: string;
  hasText: boolean;
  alreadyPublished: boolean;
  category: string;
  reviewPeriod: number;
  linkedPolicyIds: string[];
  roleCount: number;
};

type State = {
  category: string;
  reviewPeriod: number;
  publish: boolean;
  linkedPolicyIds: string[];
};

export function SopBulkReview({
  rows,
  policies,
}: {
  rows: Row[];
  policies: { id: string; name: string }[];
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
      rows.map((r) => [
        r.id,
        {
          category: r.category,
          reviewPeriod: REVIEW_PERIODS.includes(r.reviewPeriod as 3 | 6 | 12)
            ? r.reviewPeriod
            : 6,
          publish: r.hasText,
          linkedPolicyIds: r.linkedPolicyIds,
        },
      ]),
    ),
  );

  const policyName = useMemo(
    () => new Map(policies.map((p) => [p.id, p.name])),
    [policies],
  );

  function patch(id: string, next: Partial<State>) {
    setState((cur) => ({ ...cur, [id]: { ...cur[id], ...next } }));
  }

  const publishCount = rows.filter((r) => state[r.id]?.publish && r.hasText).length;

  function run() {
    start(async () => {
      setError(null);
      const items = rows.map((r) => ({
        sopId: r.id,
        category: state[r.id].category,
        reviewPeriod: state[r.id].reviewPeriod,
        linkedPolicyIds: state[r.id].linkedPolicyIds,
        publish: state[r.id].publish && r.hasText,
      }));
      const res = await finishBulkSops(items);
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
            {result.published} SOP{result.published === 1 ? "" : "s"} published
            {result.drafted > 0 && (
              <>
                {" "}
                &middot; {result.drafted} kept as{" "}
                {result.drafted === 1 ? "a draft" : "drafts"}
              </>
            )}
          </p>
          {result.published > 0 && (
            <p className="mt-1">
              Staff in the attached job roles can see the published SOPs now.
            </p>
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
            href="/admin/sops"
            className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white"
          >
            Go to SOPs
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
        const s = state[r.id];
        const linkable = policies.filter(
          (p) => !s.linkedPolicyIds.includes(p.id),
        );
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
                  {r.roleCount === 0 && (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 font-medium text-amber-800">
                      No job role &middot; staff will not see it
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
              <label className="block text-sm">
                <span className="text-xs font-medium text-slate-500">
                  Category
                </span>
                <select
                  value={s.category}
                  onChange={(e) => patch(r.id, { category: e.target.value })}
                  className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                >
                  <option value="">No category</option>
                  {SOP_TIER_ORDER.map((t) => (
                    <option key={t} value={t}>
                      {SOP_TIER_LABELS[t]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                <span className="text-xs font-medium text-slate-500">
                  Review period
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

            <div className="mt-3 text-sm">
              <span className="text-xs font-medium text-slate-500">
                Linked policies
              </span>
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
                        patch(r.id, {
                          linkedPolicyIds: s.linkedPolicyIds.filter(
                            (x) => x !== pid,
                          ),
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
                        linkedPolicyIds: [...s.linkedPolicyIds, e.target.value],
                      });
                    }}
                    className="rounded-md border border-slate-300 px-2 py-1 text-xs"
                  >
                    <option value="">Link a policy…</option>
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
          {pending
            ? "Publishing…"
            : `Publish ${publishCount} and save all`}
        </button>
        <span className="text-xs text-slate-500">
          {rows.length} SOP{rows.length === 1 ? "" : "s"} in this batch
        </span>
      </div>
    </div>
  );
}
