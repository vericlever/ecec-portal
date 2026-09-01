"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { bulkImportPolicies, type BulkOutcome } from "../actions";

export function BulkUpload() {
  const [files, setFiles] = useState<File[]>([]);
  const [outcomes, setOutcomes] = useState<BulkOutcome[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  function run() {
    if (files.length === 0) return;
    const fd = new FormData();
    for (const f of files) fd.append("files", f);
    start(async () => {
      setError(null);
      const r = await bulkImportPolicies(fd);
      if (r.ok) {
        setOutcomes(r.outcomes);
        setFiles([]);
        if (inputRef.current) inputRef.current.value = "";
      } else {
        setError(r.error);
      }
    });
  }

  const created = outcomes?.filter((o) => o.outcome === "created").length ?? 0;
  const attached = outcomes?.filter((o) => o.outcome === "attached").length ?? 0;
  const failed = outcomes?.filter((o) => o.outcome === "error").length ?? 0;

  return (
    <div className="mt-6">
      <div className="rounded-lg border border-slate-200 bg-white p-4">
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
        <button
          type="button"
          disabled={files.length === 0 || pending}
          onClick={run}
          className="mt-3 rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40"
        >
          {pending
            ? "Uploading…"
            : `Import ${files.length || ""} ${files.length === 1 ? "file" : "files"}`.trim()}
        </button>
      </div>

      {error && (
        <p className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      )}

      {outcomes && (
        <div className="mt-4">
          <p className="text-sm">
            {created} created · {attached} attached to existing
            {failed > 0 && (
              <>
                {" · "}
                <span className="font-medium text-red-700">{failed}</span> failed
              </>
            )}
          </p>
          <ul className="mt-3 divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white text-sm">
            {outcomes.map((o, i) => (
              <li key={i} className="px-4 py-2.5">
                <div className="flex items-center justify-between gap-3">
                  <span className="min-w-0 truncate">
                    <span className="font-medium">{o.policyName}</span>{" "}
                    <span className="text-slate-400">· {o.fileName}</span>
                  </span>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                      o.outcome === "error"
                        ? "bg-red-100 text-red-700"
                        : o.outcome === "attached"
                          ? "bg-blue-100 text-blue-700"
                          : "bg-green-100 text-green-700"
                    }`}
                  >
                    {o.outcome === "attached" ? "Attached" : o.outcome === "created" ? "Created" : "Failed"}
                  </span>
                </div>
                {o.detail && (
                  <p className="mt-1 text-xs text-slate-500">{o.detail}</p>
                )}
              </li>
            ))}
          </ul>
          <p className="mt-4 text-sm">
            <Link
              href="/admin/policies"
              className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700"
            >
              Back to policies to review and publish
            </Link>
          </p>
        </div>
      )}
    </div>
  );
}
