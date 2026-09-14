"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { acceptPlatformNotice } from "./actions";

export function AcceptForm({ version, next }: { version: number; next: string }) {
  const router = useRouter();
  const [checked, setChecked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <div className="mt-6 border-t border-slate-200 pt-5">
      <label className="flex items-start gap-2.5 text-sm text-slate-700">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => setChecked(e.target.checked)}
          disabled={pending}
          className="mt-0.5"
        />
        I have read this document and I accept it.
      </label>
      <button
        type="button"
        disabled={!checked || pending}
        onClick={() => {
          start(async () => {
            setError(null);
            const r = await acceptPlatformNotice(version);
            if (!r.ok) {
              setError(r.error);
              return;
            }
            router.push(next);
            router.refresh();
          });
        }}
        className="mt-4 rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
      >
        {pending ? "Saving…" : "Accept and continue"}
      </button>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}
