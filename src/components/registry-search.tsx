"use client";

import { useEffect, useRef, useState } from "react";

export type RegistryItem = {
  code: string;
  name: string;
  secondary: string | null;
  status: string | null;
};

// A text input that suggests matches from the local training.gov.au mirror.
// Typing edits `value` freely; choosing a suggestion calls `onPick`.
export function RegistrySearch({
  label,
  type,
  kind,
  value,
  onChange,
  onPick,
  placeholder,
}: {
  label: string;
  type: "rto" | "component";
  kind?: string;
  value: string;
  onChange: (v: string) => void;
  onPick: (item: RegistryItem) => void;
  placeholder?: string;
}) {
  const [results, setResults] = useState<RegistryItem[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [loading, setLoading] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const lastQuery = useRef("");

  useEffect(() => {
    const q = value.trim();
    if (q.length < 2 || q === lastQuery.current) {
      if (q.length < 2) setResults([]);
      return;
    }
    const t = setTimeout(async () => {
      setLoading(true);
      const params = new URLSearchParams({ type, q });
      if (kind) params.set("kind", kind);
      try {
        const res = await fetch(`/api/registry/search?${params}`);
        const json = (await res.json()) as { results: RegistryItem[] };
        lastQuery.current = q;
        setResults(json.results ?? []);
        setActive(-1);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [value, type, kind]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  function choose(item: RegistryItem) {
    onPick(item);
    setOpen(false);
    setResults([]);
    lastQuery.current = item.code;
  }

  return (
    <div className="block text-sm" ref={boxRef}>
      <span className="font-medium text-slate-700">{label}</span>
      <div className="relative mt-1">
        <input
          value={value}
          placeholder={placeholder}
          autoComplete="off"
          onChange={(e) => {
            onChange(e.target.value);
            setOpen(true);
          }}
          onFocus={() => value.trim().length >= 2 && setOpen(true)}
          onKeyDown={(e) => {
            if (!open || results.length === 0) return;
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((a) => Math.min(a + 1, results.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => Math.max(a - 1, 0));
            } else if (e.key === "Enter" && active >= 0) {
              e.preventDefault();
              choose(results[active]);
            } else if (e.key === "Escape") {
              setOpen(false);
            }
          }}
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
        {open && (results.length > 0 || loading) && (
          <ul className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-md border border-slate-200 bg-white py-1 text-sm shadow-lg">
            {loading && results.length === 0 && (
              <li className="px-3 py-1.5 text-slate-400">Searching…</li>
            )}
            {results.map((r, i) => (
              <li key={r.code}>
                <button
                  type="button"
                  onMouseEnter={() => setActive(i)}
                  onClick={() => choose(r)}
                  className={`block w-full px-3 py-1.5 text-left ${
                    i === active ? "bg-slate-100" : ""
                  }`}
                >
                  <span className="font-medium">{r.code}</span>
                  <span className="text-slate-500"> — {r.name}</span>
                  {r.status && r.status !== "Current" && (
                    <span className="ml-1 text-xs text-amber-600">({r.status})</span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
