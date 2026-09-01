"use client";

import { useRef, useState, useTransition } from "react";
import {
  previewImport,
  runImport,
  type ImportFormat,
  type ImportResultRow,
  type PreviewResult,
  type RunResult,
} from "./actions";

export function ImportClient() {
  const [text, setText] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string>("");
  const [format, setFormat] = useState<ImportFormat>("csv");
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [result, setResult] = useState<RunResult | null>(null);
  const [pending, start] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    setPreview(null);
    setResult(null);
    if (!file) {
      setText(null);
      setFileName("");
      return;
    }
    setFileName(file.name);
    setFormat(file.name.toLowerCase().endsWith(".json") ? "json" : "csv");
    file.text().then(setText);
  }

  function check() {
    if (text == null) return;
    setResult(null);
    start(async () => setPreview(await previewImport(text, format)));
  }

  function doImport() {
    if (text == null) return;
    start(async () => {
      const r = await runImport(text, format);
      setResult(r);
      setPreview(null);
    });
  }

  function downloadPasswords() {
    if (!result || !result.ok) return;
    const created = result.rows.filter((r) => r.outcome === "created");
    const csv =
      "email,temporary_password,name\r\n" +
      created
        .map((r) => `${r.email},${r.tempPassword ?? ""},"${r.name.replace(/"/g, '""')}"`)
        .join("\r\n") +
      "\r\n";
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "vericlever-new-staff-passwords.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="mt-6">
      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <label className="block text-sm font-medium text-slate-700">
          Import file
        </label>
        <input
          ref={fileRef}
          type="file"
          accept=".csv,.json,.txt,text/csv,application/json"
          onChange={onFile}
          className="mt-2 block w-full text-sm text-slate-600 file:mr-3 file:rounded-md file:border file:border-slate-300 file:bg-slate-50 file:px-3 file:py-1.5 file:text-xs file:font-medium"
        />
        {fileName && (
          <p className="mt-2 text-xs text-slate-500">
            {fileName} · reading as {format === "json" ? "JSON" : "CSV"}
          </p>
        )}
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            disabled={text == null || pending}
            onClick={check}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 disabled:opacity-40"
          >
            {pending && !result ? "Checking…" : "Check file"}
          </button>
          {preview?.ok && preview.validCount > 0 && (
            <button
              type="button"
              disabled={pending}
              onClick={doImport}
              className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40"
            >
              {pending ? "Importing…" : `Import ${preview.validCount} staff`}
            </button>
          )}
        </div>
      </div>

      {preview && !preview.ok && (
        <p className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {preview.error}
        </p>
      )}

      {preview?.ok && (
        <div className="mt-4">
          <p className="text-sm">
            <span className="font-medium">{preview.validCount}</span> ready to
            import
            {preview.errorCount > 0 && (
              <>
                {" · "}
                <span className="font-medium text-red-700">
                  {preview.errorCount}
                </span>{" "}
                with problems
              </>
            )}
          </p>
          <RowTable
            rows={preview.rows.map((r) => ({
              line: r.line,
              name: r.name,
              email: r.email,
              tag: r.status === "ok" ? "Ready" : "Problem",
              tone: r.status === "ok" ? "ok" : "error",
              messages: r.messages,
            }))}
          />
        </div>
      )}

      {result && !result.ok && (
        <p className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {result.error}
        </p>
      )}

      {result?.ok && (
        <div className="mt-4">
          <div className="flex items-center justify-between">
            <p className="text-sm">
              <span className="font-medium">{result.createdCount}</span> created
              {result.rejectedCount > 0 && (
                <>
                  {" · "}
                  <span className="font-medium text-red-700">
                    {result.rejectedCount}
                  </span>{" "}
                  skipped
                </>
              )}
            </p>
            {result.createdCount > 0 && (
              <button
                type="button"
                onClick={downloadPasswords}
                className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white"
              >
                Download passwords (CSV)
              </button>
            )}
          </div>
          {result.createdCount > 0 && (
            <p className="mt-1 text-xs text-slate-500">
              Download the passwords now. They are shown once and cannot be
              retrieved later.
            </p>
          )}
          <RowTable
            rows={result.rows.map((r: ImportResultRow) => ({
              line: r.line,
              name: r.name,
              email: r.email,
              tag: r.outcome === "created" ? "Created" : "Skipped",
              tone: r.outcome === "created" ? "ok" : "error",
              messages: r.detail ? [r.detail] : [],
            }))}
          />
        </div>
      )}
    </div>
  );
}

function RowTable({
  rows,
}: {
  rows: {
    line: number;
    name: string;
    email: string;
    tag: string;
    tone: "ok" | "error";
    messages: string[];
  }[];
}) {
  return (
    <ul className="mt-3 divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
      {rows.map((r) => (
        <li key={r.line} className="px-4 py-2.5 text-sm">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <span className="font-medium">{r.name}</span>{" "}
              <span className="text-slate-400">· {r.email}</span>
            </div>
            <span
              className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                r.tone === "ok"
                  ? "bg-green-100 text-green-700"
                  : "bg-red-100 text-red-700"
              }`}
            >
              {r.tag}
            </span>
          </div>
          {r.messages.length > 0 && (
            <ul className="mt-1 list-disc pl-5 text-xs text-slate-500">
              {r.messages.map((m, i) => (
                <li key={i}>{m}</li>
              ))}
            </ul>
          )}
          <div className="mt-0.5 text-[11px] text-slate-400">row {r.line}</div>
        </li>
      ))}
    </ul>
  );
}
