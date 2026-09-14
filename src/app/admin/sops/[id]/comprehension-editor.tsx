"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  addComprehensionQuestion,
  updateComprehensionQuestion,
  deleteComprehensionQuestion,
} from "../actions";

export type ComprehensionQuestionRow = {
  id: string;
  prompt: string;
  options: string[];
  correctOption: number;
};

const MAX_QUESTIONS = 3;
const MAX_OPTIONS = 4;

function emptyDraft() {
  return { prompt: "", options: ["", ""], correctIndex: 0 };
}

export function ComprehensionEditor({
  sopId,
  questions,
}: {
  sopId: string;
  questions: ComprehensionQuestionRow[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | "new" | null>(null);
  const [draft, setDraft] = useState(emptyDraft());

  function startAdd() {
    setDraft(emptyDraft());
    setEditingId("new");
    setError(null);
  }

  function startEdit(q: ComprehensionQuestionRow) {
    setDraft({ prompt: q.prompt, options: [...q.options], correctIndex: q.correctOption });
    setEditingId(q.id);
    setError(null);
  }

  function cancel() {
    setEditingId(null);
    setError(null);
  }

  function save() {
    start(async () => {
      setError(null);
      const options = draft.options.map((o) => o.trim()).filter(Boolean);
      const r =
        editingId === "new"
          ? await addComprehensionQuestion(sopId, {
              prompt: draft.prompt,
              options,
              correctIndex: draft.correctIndex,
            })
          : await updateComprehensionQuestion(editingId as string, {
              prompt: draft.prompt,
              options,
              correctIndex: draft.correctIndex,
            });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setEditingId(null);
      router.refresh();
    });
  }

  function remove(id: string) {
    if (!confirm("Delete this question?")) return;
    start(async () => {
      const r = await deleteComprehensionQuestion(id);
      if (!r.ok) setError(r.error);
      router.refresh();
    });
  }

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        Comprehension check ({questions.length} of {MAX_QUESTIONS})
      </h2>
      <p className="mt-1 text-xs text-slate-500">
        Multiple choice only, up to 3 questions, 1 to 4 options each. All correct,
        every time - a wrong answer just means try again. If no questions are set,
        staff sign exactly as they do today.
      </p>

      <ul className="mt-3 space-y-2">
        {questions.map((q) => (
          <li key={q.id} className="rounded-md border border-slate-200 p-3 text-sm">
            {editingId === q.id ? (
              <QuestionForm
                draft={draft}
                setDraft={setDraft}
                onSave={save}
                onCancel={cancel}
                pending={pending}
              />
            ) : (
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium text-slate-800">{q.prompt}</p>
                  <ul className="mt-1 space-y-0.5 text-xs text-slate-500">
                    {q.options.map((opt, i) => (
                      <li key={i} className={i === q.correctOption ? "font-medium text-green-700" : ""}>
                        {i === q.correctOption ? "✓ " : "· "}
                        {opt}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button
                    type="button"
                    onClick={() => startEdit(q)}
                    className="text-xs font-medium text-slate-600 underline"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => remove(q.id)}
                    className="text-xs font-medium text-red-600 underline disabled:opacity-40"
                  >
                    Delete
                  </button>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>

      {editingId === "new" && (
        <div className="mt-3 rounded-md border border-slate-200 p-3">
          <QuestionForm
            draft={draft}
            setDraft={setDraft}
            onSave={save}
            onCancel={cancel}
            pending={pending}
          />
        </div>
      )}

      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}

      {editingId === null && questions.length < MAX_QUESTIONS && (
        <button
          type="button"
          onClick={startAdd}
          className="mt-3 rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700"
        >
          Add a question
        </button>
      )}
    </section>
  );
}

function QuestionForm({
  draft,
  setDraft,
  onSave,
  onCancel,
  pending,
}: {
  draft: { prompt: string; options: string[]; correctIndex: number };
  setDraft: (d: { prompt: string; options: string[]; correctIndex: number }) => void;
  onSave: () => void;
  onCancel: () => void;
  pending: boolean;
}) {
  const canSave =
    draft.prompt.trim().length > 0 &&
    draft.options.filter((o) => o.trim()).length >= 1 &&
    draft.correctIndex < draft.options.filter((o) => o.trim()).length;

  return (
    <div className="space-y-2">
      <input
        value={draft.prompt}
        onChange={(e) => setDraft({ ...draft, prompt: e.target.value })}
        placeholder="Question"
        className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
      />
      <div className="space-y-1.5">
        {draft.options.map((opt, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              type="radio"
              name="correct"
              checked={draft.correctIndex === i}
              onChange={() => setDraft({ ...draft, correctIndex: i })}
              title="Correct answer"
            />
            <input
              value={opt}
              onChange={(e) => {
                const options = [...draft.options];
                options[i] = e.target.value;
                setDraft({ ...draft, options });
              }}
              placeholder={`Option ${i + 1}`}
              className="flex-1 rounded-md border border-slate-300 px-2 py-1 text-sm"
            />
            {draft.options.length > 1 && (
              <button
                type="button"
                onClick={() => {
                  const options = draft.options.filter((_, oi) => oi !== i);
                  const correctIndex =
                    draft.correctIndex === i
                      ? 0
                      : draft.correctIndex > i
                        ? draft.correctIndex - 1
                        : draft.correctIndex;
                  setDraft({ ...draft, options, correctIndex });
                }}
                className="text-xs text-slate-400 hover:text-slate-700"
                aria-label="Remove option"
              >
                &times;
              </button>
            )}
          </div>
        ))}
        {draft.options.length < MAX_OPTIONS && (
          <button
            type="button"
            onClick={() => setDraft({ ...draft, options: [...draft.options, ""] })}
            className="text-xs text-slate-500 underline"
          >
            Add option
          </button>
        )}
      </div>
      <p className="text-xs text-slate-400">
        Select the radio next to the correct option.
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          disabled={!canSave || pending}
          onClick={onSave}
          className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40"
        >
          {pending ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
