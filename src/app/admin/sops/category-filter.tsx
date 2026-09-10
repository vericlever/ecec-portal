"use client";

import { useRouter, useSearchParams } from "next/navigation";

export function CategoryFilter({
  categories,
}: {
  categories: { id: string; name: string }[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const current = searchParams.get("category") ?? "";

  return (
    <select
      value={current}
      onChange={(e) => {
        const v = e.target.value;
        router.push(v ? `/admin/sops?category=${v}` : "/admin/sops");
      }}
      className="rounded-md border border-slate-300 px-3 py-2 text-sm"
    >
      <option value="">All categories</option>
      {categories.map((c) => (
        <option key={c.id} value={c.id}>
          {c.name}
        </option>
      ))}
    </select>
  );
}
