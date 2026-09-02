"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createJobRole } from "./actions";

export function NewRoleInline() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          setError(null);
          const r = await createJobRole(name);
          if (r.ok && r.id) router.push(`/admin/job-roles/${r.id}`);
          else if (!r.ok) setError(r.error);
        });
      }}
    >
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="New job role name"
        className="rounded-md border border-slate-300 px-3 py-1.5 text-sm"
      />
      <button
        type="submit"
        disabled={pending || !name.trim()}
        className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40"
      >
        {pending ? "Adding…" : "Add role"}
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </form>
  );
}
