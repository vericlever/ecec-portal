"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

// Step 48. Search, category and status all live in the URL together, so
// reloading (or sending a colleague the link) restores the same filtered
// view. Changing one param preserves the others - the previous
// category-only filter dropped q/status whenever it changed.
export function AdminListFilters({
  basePath,
  categories,
  statusOptions,
}: {
  basePath: string;
  categories: { id: string; name: string }[];
  statusOptions: { value: string; label: string }[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const q = searchParams.get("q") ?? "";
  const category = searchParams.get("category") ?? "";
  const status = searchParams.get("status") ?? "";

  const [text, setText] = useState(q);
  useEffect(() => setText(q), [q]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function push(next: { q?: string; category?: string; status?: string }) {
    const params = new URLSearchParams();
    const merged = {
      q: next.q ?? q,
      category: next.category ?? category,
      status: next.status ?? status,
    };
    if (merged.q) params.set("q", merged.q);
    if (merged.category) params.set("category", merged.category);
    if (merged.status) params.set("status", merged.status);
    const qs = params.toString();
    router.push(qs ? `${basePath}?${qs}` : basePath);
  }

  function onSearchChange(value: string) {
    setText(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => push({ q: value }), 350);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        type="text"
        value={text}
        onChange={(e) => onSearchChange(e.target.value)}
        placeholder="Search by title…"
        className="w-48 rounded-md border border-slate-300 px-3 py-2 text-sm"
      />
      <select
        value={category}
        onChange={(e) => push({ category: e.target.value })}
        className="rounded-md border border-slate-300 px-3 py-2 text-sm"
      >
        <option value="">All categories</option>
        {categories.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      <select
        value={status}
        onChange={(e) => push({ status: e.target.value })}
        className="rounded-md border border-slate-300 px-3 py-2 text-sm"
      >
        <option value="">All statuses</option>
        {statusOptions.map((s) => (
          <option key={s.value} value={s.value}>
            {s.label}
          </option>
        ))}
      </select>
    </div>
  );
}
