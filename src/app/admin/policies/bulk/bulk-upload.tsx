"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { stageBulkPolicies } from "../actions";

export function BulkUpload() {
  const router = useRouter();
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

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
      const q = new URLSearchParams({ batch: r.batchId });
      if (r.failed) q.set("failed", String(r.failed));
      router.push(`/admin/policies/bulk/review?${q.toString()}`);
    });
  }

  return (
    <div className="mt-6">
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

        <button
          type="button"
          disabled={files.length === 0 || pending}
          onClick={run}
          className="mt-3 rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40"
        >
          {pending
            ? "Parsing…"
            : `Parse ${files.length || ""} ${files.length === 1 ? "file" : "files"} and review`.trim()}
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
