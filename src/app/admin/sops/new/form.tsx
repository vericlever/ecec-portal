"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createSop } from "../actions";
import { SOP_TIER_LABELS, SOP_TIER_ORDER } from "@/lib/constants";

export function NewSopForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [signoffType, setSignoffType] = useState("self");
  const [category, setCategory] = useState("");
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
          const r = await createSop({ name, body, signoffType, category });
          if (r.ok && r.id) router.push(`/admin/sops/${r.id}`);
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
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
      </label>

      <div className="grid grid-cols-2 gap-4">
        <label className="block text-sm">
          <span className="font-medium text-slate-700">Sign-off</span>
          <select
            value={signoffType}
            onChange={(e) => setSignoffType(e.target.value)}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="self">Staff sign-off</option>
            <option value="self_and_manager">Staff and manager sign-off</option>
          </select>
        </label>
        <label className="block text-sm">
          <span className="font-medium text-slate-700">
            Category <span className="font-normal text-slate-400">(optional)</span>
          </span>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="">None</option>
            {SOP_TIER_ORDER.map((t) => (
              <option key={t} value={t}>
                {SOP_TIER_LABELS[t]}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="block text-sm">
        <span className="font-medium text-slate-700">
          Text <span className="font-normal text-slate-400">(optional now)</span>
        </span>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={6}
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
      </label>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        type="submit"
        disabled={pending || !name.trim()}
        className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:bg-slate-300"
      >
        {pending ? "Creating…" : "Create SOP"}
      </button>
    </form>
  );
}
