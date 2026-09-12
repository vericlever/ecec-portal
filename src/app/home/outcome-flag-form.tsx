"use client";

import { useState, useTransition } from "react";
import { flagSopOutcome } from "./actions";

export function OutcomeFlagForm({ sops }: { sops: { id: string; name: string }[] }) {
  const [sopId, setSopId] = useState("");
  const [reflection, setReflection] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (sops.length === 0) {
    return (
      <p className="mt-3 text-sm text-slate-500">
        No published procedures are assigned to you yet.
      </p>
    );
  }

  return (
    <div className="mt-3 space-y-2.5 text-sm">
      <label className="block">
        <span className="text-xs font-medium text-slate-700">Procedure</span>
        <select
          value={sopId}
          onChange={(e) => setSopId(e.target.value)}
          disabled={pending}
          className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
        >
          <option value="">Choose a procedure…</option>
          {sops.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="text-xs font-medium text-slate-700">
          What are the results of following this procedure on child outcomes?
        </span>
        <textarea
          value={reflection}
          onChange={(e) => setReflection(e.target.value)}
          disabled={pending}
          rows={3}
          placeholder="What you've noticed in the room, for your manager to consider at the next review."
          className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
        />
      </label>
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={pending || !sopId || !reflection.trim()}
          onClick={() =>
            start(async () => {
              setError(null);
              setMsg(null);
              const r = await flagSopOutcome(sopId, reflection);
              if (r.ok) {
                setMsg("Sent to your manager.");
                setSopId("");
                setReflection("");
              } else {
                setError(r.error);
              }
            })
          }
          className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white disabled:bg-slate-300"
        >
          {pending ? "Sending…" : "Flag for review"}
        </button>
        {msg && <span className="text-xs text-green-700">{msg}</span>}
        {error && <span className="text-xs text-red-600">{error}</span>}
      </div>
    </div>
  );
}
