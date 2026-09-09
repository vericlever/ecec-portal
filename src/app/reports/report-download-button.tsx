"use client";

import { useState } from "react";

// Fetches a report route and downloads the PDF it returns: a blob + a hidden
// anchor's .click(), never window.open() and never a new tab (per spec).
export function ReportDownloadButton({
  href,
  label,
  className,
}: {
  href: string;
  label: string;
  className?: string;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function download() {
    setPending(true);
    setError(null);
    try {
      const res = await fetch(href);
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(text || `Could not generate the report (${res.status}).`);
      }
      const blob = await res.blob();
      const disposition = res.headers.get("content-disposition") ?? "";
      const match = disposition.match(/filename="([^"]+)"/);
      const filename = match ? match[1] : "report.pdf";

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={download}
        disabled={pending}
        className={
          className ??
          "rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
        }
      >
        {pending ? "Generating…" : label}
      </button>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
