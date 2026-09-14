"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateOrganisationDisplayName } from "./actions";

export function DisplayNameForm({ initialValue }: { initialValue: string }) {
  const router = useRouter();
  const [value, setValue] = useState(initialValue);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const dirty = value.trim() !== initialValue;

  return (
    <div className="text-sm">
      <label className="block">
        <span className="font-medium text-slate-700">Display name</span>
        <input
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setMsg(null);
          }}
          disabled={pending}
          placeholder="e.g. Ready Set Go"
          className="mt-1 block w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
        />
      </label>
      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          disabled={!dirty || pending}
          onClick={() => {
            start(async () => {
              setError(null);
              setMsg(null);
              const r = await updateOrganisationDisplayName(value);
              if (r.ok) {
                setMsg("Saved.");
                router.refresh();
              } else {
                setError(r.error);
              }
            });
          }}
          className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40"
        >
          {pending ? "Saving…" : "Save"}
        </button>
        {msg && <span className="text-xs text-green-700">{msg}</span>}
        {error && <span className="text-xs text-red-600">{error}</span>}
      </div>
    </div>
  );
}
