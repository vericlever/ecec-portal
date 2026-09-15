"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { REVIEW_PERIODS, REVIEW_PERIOD_LABELS } from "@/lib/constants";
import {
  NQS_QUALITY_AREAS,
  CHILD_SAFE_STANDARDS,
  MAX_QUALITY_AREAS,
  MAX_CHILD_SAFE_STANDARDS,
} from "@/lib/tags";
import { TagPicker } from "@/app/admin/_tags/tag-picker";
import type { PolicyCategory } from "@/lib/policy-categories";
import { stageBulkPolicies } from "../actions";
import { writeBulkPolicyDefaults, EMPTY_BULK_POLICY_DEFAULTS } from "./bulk-defaults";

export function BulkUpload({
  categories,
  services,
}: {
  categories: PolicyCategory[];
  services: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  const [defaults, setDefaults] = useState(EMPTY_BULK_POLICY_DEFAULTS);
  function patchDefaults(next: Partial<typeof defaults>) {
    setDefaults((cur) => ({ ...cur, ...next }));
  }

  function run() {
    if (files.length === 0) return;
    const fd = new FormData();
    for (const f of files) fd.append("files", f);
    start(async () => {
      setError(null);
      const r = await stageBulkPolicies(fd);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      writeBulkPolicyDefaults(r.batchId, defaults);
      const q = new URLSearchParams({ batch: r.batchId });
      if (r.failed) q.set("failed", String(r.failed));
      router.push(`/admin/policies/bulk/review?${q.toString()}`);
    });
  }

  return (
    <div className="mt-6 space-y-4">
      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <p className="mb-3 text-xs font-medium text-slate-500">
          Step 1 of 2 &middot; Select files
        </p>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".docx,.pdf,.txt,.md,.html,.htm"
          onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
          className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-md file:border file:border-slate-300 file:bg-slate-50 file:px-3 file:py-1.5 file:text-xs file:font-medium"
        />
        {files.length > 0 && (
          <p className="mt-2 text-xs text-slate-500">
            {files.length} file{files.length === 1 ? "" : "s"} selected
          </p>
        )}
        <p className="mt-3 text-xs text-slate-500">
          Nothing is created yet - the next page parses each file, flags likely
          duplicates and anything that still looks like a filename, and lets you
          set categories, site and review cadence before anything is saved.
        </p>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <p className="text-xs font-medium text-slate-500">
          Defaults for this batch (optional)
        </p>
        <p className="mt-1 text-xs text-slate-500">
          Applied to every file on the next page as a starting point - each one
          stays editable individually before you commit. The next review date
          is not defaulted here since the review page spreads those out for
          you one at a time.
        </p>

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div className="text-sm">
            <span className="text-xs font-medium text-slate-500">Categories</span>
            <div className="mt-1 space-y-1">
              {categories.map((c) => (
                <label key={c.id} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={defaults.categoryIds.includes(c.id)}
                    onChange={(e) =>
                      patchDefaults({
                        categoryIds: e.target.checked
                          ? [...defaults.categoryIds, c.id]
                          : defaults.categoryIds.filter((x) => x !== c.id),
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
                value={defaults.serviceId}
                onChange={(e) => patchDefaults({ serviceId: e.target.value })}
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
            <label className="block">
              <span className="text-xs font-medium text-slate-500">Then review every</span>
              <select
                value={defaults.reviewPeriod}
                onChange={(e) => patchDefaults({ reviewPeriod: Number(e.target.value) })}
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

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <TagPicker
            legend="NQS quality areas"
            options={NQS_QUALITY_AREAS}
            selectedIds={defaults.qualityAreaIds}
            max={MAX_QUALITY_AREAS}
            onToggle={(id, checked) =>
              patchDefaults({
                qualityAreaIds: checked
                  ? [...defaults.qualityAreaIds, id]
                  : defaults.qualityAreaIds.filter((x) => x !== id),
              })
            }
          />
          <TagPicker
            legend="Child safe standards"
            options={CHILD_SAFE_STANDARDS}
            selectedIds={defaults.childSafeStandardIds}
            max={MAX_CHILD_SAFE_STANDARDS}
            onToggle={(id, checked) =>
              patchDefaults({
                childSafeStandardIds: checked
                  ? [...defaults.childSafeStandardIds, id]
                  : defaults.childSafeStandardIds.filter((x) => x !== id),
              })
            }
          />
        </div>
      </div>

      <button
        type="button"
        disabled={files.length === 0 || pending}
        onClick={run}
        className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40"
      >
        {pending
          ? "Parsing…"
          : `Parse ${files.length || ""} ${files.length === 1 ? "file" : "files"} and review`.trim()}
      </button>

      {error && (
        <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
