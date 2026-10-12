"use client";

import { useEffect, useState, useTransition } from "react";
import { confirmLink, changeLink, dismissLink, raisePolicyFlag, listProcedures, listPolicies } from "./actions";
import { fmtReviewDate } from "@/lib/sop-review";

type Props = {
  linkId: string;
  sopId: string;
  sopName: string;
  reason: string | null;
  sourceTypeLabel: string;
  serviceLabel: string;
  periodStart: string;
  periodEnd: string;
  evidence: { line: number; excerpt: string }[];
};

export function ToSortItem({ linkId, sopName, reason, sourceTypeLabel, serviceLabel, periodStart, periodEnd, evidence }: Props) {
  const [pending, start] = useTransition();
  const [mode, setMode] = useState<"idle" | "change" | "flag-policy">("idle");
  const [procedures, setProcedures] = useState<{ id: string; name: string }[]>([]);
  const [policies, setPolicies] = useState<{ id: string; name: string }[]>([]);
  const [selectedSopId, setSelectedSopId] = useState("");
  const [selectedPolicyId, setSelectedPolicyId] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (mode === "change" && procedures.length === 0) {
      listProcedures().then(setProcedures);
    }
    if (mode === "flag-policy" && policies.length === 0) {
      listPolicies().then(setPolicies);
    }
  }, [mode, procedures.length, policies.length]);

  if (done) return null;

  return (
    <li className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-sm font-medium text-slate-800">Suggested: {sopName}</span>
        <span className="text-xs text-slate-400">
          {sourceTypeLabel} · {serviceLabel} · {fmtReviewDate(periodStart)} to {fmtReviewDate(periodEnd)}
        </span>
      </div>
      {reason ? <p className="mt-1.5 text-sm italic text-slate-600">&ldquo;{reason}&rdquo;</p> : null}
      {evidence.length > 0 && (
        <ul className="mt-2 space-y-1 border-l-2 border-slate-200 pl-3">
          {evidence.map((e, i) => (
            <li key={i} className="text-xs text-slate-600">
              <span className="text-slate-400">Line {e.line}: </span>&ldquo;{e.excerpt}&rdquo;
            </li>
          ))}
        </ul>
      )}

      {mode === "idle" && (
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={pending}
            onClick={() => start(async () => {
              const r = await confirmLink(linkId);
              if (r.ok) setDone(true); else setError(r.error);
            })}
            className="rounded-md bg-ink px-3 py-1 text-xs font-medium text-white disabled:opacity-50"
          >
            Confirm
          </button>
          <button
            type="button"
            onClick={() => setMode("change")}
            className="rounded-md border border-slate-300 px-3 py-1 text-xs font-medium text-slate-700"
          >
            Change
          </button>
          <button
            type="button"
            onClick={() => setMode("flag-policy")}
            className="rounded-md border border-slate-300 px-3 py-1 text-xs font-medium text-slate-700"
          >
            Flag a policy
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => start(async () => {
              const r = await dismissLink(linkId);
              if (r.ok) setDone(true); else setError(r.error);
            })}
            className="rounded-md border border-slate-300 px-3 py-1 text-xs font-medium text-slate-500 disabled:opacity-50"
          >
            Dismiss
          </button>
        </div>
      )}

      {mode === "change" && (
        <div className="mt-3 space-y-2">
          <select
            value={selectedSopId}
            onChange={(e) => setSelectedSopId(e.target.value)}
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
              disabled={pending || !selectedSopId}
              onClick={() => start(async () => {
                const r = await changeLink(linkId, selectedSopId);
                if (r.ok) setDone(true); else setError(r.error);
              })}
              className="rounded-md bg-ink px-3 py-1 text-xs font-medium text-white disabled:opacity-50"
            >
              Save
            </button>
            <button type="button" onClick={() => setMode("idle")} className="text-xs text-slate-500">
              Cancel
            </button>
          </div>
        </div>
      )}

      {mode === "flag-policy" && (
        <div className="mt-3 space-y-2">
          <select
            value={selectedPolicyId}
            onChange={(e) => setSelectedPolicyId(e.target.value)}
            className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
          >
            <option value="">Choose a policy...</option>
            {policies.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Note for the policy reviewer"
            rows={2}
            className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
          />
          <p className="text-xs text-slate-400">Don&apos;t include children&apos;s names or details.</p>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={pending || !selectedPolicyId || !note.trim()}
              onClick={() => start(async () => {
                const r = await raisePolicyFlag({ policyId: selectedPolicyId, note, dismissLinkId: linkId });
                if (r.ok) setDone(true); else setError(r.error);
              })}
              className="rounded-md bg-ink px-3 py-1 text-xs font-medium text-white disabled:opacity-50"
            >
              Flag policy
            </button>
            <button type="button" onClick={() => setMode("idle")} className="text-xs text-slate-500">
              Cancel
            </button>
          </div>
        </div>
      )}

      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </li>
  );
}
