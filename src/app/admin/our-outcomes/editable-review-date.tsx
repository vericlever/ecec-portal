"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateReviewDate } from "./actions";

// B2: the date can be changed here, on the Review policies list, or on the
// item's own review page/editor - same field, same permissions, same log
// (review_date_changes), everywhere it appears.
export function EditableReviewDate({
  itemType,
  itemId,
  currentDate,
}: {
  itemType: "sop" | "policy";
  itemId: string;
  currentDate: string | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [value, setValue] = useState(currentDate ?? "");
  const [error, setError] = useState<string | null>(null);

  function save(newValue: string) {
    setError(null);
    start(async () => {
      const result = await updateReviewDate(itemType, itemId, newValue);
      if (!result.ok) {
        setError(result.error);
        setValue(currentDate ?? "");
        return;
      }
      router.refresh();
    });
  }

  return (
    <span className="inline-flex items-center gap-1">
      <input
        type="date"
        value={value}
        disabled={pending}
        onChange={(e) => {
          setValue(e.target.value);
          if (e.target.value) save(e.target.value);
        }}
        className="rounded-md border border-slate-300 px-1.5 py-0.5 text-xs disabled:opacity-50"
      />
      {error && <span className="text-xs text-red-600">{error}</span>}
    </span>
  );
}
