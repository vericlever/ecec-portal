"use client";

import type { TagOption } from "@/lib/tags";

// Same idea as TagPicker (a capped multi-select, `max` disables further
// additions once reached, the DB triggers in migrations 0039/0040 are the
// backstop) but as chips + an "Add..." dropdown instead of a full checkbox
// list - for the bulk review screens, where one of these renders per row and
// a checkbox list (7-11 options each) made a long batch very tall to scroll.
export function TagSelect({
  legend,
  hint,
  options,
  selectedIds,
  max,
  disabled = false,
  onToggle,
}: {
  legend: string;
  hint?: string;
  options: TagOption[];
  selectedIds: number[];
  max: number;
  disabled?: boolean;
  onToggle: (id: number, checked: boolean) => void;
}) {
  const selected = new Set(selectedIds);
  const addable = options.filter((o) => !selected.has(o.id));
  const atCap = selectedIds.length >= max;

  return (
    <div>
      <span className="text-xs font-medium text-slate-500">{legend}</span>
      {hint && <p className="mt-0.5 text-xs text-slate-500">{hint}</p>}
      <div className="mt-1 flex flex-wrap items-center gap-1.5">
        {selectedIds.map((id) => {
          const opt = options.find((o) => o.id === id);
          return (
            <span
              key={id}
              className="flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700"
            >
              {opt ? `${opt.code} ${opt.name}` : "…"}
              <button
                type="button"
                disabled={disabled}
                onClick={() => onToggle(id, false)}
                className="text-slate-400 hover:text-slate-700"
                aria-label={`Remove ${opt?.code ?? "tag"}`}
              >
                &times;
              </button>
            </span>
          );
        })}
        {!disabled && !atCap && addable.length > 0 && (
          <select
            value=""
            onChange={(e) => {
              if (!e.target.value) return;
              onToggle(Number(e.target.value), true);
            }}
            className="rounded-md border border-slate-300 px-2 py-1 text-xs"
          >
            <option value="">Add…</option>
            {addable.map((o) => (
              <option key={o.id} value={o.id}>
                {o.code} &middot; {o.name}
              </option>
            ))}
          </select>
        )}
        {atCap && (
          <span className="text-xs text-slate-400">Limit reached ({max}).</span>
        )}
      </div>
    </div>
  );
}
