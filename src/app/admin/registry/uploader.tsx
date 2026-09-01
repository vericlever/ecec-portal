"use client";

import { useState, useTransition } from "react";
import { refreshRegistry, type RefreshResult } from "./actions";

export function RegistryUploader() {
  const [kind, setKind] = useState<"rto" | "component">("component");
  const [fileName, setFileName] = useState("");
  const [text, setText] = useState<string | null>(null);
  const [result, setResult] = useState<RefreshResult | null>(null);
  const [pending, start] = useTransition();

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    setResult(null);
    if (!f) {
      setText(null);
      setFileName("");
      return;
    }
    setFileName(f.name);
    f.text().then(setText);
  }

  return (
    <div className="mt-6 rounded-lg border border-slate-200 bg-white p-4">
      <h2 className="text-sm font-medium">Refresh from an extract</h2>
      <p className="mt-1 text-xs text-slate-500">
        A delimited file (CSV). RTOs need a code column and a name column;
        components need a code column and a title column. Existing rows are
        updated by code, new rows added.
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
        <label className="flex items-center gap-1.5">
          <input
            type="radio"
            checked={kind === "component"}
            onChange={() => setKind("component")}
          />
          Training components
        </label>
        <label className="flex items-center gap-1.5">
          <input
            type="radio"
            checked={kind === "rto"}
            onChange={() => setKind("rto")}
          />
          RTOs
        </label>
      </div>

      <input
        type="file"
        accept=".csv,.txt,text/csv"
        onChange={onFile}
        className="mt-3 block w-full text-sm text-slate-600 file:mr-3 file:rounded-md file:border file:border-slate-300 file:bg-slate-50 file:px-3 file:py-1.5 file:text-xs file:font-medium"
      />

      <button
        type="button"
        disabled={text == null || pending}
        onClick={() =>
          start(async () => {
            setResult(await refreshRegistry(text!, kind, fileName));
          })
        }
        className="mt-3 rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40"
      >
        {pending ? "Importing…" : "Import"}
      </button>

      {result && !result.ok && (
        <p className="mt-3 rounded-md border border-red-200 bg-red-50 p-2 text-sm text-red-700">
          {result.error}
        </p>
      )}
      {result?.ok && (
        <p className="mt-3 rounded-md border border-green-200 bg-green-50 p-2 text-sm text-green-800">
          Imported {result.rowsUpserted} {result.kind === "rto" ? "RTOs" : "components"}
          {result.skipped > 0 && ` (${result.skipped} rows skipped - missing code or name)`}
          .
        </p>
      )}
    </div>
  );
}
