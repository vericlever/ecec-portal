"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { submitReview } from "./actions";

type ActionDraft = {
  description: string;
  raisedFrom: "practice" | "outcome";
  ownerId: string;
  dueDate: string;
};

function isoInDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function ReviewForm({
  sopId,
  staff,
}: {
  sopId: string;
  staff: { id: string; full_name: string }[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const [practice, setPractice] = useState("");
  const [outcome, setOutcome] = useState("");
  const [decision, setDecision] = useState<"" | "stands" | "needs_revision">("");
  const [actions, setActions] = useState<ActionDraft[]>([]);

  function addAction(raisedFrom: "practice" | "outcome") {
    setActions((cur) => [
      ...cur,
      { description: "", raisedFrom, ownerId: staff[0]?.id ?? "", dueDate: isoInDays(14) },
    ]);
  }
  function updateAction(i: number, patch: Partial<ActionDraft>) {
    setActions((cur) => cur.map((a, idx) => (idx === i ? { ...a, ...patch } : a)));
  }
  function removeAction(i: number) {
    setActions((cur) => cur.filter((_, idx) => idx !== i));
  }

  function submit() {
    setErr(null);
    if (!practice.trim()) return setErr("Describe practice across the team.");
    if (!outcome.trim()) return setErr("Describe what the outcomes tell you.");
    if (!decision) return setErr("Choose a decision.");
    const badAction = actions.find((a) => !a.description.trim() || !a.ownerId || !a.dueDate);
    if (badAction) return setErr("Fill in every action, or remove it.");

    start(async () => {
      const fd = new FormData();
      fd.set("practice", practice);
      fd.set("outcome", outcome);
      fd.set("decision", decision);
      fd.set("actions", JSON.stringify(actions));
      const f = fileRef.current?.files?.[0];
      if (f) fd.set("file", f);

      const r = await submitReview(sopId, fd);
      if (r.ok) {
        setDone(true);
        router.refresh();
      } else {
        setErr(r.error ?? "Something went wrong.");
      }
    });
  }

  if (done) {
    return (
      <div className="mt-4 rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-800">
        Review recorded. The clock has reset.
      </div>
    );
  }

  return (
    <div className="mt-4 space-y-5 rounded-lg border border-slate-200 bg-white p-4">
      <div>
        <label className="block text-sm font-medium text-slate-700">
          Are staff following this procedure as trained, and was the training adequate?
        </label>
        <p className="mt-0.5 text-xs text-slate-500">
          Draws on training logs, coaching notes, supervision records and what leaders have
          seen in the rooms.
        </p>
        <p className="mt-0.5 text-xs text-slate-500">
          Describe practice across the team, not individual performance. This text appears in
          the Child Safety Standards report.
        </p>
        <textarea
          value={practice}
          onChange={(e) => setPractice(e.target.value)}
          rows={4}
          className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
        <button
          type="button"
          onClick={() => addAction("practice")}
          className="mt-2 text-xs font-medium text-slate-600 underline"
        >
          + Raise an action from practice
        </button>
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700">
          Is this procedure achieving what the policy intends?
        </label>
        <p className="mt-0.5 text-xs text-slate-500">
          Draws on incidents, complaints, family feedback and observable conditions.
        </p>
        <textarea
          value={outcome}
          onChange={(e) => setOutcome(e.target.value)}
          rows={4}
          className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
        <button
          type="button"
          onClick={() => addAction("outcome")}
          className="mt-2 text-xs font-medium text-slate-600 underline"
        >
          + Raise an action from outcomes
        </button>
      </div>

      {actions.length > 0 && (
        <div className="space-y-3 rounded-md border border-slate-200 bg-slate-50 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Actions</p>
          {actions.map((a, i) => (
            <div key={i} className="space-y-2 rounded-md bg-white p-3 shadow-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium uppercase text-slate-400">
                  From {a.raisedFrom}
                </span>
                <button
                  type="button"
                  onClick={() => removeAction(i)}
                  className="text-xs text-red-600 underline"
                >
                  Remove
                </button>
              </div>
              <textarea
                value={a.description}
                onChange={(e) => updateAction(i, { description: e.target.value })}
                rows={2}
                placeholder="What needs to happen"
                className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
              />
              <div className="grid grid-cols-2 gap-2">
                <select
                  value={a.ownerId}
                  onChange={(e) => updateAction(i, { ownerId: e.target.value })}
                  className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                >
                  {staff.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.full_name}
                    </option>
                  ))}
                </select>
                <input
                  type="date"
                  value={a.dueDate}
                  onChange={(e) => updateAction(i, { dueDate: e.target.value })}
                  className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                />
              </div>
            </div>
          ))}
        </div>
      )}

      <div>
        <span className="block text-sm font-medium text-slate-700">Evidence (optional)</span>
        <p className="mt-0.5 text-xs text-slate-500">Whatever you are already holding.</p>
        <input
          ref={fileRef}
          type="file"
          className="mt-2 text-sm text-slate-600 file:mr-3 file:rounded-md file:border file:border-slate-300 file:bg-slate-50 file:px-3 file:py-1.5 file:text-xs file:font-medium"
        />
      </div>

      <div>
        <span className="block text-sm font-medium text-slate-700">Decision</span>
        <div className="mt-2 space-y-1.5">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="decision"
              checked={decision === "stands"}
              onChange={() => setDecision("stands")}
            />
            Procedure stands as written
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="decision"
              checked={decision === "needs_revision"}
              onChange={() => setDecision("needs_revision")}
            />
            Procedure needs revision
          </label>
        </div>
      </div>

      {err && <p className="text-sm text-red-600">{err}</p>}

      <button
        type="button"
        disabled={pending}
        onClick={submit}
        className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
      >
        {pending ? "Saving…" : "Save review"}
      </button>
    </div>
  );
}
