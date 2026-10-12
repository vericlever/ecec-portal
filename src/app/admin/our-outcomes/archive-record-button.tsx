"use client";

import { useTransition } from "react";
import { archiveRecord } from "./actions";

export function ArchiveRecordButton({ recordId }: { recordId: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        start(async () => {
          await archiveRecord(recordId);
        })
      }
      className="rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-600 disabled:opacity-50"
    >
      Archive
    </button>
  );
}
