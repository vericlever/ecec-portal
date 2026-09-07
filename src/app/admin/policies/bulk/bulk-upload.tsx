"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { PolicyCategory } from "@/lib/policy-categories";
import { bulkImportPolicies } from "../actions";

export function BulkUpload({ categories }: { categories: PolicyCategory[] }) {
  const router = useRouter();
  const [files, setFiles] = useState<File[]>([]);
  const [categoryIds, setCategoryIds] = useState<string[]>(
    categories.filter((c) => c.slug === "general").map((c) => c.id),
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  const toggle = (id: string) =>
    setCategoryIds((cur) =>
      cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id],
    );

  function run() {
    if (files.length === 0) return;
    const fd = new FormData();
    for (const f of files) fd.append("files", f);
    for (const id of categoryIds) fd.append("categoryIds", id);
    start(async () => {
      setError(null);
      const r = await bulkImportPolicies(fd);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      const ids = r.outcomes
        .filter((o) => o.outcome !== "error" && o.policyId)
        .map((o) => o.policyId as string);
      const errs = r.outcomes.filter((o) => o.outcome === "error");
      if (ids.length === 0) {
        setError(
          errs.length
            ? `No files could be uploaded. ${errs[0].detail ?? ""}`
            : "No files were uploaded.",
        );
        return;
      }
      const q = new URLSearchParams({ ids: ids.join(",") });
      if (errs.length) q.set("failed", String(errs.length));
      router.push(`/admin/policies/bulk/review?${q.toString()}`);
    });
  }

  return (
    <div className="mt-6">
      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <p className="mb-3 text-xs font-medium text-slate-500">
          Step 1 of 2 &middot; Select files and set the default categories
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

        <fieldset className="mt-3 text-sm">
          <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Default categories for the new policies
          </span>
          <p className="text-xs text-slate-500">
            You can adjust these per policy on the next page.
          </p>
          <div className="mt-1 space-y-1">
            {categories.map((c) => (
              <label key={c.id} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={categoryIds.includes(c.id)}
                  onChange={() => toggle(c.id)}
                />
                <span>{c.name}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <button
          type="button"
          disabled={files.length === 0 || pending}
          onClick={run}
          className="mt-3 rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40"
        >
          {pending
            ? "Uploading…"
            : `Upload ${files.length || ""} ${files.length === 1 ? "file" : "files"} and review`.trim()}
        </button>
      </div>

      {error && (
        <p className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
