"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { SOP_TIER_LABELS, SOP_TIER_ORDER } from "@/lib/constants";
import { bulkImportSops } from "../actions";

export function SopBulkUpload({
  jobRoles,
}: {
  jobRoles: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [files, setFiles] = useState<File[]>([]);
  const [roleIds, setRoleIds] = useState<string[]>([]);
  const [signoffType, setSignoffType] = useState("self");
  const [category, setCategory] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  function run() {
    if (files.length === 0) return;
    const fd = new FormData();
    for (const f of files) fd.append("files", f);
    for (const r of roleIds) fd.append("newRoleIds", r);
    fd.append("newSignoffType", signoffType);
    if (category) fd.append("newCategory", category);
    start(async () => {
      setError(null);
      const r = await bulkImportSops(fd);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      const ids = r.outcomes
        .filter((o) => o.outcome !== "error" && o.sopId)
        .map((o) => o.sopId as string);
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
      router.push(`/admin/sops/bulk/review?${q.toString()}`);
    });
  }

  return (
    <div className="mt-6">
      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <p className="mb-3 text-xs font-medium text-slate-500">
          Step 1 of 2 &middot; Select files and set the defaults
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

        <div className="mt-4 space-y-3 border-t border-slate-100 pt-3">
          <p className="text-xs text-slate-500">
            The job roles and sign-off type apply only to files that do{" "}
            <span className="font-medium">not</span> match an existing SOP. A
            file that matches keeps that SOP&apos;s current job roles and
            sign-off type. You can change the category and review period per SOP
            on the next page.
          </p>
          <div>
            <span className="text-sm font-medium text-slate-700">
              Attach new SOPs to job roles
            </span>
            <p className="text-xs text-slate-500">
              This is what decides whether staff see the SOP.
            </p>
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
              {jobRoles.map((r) => (
                <label key={r.id} className="flex items-center gap-1.5 text-sm">
                  <input
                    type="checkbox"
                    checked={roleIds.includes(r.id)}
                    onChange={(e) =>
                      setRoleIds((cur) =>
                        e.target.checked
                          ? [...cur, r.id]
                          : cur.filter((x) => x !== r.id),
                      )
                    }
                  />
                  {r.name}
                </label>
              ))}
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="font-medium text-slate-700">
                Sign-off type for new SOPs
              </span>
              <select
                value={signoffType}
                onChange={(e) => setSignoffType(e.target.value)}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="self">Staff sign-off</option>
                <option value="self_and_manager">
                  Staff and manager sign-off
                </option>
              </select>
            </label>
            <label className="block text-sm">
              <span className="font-medium text-slate-700">
                Default category
              </span>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="">No category</option>
                {SOP_TIER_ORDER.map((t) => (
                  <option key={t} value={t}>
                    {SOP_TIER_LABELS[t]}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        <button
          type="button"
          disabled={files.length === 0 || pending}
          onClick={run}
          className="mt-4 rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40"
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
