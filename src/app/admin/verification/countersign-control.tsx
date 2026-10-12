"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { SignForm } from "@/components/sign-form";
import { countersignContract } from "../staff/[profileId]/actions";

export function CountersignControl({ contractId }: { contractId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <div className="mt-2 rounded-md border border-slate-200 bg-slate-50 p-3">
      <SignForm
        pending={pending}
        submitLabel="Countersign"
        onSign={({ name, signatureDataUrl }) =>
          start(async () => {
            setError(null);
            const r = await countersignContract(contractId, name, signatureDataUrl);
            if (r.ok) router.refresh();
            else setError(r.error);
          })
        }
      />
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}