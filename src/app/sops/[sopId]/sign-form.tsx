"use client";

import { useEffect, useState } from "react";

type Status = "idle" | "signing" | "done";

export function SignForm({ sopId }: { sopId: string }) {
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>("idle");

  useEffect(() => {
    if (status !== "done") return;
    // Full navigation, not a client transition, so the SOP list reloads fresh
    // from the server and shows the new sign-off (the client router would serve
    // a cached copy).
    const timer = setTimeout(() => {
      window.location.assign("/sops");
    }, 1600);
    return () => clearTimeout(timer);
  }, [status]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setStatus("signing");
    try {
      const res = await fetch("/api/sign", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sopId }),
      });
      const data = await res.json();
      if (data.ok) {
        setStatus("done");
      } else {
        setError(data.error ?? "Could not sign this SOP.");
        setStatus("idle");
      }
    } catch {
      setError("Could not reach the server. Try again.");
      setStatus("idle");
    }
  }

  if (status === "done") {
    return (
      <div className="mt-6 flex flex-col items-center gap-3 rounded-lg border border-green-200 bg-green-50 p-8 text-center text-green-700">
        <svg viewBox="0 0 52 52" className="signoff-check h-14 w-14" aria-hidden="true">
          <circle
            className="signoff-check-circle"
            cx="26"
            cy="26"
            r="24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          />
          <path
            className="signoff-check-mark"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M15 27 l7.5 7.5 L38 17"
          />
        </svg>
        <p className="text-sm font-medium text-green-800">
          Signed. Taking you to the next one…
        </p>
      </div>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
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
          I have read this standard operating procedure and I understand what it
          requires of me.
        </span>
      </label>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      <button
        type="submit"
        disabled={!confirmed || status === "signing"}
        className="mt-4 rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-slate-300"
      >
        {status === "signing" ? "Signing…" : "Sign"}
      </button>
    </form>
  );
}
