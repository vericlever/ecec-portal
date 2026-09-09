"use client";

import type { TagOption } from "@/lib/tags";

// A capped checkbox list. Once `selectedIds` reaches `max`, the unticked
// options disable so the cap cannot be exceeded from the UI. The DB triggers
// (migrations 0039 / 0040) are the backstop for anything that bypasses this.
export function TagPicker({
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
  const atCap = selected.size >= max;

  return (
    <fieldset>
      <legend className="text-sm font-medium text-slate-700">{legend}</legend>
      <p className="mt-0.5 text-xs text-slate-500">
        {hint ? `${hint} ` : ""}
        Choose up to {max}.
        {atCap && (
          <span className="text-slate-400"> Limit reached.</span>
        )}
      </p>
      <div className="mt-2 space-y-1.5">
        {options.map((o) => {
          const checked = selected.has(o.id);
          return (
            <label
              key={o.id}
              className={`flex items-start gap-2 text-sm ${
                !checked && (atCap || disabled) ? "text-slate-400" : ""
              }`}
            >
              <input
                type="checkbox"
                className="mt-0.5"
                checked={checked}
                disabled={disabled || (!checked && atCap)}
                onChange={(e) => onToggle(o.id, e.target.checked)}
              />
              <span>
                <span className="font-medium text-slate-600">{o.code}</span>{" "}
                {o.name}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
