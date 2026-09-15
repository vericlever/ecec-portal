"use client";

import { useMemo, useRef, useState, useTransition } from "react";
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
import { TagPicker } from "@/app/admin/_tags/tag-picker";
import { stageBulkSops } from "../actions";
import { writeBulkSopDefaults, EMPTY_BULK_SOP_DEFAULTS } from "./bulk-defaults";

export function SopBulkUpload({
  jobRoles,
  services,
  categories,
}: {
  jobRoles: { id: string; name: string }[];
  services: { id: string; name: string }[];
  categories: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  const [defaults, setDefaults] = useState(EMPTY_BULK_SOP_DEFAULTS);
  function patchDefaults(next: Partial<typeof defaults>) {
    setDefaults((cur) => ({ ...cur, ...next }));
  }
  const addableRoles = useMemo(
    () => jobRoles.filter((jr) => !defaults.jobRoleIds.includes(jr.id)),
    [jobRoles, defaults.jobRoleIds],
  );
  const roleName = useMemo(() => new Map(jobRoles.map((r) => [r.id, r.name])), [jobRoles]);

  function run() {
    if (files.length === 0) return;
    const fd = new FormData();
    for (const f of files) fd.append("files", f);
    start(async () => {
      setError(null);
      const r = await stageBulkSops(fd);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      writeBulkSopDefaults(r.batchId, defaults);
      const q = new URLSearchParams({ batch: r.batchId });
      if (r.failed) q.set("failed", String(r.failed));
      router.push(`/admin/sops/bulk/review?${q.toString()}`);
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
          set job roles, category, site and sign-off details before anything is
          saved.
        </p>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <p className="text-xs font-medium text-slate-500">
          Defaults for this batch (optional)
        </p>
        <p className="mt-1 text-xs text-slate-500">
          Applied to every file on the next page as a starting point - each one
          stays editable individually before you commit.
        </p>

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div className="text-sm">
            <span className="text-xs font-medium text-slate-500">
              Job roles (who sees these procedures)
            </span>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              {defaults.jobRoleIds.map((rid) => (
                <span
                  key={rid}
                  className="flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700"
                >
                  {roleName.get(rid) ?? "Role"}
                  <button
                    type="button"
                    onClick={() =>
                      patchDefaults({
                        jobRoleIds: defaults.jobRoleIds.filter((x) => x !== rid),
                      })
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
                    patchDefaults({ jobRoleIds: [...defaults.jobRoleIds, e.target.value] });
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
              value={defaults.categoryId}
              onChange={(e) => patchDefaults({ categoryId: e.target.value })}
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
          <label className="block text-sm">
            <span className="text-xs font-medium text-slate-500">Review every</span>
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
          <label className="block text-sm">
            <span className="text-xs font-medium text-slate-500">Signing window</span>
            <select
              value={defaults.signingWindow}
              onChange={(e) =>
                patchDefaults({ signingWindow: cleanSigningWindow(e.target.value) as SopSigningWindow })
              }
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
