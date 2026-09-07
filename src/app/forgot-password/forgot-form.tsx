"use client";

import { useFormState, useFormStatus } from "react-dom";
import { requestPasswordReset, type ForgotState } from "./actions";

const initial: ForgotState = { done: false };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:bg-slate-300"
    >
      {pending ? "Sending…" : "Send reset link"}
    </button>
  );
}

export function ForgotPasswordForm() {
  const [state, formAction] = useFormState(requestPasswordReset, initial);

  if (state.done) {
    return (
      <div className="mt-6 space-y-3">
        <p className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
          If that email has an account, a link to set a new password is on its
          way. It expires after a short time.
        </p>
        {state.devLink && (
          <p className="break-all rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
            Email is not configured, so here is the link (development only):{" "}
            <a href={state.devLink} className="underline">
              {state.devLink}
            </a>
          </p>
        )}
      </div>
    );
  }

  return (
    <form action={formAction} className="mt-6 space-y-4">
      <div>
        <label
          htmlFor="email"
          className="block text-sm font-medium text-slate-700"
        >
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
      </div>
      <SubmitButton />
    </form>
  );
}
