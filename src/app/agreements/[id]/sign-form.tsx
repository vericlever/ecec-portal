"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { signAgreement } from "../actions";

export function AgreementSignForm({ agreementId }: { agreementId: string }) {
  const router = useRouter();
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          setError(null);
          const r = await signAgreement(agreementId);
          if (r.ok) router.refresh();
          else setError(r.error);
        });
      }}
      className="mt-6 rounded-lg border border-slate-200 bg-white p-4"
    >
      <label className="flex items-start gap-3 text-sm">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(e) => setConfirmed(e.target.checked)}
          className="mt-0.5 h-4 w-4"
        />
        <span>
          I have read this agreement and I accept it.
        </span>
      </label>
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={!confirmed || pending}
        className="mt-4 rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-slate-300"
      >
        {pending ? "Signing…" : "Sign"}
      </button>
    </form>
  );
}
