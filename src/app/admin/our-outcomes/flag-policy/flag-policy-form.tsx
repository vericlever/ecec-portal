"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { raisePolicyFlag, listOutcomeRecords } from "../actions";

export function FlagPolicyForm({ policies }: { policies: { id: string; name: string }[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [policyId, setPolicyId] = useState("");
  const [note, setNote] = useState("");
  const [recordId, setRecordId] = useState("");
  const [records, setRecords] = useState<{ id: string; label: string }[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listOutcomeRecords().then(setRecords);
  }, []);

  function submit() {
    setError(null);
    start(async () => {
      const result = await raisePolicyFlag({ policyId, note, recordId: recordId || undefined });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.push("/admin/our-outcomes");
    });
  }

  return (
    <div className="mt-4 space-y-3">
      <label className="block text-sm">
        <span className="text-xs font-medium text-slate-600">Policy</span>
        <select
          value={policyId}
          onChange={(e) => setPolicyId(e.target.value)}
          className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5"
        >
          <option value="">Choose a policy...</option>
          {policies.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      </label>
      <label className="block text-sm">
        <span className="text-xs font-medium text-slate-600">Note</span>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5"
        />
        <span className="mt-1 block text-xs text-slate-400">Don&apos;t include children&apos;s names or details.</span>
      </label>
      <label className="block text-sm">
        <span className="text-xs font-medium text-slate-600">Related outcome record (optional)</span>
        <select
          value={recordId}
          onChange={(e) => setRecordId(e.target.value)}
          className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5"
        >
          <option value="">None</option>
          {records.map((r) => (
            <option key={r.id} value={r.id}>{r.label}</option>
          ))}
        </select>
      </label>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button
          type="button"
          disabled={pending || !policyId || !note.trim()}
          onClick={submit}
          className="rounded-md bg-ink px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          Flag policy
        </button>
        <a href="/admin/our-outcomes" className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700">
          Cancel
        </a>
      </div>
    </div>
  );
}
