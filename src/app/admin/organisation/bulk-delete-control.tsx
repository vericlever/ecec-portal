"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

const DELETE_PHRASE = "delete permanently";

export function BulkDeleteControl({
  title,
  description,
  confirmMessage,
  action,
}: {
  title: string;
  description: string;
  confirmMessage: string;
  action: (typedPhrase: string) => Promise<{ ok: true } | { ok: false; error: string }>;
}) {
  const router = useRouter();
  const [phrase, setPhrase] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, start] = useTransition();

  return (
    <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm">
      <span className="font-medium text-red-800">{title}</span>
      <p className="mt-0.5 text-xs text-red-700">{description}</p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <input
          value={phrase}
          onChange={(e) => setPhrase(e.target.value)}
          disabled={pending}
          placeholder={DELETE_PHRASE}
          className="rounded-md border border-red-300 px-2 py-1 text-sm"
        />
        <button
          type="button"
          disabled={phrase.trim().toLowerCase() !== DELETE_PHRASE || pending}
          onClick={() => {
            if (!confirm(confirmMessage)) return;
            start(async () => {
              setError(null);
              const r = await action(phrase);
              if (r.ok) {
                setDone(true);
                setPhrase("");
                router.refresh();
              } else {
                setError(r.error);
              }
            });
          }}
          className="rounded-md bg-red-700 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40"
        >
          {pending ? "Deleting…" : "Delete permanently"}
        </button>
        {done && <span className="text-xs text-green-700">Done.</span>}
        {error && <span className="text-xs text-red-600">{error}</span>}
      </div>
    </div>
  );
}
