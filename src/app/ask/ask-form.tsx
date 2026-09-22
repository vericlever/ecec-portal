"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { askQuestion } from "./actions";
import { MarkdownBody } from "@/components/markdown-body";
import type { Source } from "@/lib/ai/service";

export function AskForm() {
  const [pending, start] = useTransition();
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
  const [sources, setSources] = useState<Source[]>([]);
  const [grounded, setGrounded] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [retryAt, setRetryAt] = useState<string | null>(null);

  function submit() {
    if (!question.trim() || pending) return;
    setErr(null);
    setRetryAt(null);
    start(async () => {
      const r = await askQuestion(question);
      if (r.ok) {
        setAnswer(r.answer);
        setSources(r.sources);
        setGrounded(r.grounded);
      } else {
        setErr(r.error);
        setRetryAt(r.retryAt ?? null);
        setAnswer(null);
        setSources([]);
      }
    });
  }

  return (
    <div className="mt-3 grid gap-4 sm:grid-cols-[1fr_260px]">
      <div className="space-y-4">
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <label htmlFor="ask-question" className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Ask a question
          </label>
          <textarea
            id="ask-question"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            rows={3}
            placeholder="e.g. What do I do if a child has an allergic reaction?"
            className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
          <button
            type="button"
            disabled={pending || !question.trim()}
            onClick={submit}
            className="mt-2 rounded-md bg-slate-900 px-4 py-1.5 text-sm font-medium text-white disabled:opacity-40"
          >
            {pending ? "Asking..." : "Ask"}
          </button>
          {err && (
            <p className="mt-2 text-sm text-red-600">
              {err}
              {retryAt && ` You can ask again from ${formatRetryAt(retryAt)}.`}
              {retryAt && " In the meantime, ask your director."}
            </p>
          )}
        </div>

        {answer && (
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">
              Suggested answer
            </p>
            <div className="mt-2">
              <MarkdownBody text={answer} />
            </div>
            <p className="mt-4 border-t border-slate-100 pt-3 text-xs text-slate-500">
              Check with your director if this doesn&apos;t match what you expected.
            </p>
          </div>
        )}
      </div>

      <div>
        {answer && grounded && sources.length > 0 && (
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Sources
            </p>
            <SourceGroup label="Policies" sources={sources.filter((s) => s.documentType === "policy")} />
            <SourceGroup label="Procedures" sources={sources.filter((s) => s.documentType === "sop")} />
          </div>
        )}
      </div>
    </div>
  );
}

// Rendered in the browser so the time reads in the reader's own timezone -
// an educator in Perth should not be told a Melbourne time.
function formatRetryAt(iso: string): string {
  const when = new Date(iso);
  const today = new Date().toDateString() === when.toDateString();
  const time = when.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  if (today) return time;
  const day = when.toLocaleDateString(undefined, { weekday: "long" });
  return `${time} ${day}`;
}

function SourceGroup({ label, sources }: { label: string; sources: Source[] }) {
  if (sources.length === 0) return null;
  return (
    <div className="mt-3 first:mt-2">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <ul className="mt-1 space-y-1.5 text-sm">
        {sources.map((s) => (
          <li key={`${s.documentType}:${s.documentId}`}>
            <Link
              href={s.documentType === "policy" ? `/policies/${s.documentId}` : `/sops/${s.documentId}`}
              className="text-slate-700 underline hover:text-slate-900"
            >
              {s.name}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
