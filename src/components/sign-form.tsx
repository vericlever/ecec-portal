"use client";

import { useRef, useState } from "react";
import { SignaturePad, type SignaturePadHandle } from "./signature-pad";

// Step 57, A4. Shared by contract signing, countersigning, and (Part B)
// agreement signing/countersigning - one component so all three read as the
// same act to a staff member, and so Part B needs no new signing UI at all.
export function SignForm({
  onSign,
  pending,
  submitLabel = "Sign",
}: {
  onSign: (opts: { name: string; signatureDataUrl: string }) => void;
  pending: boolean;
  submitLabel?: string;
}) {
  const padRef = useRef<SignaturePadHandle>(null);
  const [hasStrokes, setHasStrokes] = useState(false);
  const [name, setName] = useState("");
  const [consented, setConsented] = useState(false);

  const canSign = hasStrokes && name.trim().length > 0 && consented && !pending;

  function submit() {
    const dataUrl = padRef.current?.getDataUrl();
    if (!dataUrl || !name.trim() || !consented) return;
    onSign({ name: name.trim(), signatureDataUrl: dataUrl });
  }

  return (
    <div className="space-y-3">
      <div>
        <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Signature
        </label>
        <SignaturePad ref={padRef} onStrokeChange={setHasStrokes} className="mt-1.5" />
      </div>

      <div>
        <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Full legal name
        </label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Type your full legal name"
          className="mt-1.5 w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
        />
      </div>

      <label className="flex items-start gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          checked={consented}
          onChange={(e) => setConsented(e.target.checked)}
          className="mt-0.5"
        />
        <span>
          I have read this document, I agree to be bound by it and I consent to signing it
          electronically.
        </span>
      </label>

      <button
        type="button"
        disabled={!canSign}
        onClick={submit}
        className="rounded-md bg-slate-900 px-4 py-1.5 text-sm font-medium text-white disabled:opacity-40"
      >
        {pending ? "Signing..." : submitLabel}
      </button>
    </div>
  );
}
