"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

const STATUS_OPTIONS = [
  { value: "not_started", label: "Not started" },
  { value: "in_progress", label: "In progress" },
  { value: "complete", label: "Complete" },
  { value: "overdue", label: "Overdue" },
  { value: "due_soon", label: "Due soon" },
  { value: "paused", label: "Paused" },
];

// Step 55. Search, service, job role, procedure and status all live in the
// URL together (Step 48's pattern), so reloading or sending a colleague a
// link restores the same filtered view. Service is only a control for an
// Admin - a Manager (staff) is pinned to their own and the page never shows
// them the selector at all (see page.tsx).
export function TrainingStatusFilters({
  basePath,
  services,
  jobRoles,
  sops,
  showServiceFilter,
  includeInactive,
}: {
  basePath: string;
  services: { id: string; name: string }[];
  jobRoles: { id: string; name: string }[];
  sops: { id: string; name: string }[];
  showServiceFilter: boolean;
  includeInactive: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const q = searchParams.get("q") ?? "";
  const service = searchParams.get("service") ?? "";
  const role = searchParams.get("role") ?? "";
  const sop = searchParams.get("sop") ?? "";
  const status = searchParams.get("status") ?? "";

  const [text, setText] = useState(q);
  useEffect(() => setText(q), [q]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function push(next: {
    q?: string;
    service?: string;
    role?: string;
    sop?: string;
    status?: string;
    inactive?: boolean;
  }) {
    const params = new URLSearchParams();
    const merged = {
      q: next.q ?? q,
      service: next.service ?? service,
      role: next.role ?? role,
      sop: next.sop ?? sop,
      status: next.status ?? status,
      inactive: next.inactive ?? includeInactive,
    };
    if (merged.q) params.set("q", merged.q);
    if (merged.service) params.set("service", merged.service);
    if (merged.role) params.set("role", merged.role);
    if (merged.sop) params.set("sop", merged.sop);
    if (merged.status) params.set("status", merged.status);
    if (merged.inactive) params.set("inactive", "1");
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
        placeholder="Search staff or procedure…"
        className="w-56 rounded-md border border-slate-300 px-3 py-2 text-sm"
      />
      {showServiceFilter && (
        <select
          value={service}
          onChange={(e) => push({ service: e.target.value })}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="">All services</option>
          {services.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      )}
      <select
        value={role}
        onChange={(e) => push({ role: e.target.value })}
        className="rounded-md border border-slate-300 px-3 py-2 text-sm"
      >
        <option value="">All job roles</option>
        {jobRoles.map((r) => (
          <option key={r.id} value={r.id}>
            {r.name}
          </option>
        ))}
      </select>
      <select
        value={sop}
        onChange={(e) => push({ sop: e.target.value })}
        className="rounded-md border border-slate-300 px-3 py-2 text-sm"
      >
        <option value="">All procedures</option>
        {sops.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
      <select
        value={status}
        onChange={(e) => push({ status: e.target.value })}
        className="rounded-md border border-slate-300 px-3 py-2 text-sm"
      >
        <option value="">All statuses</option>
        {STATUS_OPTIONS.map((s) => (
          <option key={s.value} value={s.value}>
            {s.label}
          </option>
        ))}
      </select>
      <label className="flex items-center gap-1.5 text-sm text-slate-600">
        <input
          type="checkbox"
          checked={includeInactive}
          onChange={(e) => push({ inactive: e.target.checked })}
        />
        Include inactive
      </label>
    </div>
  );
}
