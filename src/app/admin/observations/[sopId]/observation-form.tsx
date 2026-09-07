"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { fmtReviewDate } from "@/lib/sop-review";
import { logSopObservation } from "../actions";

export function ObservationForm({
  sopId,
  resetDate,
  keepDate,
  suggestedEvidence,
}: {
  sopId: string;
  resetDate: string;
  keepDate: string | null;
  suggestedEvidence: string | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [evidence, setEvidence] = useState("");
  const [outcome, setOutcome] = useState<"" | "needs_review" | "continue_as_is">(
    "",
  );
  const [askClock, setAskClock] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  function submit(resetClock: boolean) {
    start(async () => {
      setErr(null);
      const fd = new FormData();
      fd.append("evidence", evidence);
      fd.append("outcome", outcome);
      fd.append("resetClock", resetClock ? "1" : "0");
      const f = fileRef.current?.files?.[0];
      if (f) fd.append("file", f);
      const r = await logSopObservation(sopId, fd);
      if (r.ok) {
        setDone(true);
        setEvidence("");
        setOutcome("");
        setAskClock(false);
        if (fileRef.current) fileRef.current.value = "";
        router.refresh();
      } else {
        setErr(r.error);
        setAskClock(false);
      }
    });
  }

  if (done) {
    return (
      <div className="mt-2 space-y-2">
        <p className="text-sm text-green-700">Observation recorded.</p>
        <button
          type="button"
          onClick={() => setDone(false)}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700"
        >
          Log another
        </button>
      </div>
    );
  }

  return (
    <div className="mt-3 space-y-3">
      {suggestedEvidence && (
        <p className="rounded-md border border-slate-200 bg-slate-50 p-2.5 text-xs text-slate-600">
          <span className="font-medium text-slate-700">
            Suggested evidence:
          </span>{" "}
          {suggestedEvidence}
        </p>
      )}

      <label className="block text-sm">
        <span className="font-medium text-slate-700">What did you observe?</span>
        <textarea
          value={evidence}
          onChange={(e) => setEvidence(e.target.value)}
          rows={4}
          placeholder="What you saw, who was involved, anything that did or did not match the procedure."
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
      </label>

      <label className="block text-sm">
        <span className="font-medium text-slate-700">
          Evidence file{" "}
          <span className="font-normal text-slate-400">(optional)</span>
        </span>
        <input
          ref={fileRef}
          type="file"
          accept=".pdf,.docx,.txt,.md,.png,.jpg,.jpeg,image/*"
          className="mt-1 block w-full text-sm text-slate-600 file:mr-3 file:rounded-md file:border file:border-slate-300 file:bg-slate-50 file:px-3 file:py-1.5 file:text-xs file:font-medium"
        />
      </label>

      <fieldset className="text-sm">
        <span className="font-medium text-slate-700">Outcome</span>
        <div className="mt-1 space-y-1.5">
          <label className="flex items-start gap-2">
            <input
              type="radio"
              name="outcome"
              checked={outcome === "continue_as_is"}
              onChange={() => setOutcome("continue_as_is")}
              className="mt-0.5"
            />
            <span>
              <span className="font-medium text-slate-800">Continue as is</span>
              <span className="block text-xs text-slate-500">
                Practice matched the procedure. No change needed.
              </span>
            </span>
          </label>
          <label className="flex items-start gap-2">
            <input
              type="radio"
              name="outcome"
              checked={outcome === "needs_review"}
              onChange={() => setOutcome("needs_review")}
              className="mt-0.5"
            />
            <span>
              <span className="font-medium text-slate-800">Needs review</span>
              <span className="block text-xs text-slate-500">
                Flags the SOP for a content editor to look at and re-publish.
              </span>
            </span>
          </label>
        </div>
      </fieldset>

      {err && <p className="text-sm text-red-600">{err}</p>}

      {!askClock ? (
        <button
          type="button"
          disabled={pending || !evidence.trim() || !outcome}
          onClick={() => setAskClock(true)}
          className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-40"
        >
          Save observation
        </button>
      ) : (
        <div className="space-y-2 rounded-md border border-slate-200 bg-slate-50 p-3 text-sm">
          <p className="font-medium text-slate-700">
            Update the review clock for this SOP?
          </p>
          <p className="text-xs text-slate-500">
            Recommended. Resets the next review to {fmtReviewDate(resetDate)}
            {keepDate ? ` (currently ${fmtReviewDate(keepDate)}).` : "."}
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={() => submit(true)}
              className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40"
            >
              {pending
                ? "Saving…"
                : `Save & reset to ${fmtReviewDate(resetDate)}`}
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => submit(false)}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 disabled:opacity-40"
            >
              {keepDate
                ? `Save, keep ${fmtReviewDate(keepDate)}`
                : "Save without setting a review date"}
            </button>
            <button
              type="button"
              onClick={() => setAskClock(false)}
              className="px-2 py-1.5 text-xs text-slate-500 underline"
            >
              Back
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
