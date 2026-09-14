"use client";

import { useMemo, useState, useTransition } from "react";
import { submitComprehensionAttempt } from "./actions";

export type QuizQuestion = {
  id: string;
  prompt: string;
  options: string[];
};

// Fisher-Yates, keeping each option's original index alongside its text so
// the answer can be submitted in terms the server understands regardless of
// display order - "stops answer position being shared around the staff
// room" per the spec.
function shuffled(options: string[]): { text: string; originalIndex: number }[] {
  const arr = options.map((text, originalIndex) => ({ text, originalIndex }));
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function ComprehensionQuiz({
  sopId,
  questions,
  onPassed,
}: {
  sopId: string;
  questions: QuizQuestion[];
  onPassed: (attemptId: string) => void;
}) {
  const [pending, start] = useTransition();
  const [selected, setSelected] = useState<Record<string, number>>({});
  // Per-question right/wrong from the last failed attempt - never which
  // option was correct, so retrying still requires reasoning it through
  // again rather than just clicking the now-known answer.
  const [wrongQuestionIds, setWrongQuestionIds] = useState<Set<string> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attemptNumber, setAttemptNumber] = useState(1);

  // Re-shuffled once per attempt (attemptNumber), not on every render.
  const displayOptions = useMemo(
    () => new Map(questions.map((q) => [q.id, shuffled(q.options)])),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [questions, attemptNumber],
  );

  const allAnswered = questions.every((q) => selected[q.id] !== undefined);

  function submit() {
    start(async () => {
      setError(null);
      const answers = questions.map((q) => ({
        questionId: q.id,
        selectedIndex: selected[q.id],
      }));
      const r = await submitComprehensionAttempt(sopId, answers);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      if (r.passed) {
        onPassed(r.attemptId);
        return;
      }
      setWrongQuestionIds(
        new Set(r.results.filter((res) => !res.correct).map((res) => res.questionId)),
      );
    });
  }

  function retry() {
    setWrongQuestionIds(null);
    setSelected({});
    setAttemptNumber((n) => n + 1);
  }

  const locked = wrongQuestionIds !== null;

  return (
    <div className="mt-6 space-y-4 rounded-lg border border-slate-200 bg-white p-5">
      <div>
        <h2 className="text-sm font-semibold text-slate-800">
          Quick check before you sign
        </h2>
        <p className="mt-0.5 text-xs text-slate-500">
          Answer every question correctly to unlock signing. You can try again as many
          times as you need.
        </p>
      </div>

      {questions.map((q, qi) => {
        const isWrong = wrongQuestionIds?.has(q.id) ?? false;
        return (
          <fieldset
            key={q.id}
            className="border-t border-slate-100 pt-3 first:border-t-0 first:pt-0"
          >
            <legend className="text-sm font-medium text-slate-800">
              {qi + 1}. {q.prompt}
              {isWrong && (
                <span className="ml-2 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                  Not quite
                </span>
              )}
            </legend>
            <div className="mt-2 space-y-1.5">
              {displayOptions.get(q.id)!.map((opt) => {
                const isSelected = selected[q.id] === opt.originalIndex;
                return (
                  <label
                    key={opt.originalIndex}
                    className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm ${
                      isSelected ? "border-slate-400 bg-slate-50" : "border-slate-200"
                    }`}
                  >
                    <input
                      type="radio"
                      name={`q-${q.id}`}
                      checked={isSelected}
                      disabled={locked}
                      onChange={() =>
                        setSelected((cur) => ({ ...cur, [q.id]: opt.originalIndex }))
                      }
                    />
                    {opt.text}
                  </label>
                );
              })}
            </div>
          </fieldset>
        );
      })}

      {error && <p className="text-sm text-red-600">{error}</p>}

      {locked ? (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          <p className="font-medium">
            Not quite - the question{wrongQuestionIds!.size === 1 ? "" : "s"} marked above
            need another look. Re-read the procedure if you need to.
          </p>
          <button
            type="button"
            onClick={retry}
            className="mt-2 rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white"
          >
            Try again
          </button>
        </div>
      ) : (
        <button
          type="button"
          disabled={!allAnswered || pending}
          onClick={submit}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          {pending ? "Checking…" : "Check answers"}
        </button>
      )}
    </div>
  );
}
