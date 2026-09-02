"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createAgreement } from "../actions";

export function NewAgreementForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <form
      className="mt-6 space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          setError(null);
          const r = await createAgreement({ name, body });
          if (r.ok && r.id) router.push(`/admin/agreements/${r.id}`);
          else if (!r.ok) setError(r.error);
        });
      }}
    >
      <label className="block text-sm">
        <span className="font-medium text-slate-700">Name</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          placeholder="e.g. Code of Conduct"
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
      </label>
      <label className="block text-sm">
        <span className="font-medium text-slate-700">
          Text <span className="font-normal text-slate-400">(optional now)</span>
        </span>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={8}
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
      </label>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={pending || !name.trim()}
        className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:bg-slate-300"
      >
        {pending ? "Creating…" : "Create agreement"}
      </button>
    </form>
  );
}
