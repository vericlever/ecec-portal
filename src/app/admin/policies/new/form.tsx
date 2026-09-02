"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { PolicyCategory } from "@/lib/policy-categories";
import { createPolicy } from "../actions";

export function NewPolicyForm({
  categories,
}: {
  categories: PolicyCategory[];
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [body, setBody] = useState("");
  const [categoryIds, setCategoryIds] = useState<string[]>(
    categories.filter((c) => c.slug === "general").map((c) => c.id),
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const toggle = (id: string) =>
    setCategoryIds((cur) =>
      cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id],
    );

  return (
    <form
      className="mt-6 space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          setError(null);
          const r = await createPolicy({ name, body, categoryIds });
          if (r.ok && r.id) router.push(`/admin/policies/${r.id}`);
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

      <fieldset className="text-sm">
        <span className="font-medium text-slate-700">Categories</span>
        <div className="mt-1 space-y-1">
          {categories.map((c) => (
            <label key={c.id} className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={categoryIds.includes(c.id)}
                onChange={() => toggle(c.id)}
              />
              <span>
                {c.name}
                {c.is_parent_facing && (
                  <span className="ml-1 text-xs text-purple-700">
                    (parents can view these)
                  </span>
                )}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

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
        {pending ? "Creating…" : "Create policy"}
      </button>
    </form>
  );
}
