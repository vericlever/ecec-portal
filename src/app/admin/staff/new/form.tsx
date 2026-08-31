"use client";

import Link from "next/link";
import { useFormState, useFormStatus } from "react-dom";
import { createStaff, type CreateStaffState } from "./actions";

const initial: CreateStaffState = { status: "idle" };

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:bg-slate-300"
    >
      {pending ? "Creating…" : "Create account"}
    </button>
  );
}

export function NewStaffForm({
  sites,
}: {
  sites: { id: string; name: string }[];
}) {
  const [state, formAction] = useFormState(createStaff, initial);

  if (state.status === "created") {
    return (
      <div className="mt-6 rounded-lg border border-green-200 bg-green-50 p-4 text-sm">
        <p className="font-medium text-green-800">Account created for {state.email}.</p>
        <p className="mt-2 text-green-800">
          Temporary password:{" "}
          <code className="rounded bg-white px-1.5 py-0.5 font-mono text-slate-900">
            {state.tempPassword}
          </code>
        </p>
        <p className="mt-2 text-green-700">
          Pass this to them securely. It is shown once.
        </p>
        <div className="mt-4 flex gap-3">
          <Link
            href="/admin/staff"
            className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700"
          >
            Back to staff
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form action={formAction} className="mt-6 space-y-4">
      <div>
        <label htmlFor="full_name" className="block text-sm font-medium text-slate-700">
          Full name
        </label>
        <input
          id="full_name"
          name="full_name"
          required
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
      </div>

      <div>
        <label htmlFor="email" className="block text-sm font-medium text-slate-700">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
      </div>

      <div>
        <label htmlFor="role" className="block text-sm font-medium text-slate-700">
          Role
        </label>
        <select
          id="role"
          name="role"
          defaultValue="educator"
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="educator">Educator</option>
          <option value="centre_director">Centre director</option>
        </select>
      </div>

      <div>
        <label htmlFor="site_id" className="block text-sm font-medium text-slate-700">
          Site
        </label>
        <select
          id="site_id"
          name="site_id"
          defaultValue=""
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="">All sites</option>
          {sites.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>

      {state.status === "error" && (
        <p className="text-sm text-red-600">{state.error}</p>
      )}

      <Submit />
    </form>
  );
}
