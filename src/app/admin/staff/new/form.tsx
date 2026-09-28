"use client";

import Link from "next/link";
import { useFormState, useFormStatus } from "react-dom";
import { createStaff, type CreateStaffState } from "./actions";
import { ASSIGNABLE_TIERS } from "@/lib/roles";

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
  canSetTier,
  services,
  jobRoles,
}: {
  canSetTier: boolean;
  services: { id: string; name: string }[];
  jobRoles: { id: string; name: string; is_placeholder: boolean }[];
}) {
  const [state, formAction] = useFormState(createStaff, initial);

  if (state.status === "created") {
    return (
      <div className="mt-6 rounded-lg border border-green-200 bg-green-50 p-4 text-sm">
        <p className="font-medium text-green-800">
          Account created for {state.email}.
        </p>

        {state.emailed ? (
          <p className="mt-2 text-green-800">
            An invite to set their password has been emailed to them.
          </p>
        ) : (
          <>
            <p className="mt-2 text-green-800">
              Email is not set up yet, so send them their first-login link
              yourself:
            </p>
            {state.inviteLink && (
              <p className="mt-1 break-all rounded bg-white px-2 py-1.5 font-mono text-xs text-slate-800">
                {state.inviteLink}
              </p>
            )}
            <p className="mt-2 text-green-800">
              Or a temporary password:{" "}
              <code className="rounded bg-white px-1.5 py-0.5 font-mono text-slate-900">
                {state.tempPassword}
              </code>
            </p>
            <p className="mt-2 text-green-700">
              Pass these on securely. They are shown once.
            </p>
          </>
        )}

        <div className="mt-4">
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
      <Field label="Full name" htmlFor="full_name">
        <input
          id="full_name"
          name="full_name"
          required
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
      </Field>

      <Field label="Email" htmlFor="email">
        <input
          id="email"
          name="email"
          type="email"
          required
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
      </Field>

      {canSetTier ? (
        <Field label="Access tier" htmlFor="access_tier">
          <select
            id="access_tier"
            name="access_tier"
            defaultValue="staff"
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          >
            {ASSIGNABLE_TIERS.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </Field>
      ) : (
        <p className="text-xs text-slate-500">
          New accounts you create are Staff tier.
        </p>
      )}

      <Field label="Job role" htmlFor="job_role_id">
        <select
          id="job_role_id"
          name="job_role_id"
          defaultValue=""
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="">No job role yet</option>
          {jobRoles.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
              {r.is_placeholder ? " (no procedures attached)" : ""}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Home service" htmlFor="service_id">
        <select
          id="service_id"
          name="service_id"
          defaultValue=""
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="">Unassigned</option>
          {services.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </Field>

      {canSetTier && (
        <fieldset>
          <legend className="block text-sm font-medium text-slate-700">
            Service access
          </legend>
          <p className="mt-0.5 text-xs text-slate-500">
            Extra services this person&rsquo;s reach (as a manager or HR
            manager) and applicable policies span, beyond their home service
            above.
          </p>
          <div className="mt-2 space-y-1.5">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="all_services" value="on" className="h-4 w-4" />
              <span>All services (including any added later)</span>
            </label>
            {services.map((s) => (
              <label key={s.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="service_ids"
                  value={s.id}
                  className="h-4 w-4"
                />
                <span>{s.name}</span>
              </label>
            ))}
          </div>
        </fieldset>
      )}

      {state.status === "error" && (
        <p className="text-sm text-red-600">{state.error}</p>
      )}

      <Submit />
    </form>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="block text-sm font-medium text-slate-700">
        {label}
      </label>
      {children}
    </div>
  );
}
