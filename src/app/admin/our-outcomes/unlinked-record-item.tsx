"use client";

import { useEffect, useState, useTransition } from "react";
import { addProcedureLink, listProcedures } from "./actions";
import { ArchiveRecordButton } from "./archive-record-button";
import { fmtReviewDate } from "@/lib/sop-review";

type Props = {
  recordId: string;
  sourceTypeLabel: string;
  serviceLabel: string;
  periodStart: string;
  periodEnd: string;
  preview: string;
};

// A saved record with no link of any kind: the AI nominated nothing, or none
// of its excerpts could be verified. The manager picks the procedure by
// hand, which counts as the decision, so the link is saved as confirmed.
export function UnlinkedRecordItem({ recordId, sourceTypeLabel, serviceLabel, periodStart, periodEnd, preview }: Props) {
  const [pending, start] = useTransition();
  const [adding, setAdding] = useState(false);
  const [procedures, setProcedures] = useState<{ id: string; name: string }[]>([]);
  const [sopId, setSopId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (adding && procedures.length === 0) listProcedures().then(setProcedures);
  }, [adding, procedures.length]);

  if (done) return null;

  return (
    <li className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-sm font-medium text-slate-800">No procedure suggested</span>
        <span className="text-xs text-slate-400">
          {sourceTypeLabel} · {serviceLabel} · {fmtReviewDate(periodStart)} to {fmtReviewDate(periodEnd)}
        </span>
      </div>
      <p className="mt-1.5 text-xs text-slate-500">{preview}...</p>

      {!adding ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="rounded-md bg-ink px-3 py-1 text-xs font-medium text-white"
          >
            Add procedure
          </button>
          <ArchiveRecordButton recordId={recordId} />
        </div>
      ) : (
        <div className="mt-3 space-y-2">
          <select
            value={sopId}
            onChange={(e) => setSopId(e.target.value)}
            className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
          >
            <option value="">Choose a procedure...</option>
            {procedures.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={pending || !sopId}
              onClick={() =>
                start(async () => {
                  const r = await addProcedureLink(recordId, sopId);
                  if (r.ok) setDone(true);
                  else setError(r.error);
                })
              }
              className="rounded-md bg-ink px-3 py-1 text-xs font-medium text-white disabled:opacity-50"
            >
              Save
            </button>
            <button type="button" onClick={() => setAdding(false)} className="text-xs text-slate-500">
              Cancel
            </button>
          </div>
        </div>
      )}
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </li>
  );
}
