"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { deleteJobRole, renameJobRole, setSopInRole } from "../actions";

export function RoleEditor({
  role,
  allSops,
  linkedSopIds,
  staff,
}: {
  role: { id: string; name: string };
  allSops: { id: string; name: string; published_version: number | null }[];
  linkedSopIds: string[];
  staff: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [name, setName] = useState(role.name);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState("");

  const linked = useMemo(() => new Set(linkedSopIds), [linkedSopIds]);

  function act(fn: () => Promise<{ ok: boolean; error?: string }>, done?: string) {
    start(async () => {
      setErr(null);
      setMsg(null);
      const r = await fn();
      if (r.ok) {
        setMsg(done ?? "Saved");
        router.refresh();
      } else {
        setErr(r.error ?? "Something went wrong.");
      }
    });
  }

  const inSuite = allSops.filter((s) => linked.has(s.id));
  const q = filter.trim().toLowerCase();
  const available = allSops.filter(
    (s) => !linked.has(s.id) && (q === "" || s.name.toLowerCase().includes(q)),
  );

  return (
    <div className="mt-3 space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <label className="block text-sm">
          <span className="font-medium text-slate-700">Name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 w-64 rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </label>
        <button
          type="button"
          disabled={pending || name.trim() === role.name}
          onClick={() => act(() => renameJobRole(role.id, name), "Renamed")}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 disabled:opacity-40"
        >
          Save name
        </button>
      </div>

      {msg && <p className="text-sm text-green-700">{msg}</p>}
      {err && <p className="text-sm text-red-600">{err}</p>}

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          SOP suite ({inSuite.length})
        </h2>
        {inSuite.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">No SOPs in this suite yet.</p>
        ) : (
          <ul className="mt-2 space-y-1 text-sm">
            {inSuite.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-3">
                <span>
                  {s.name}
                  {s.published_version == null && (
                    <span className="ml-1 text-xs text-amber-600">(not published)</span>
                  )}
                </span>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() =>
                    act(() => setSopInRole(role.id, s.id, false), "Removed")
                  }
                  className="text-xs text-slate-400 underline hover:text-slate-700"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-4 border-t border-slate-100 pt-3">
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Find a SOP to add"
            className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
          />
          {filter.trim() !== "" && (
            <ul className="mt-2 max-h-56 space-y-1 overflow-auto text-sm">
              {available.slice(0, 20).map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-3">
                  <span>{s.name}</span>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() =>
                      act(() => setSopInRole(role.id, s.id, true), "Added")
                    }
                    className="text-xs font-medium text-slate-700 underline"
                  >
                    Add
                  </button>
                </li>
              ))}
              {available.length === 0 && (
                <li className="text-slate-400">No match.</li>
              )}
            </ul>
          )}
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Staff in this role ({staff.length})
        </h2>
        {staff.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">No one is assigned this role.</p>
        ) : (
          <ul className="mt-2 space-y-1 text-sm">
            {staff.map((s) => (
              <li key={s.id}>
                <Link
                  href={`/admin/staff/${s.id}`}
                  className="text-slate-700 underline"
                >
                  {s.name}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            if (!confirm(`Delete the "${role.name}" role?`)) return;
            start(async () => {
              const r = await deleteJobRole(role.id);
              if (r.ok) router.push("/admin/job-roles");
              else setErr(r.error ?? "Could not delete.");
            });
          }}
          className="text-xs font-medium text-red-600 underline"
        >
          Delete this role
        </button>
      </section>
    </div>
  );
}
