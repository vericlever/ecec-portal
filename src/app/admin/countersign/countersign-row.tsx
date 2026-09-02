"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { countersignSop } from "./actions";

export function CountersignRow({
  id,
  staffName,
  sopName,
  signedAt,
}: {
  id: string;
  staffName: string;
  sopName: string;
  signedAt: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <li className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
      <div>
        <span className="font-medium">{staffName}</span>
        <span className="text-slate-400"> · {sopName}</span>
        <div className="text-xs text-slate-400">
          signed{" "}
          {new Date(signedAt).toLocaleDateString("en-AU", { dateStyle: "medium" })}
        </div>
        {error && <p className="text-xs text-red-600">{error}</p>}
      </div>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setError(null);
            const r = await countersignSop(id);
            if (r.ok) router.refresh();
            else setError(r.error);
          })
        }
        className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40"
      >
        {pending ? "Signing…" : "Countersign"}
      </button>
    </li>
  );
}
