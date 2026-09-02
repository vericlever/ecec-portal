"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  deleteAgreement,
  publishAgreement,
  setAgreementJobRole,
  unpublishAgreement,
  updateAgreementBody,
  updateAgreementMeta,
} from "../actions";

type Agreement = {
  id: string;
  name: string;
  body: string;
  published_body: string;
  published_version: number | null;
  published_at: string | null;
  all_staff: boolean;
  linked_policy_id: string | null;
};

export function AgreementEditor({
  agreement,
  jobRoles,
  policies,
  linkedRoleIds,
  roster,
}: {
  agreement: Agreement;
  jobRoles: { id: string; name: string }[];
  policies: { id: string; name: string }[];
  linkedRoleIds: string[];
  roster: { id: string; name: string; signedAt: string | null }[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const [name, setName] = useState(agreement.name);
  const [allStaff, setAllStaff] = useState(agreement.all_staff);
  const [linkedPolicyId, setLinkedPolicyId] = useState(
    agreement.linked_policy_id ?? "",
  );
  const [body, setBody] = useState(agreement.body);

  const linked = new Set(linkedRoleIds);
  const published = agreement.published_version != null;
  const dirty = body !== agreement.published_body;
  const signedCount = roster.filter((r) => r.signedAt).length;

  function act(
    fn: () => Promise<{ ok: boolean; error?: string }>,
    done?: string,
  ) {
    start(async () => {
      setErr(null);
      setMsg(null);
      const r = await fn();
      if (r.ok) {
        setMsg(done ?? "Saved");
        router.refresh();
      } else {
        setErr(r.error ?? "Something went wrong.");
      }
    });
  }

  return (
    <div className="mt-3 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">{agreement.name}</h1>
          <p className="mt-1 text-xs text-slate-500">
            {published
              ? `Published v${agreement.published_version}` +
                (agreement.published_at
                  ? ` on ${new Date(agreement.published_at).toLocaleDateString("en-AU", { dateStyle: "medium" })}`
                  : "") +
                (dirty ? " · unpublished changes below" : "")
              : "Not published — staff cannot see this yet"}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              act(
                () => publishAgreement(agreement.id),
                published ? "Published new version" : "Published",
              )
            }
            className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-40"
          >
            {published ? (dirty ? "Publish changes" : "Re-publish") : "Publish"}
          </button>
          {published && (
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                act(() => unpublishAgreement(agreement.id), "Unpublished")
              }
              className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 disabled:opacity-40"
            >
              Unpublish
            </button>
          )}
        </div>
      </div>

      {published && dirty && (
        <p className="rounded-md border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-800">
          Publishing changes bumps the version. Everyone who signed the old
          version has to read and sign again.
        </p>
      )}
      {msg && <p className="text-sm text-green-700">{msg}</p>}
      {err && <p className="text-sm text-red-600">{err}</p>}

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Details
        </h2>
        <div className="mt-3 space-y-3">
          <label className="block text-sm">
            <span className="font-medium text-slate-700">Name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={allStaff}
              onChange={(e) => setAllStaff(e.target.checked)}
            />
            <span>Every staff member must sign this</span>
          </label>
          <label className="block text-sm">
            <span className="font-medium text-slate-700">
              Linked policy{" "}
              <span className="font-normal text-slate-400">(optional)</span>
            </span>
            <select
              value={linkedPolicyId}
              onChange={(e) => setLinkedPolicyId(e.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="">None</option>
              {policies.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <span className="mt-1 block text-xs text-slate-500">
              Staff can open the linked policy from the signing screen, for
              agreements like the Child Safety Policy and Code of Conduct.
            </span>
          </label>
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              act(
                () =>
                  updateAgreementMeta(agreement.id, {
                    name,
                    allStaff,
                    linkedPolicyId: linkedPolicyId || null,
                  }),
                "Details saved",
              )
            }
            className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 disabled:opacity-40"
          >
            Save details
          </button>
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Text staff read and sign
        </h2>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={14}
          className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-xs"
        />
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            act(() => updateAgreementBody(agreement.id, body), "Text saved")
          }
          className="mt-2 rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 disabled:opacity-40"
        >
          Save text
        </button>
      </section>

      {!allStaff && (
        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Job roles that must sign
          </h2>
          <div className="mt-2 space-y-1.5">
            {jobRoles.map((r) => (
              <label key={r.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={linked.has(r.id)}
                  disabled={pending}
                  onChange={(e) =>
                    act(
                      () =>
                        setAgreementJobRole(agreement.id, r.id, e.target.checked),
                      e.target.checked ? "Added" : "Removed",
                    )
                  }
                />
                <span>{r.name}</span>
              </label>
            ))}
          </div>
        </section>
      )}

      {published && (
        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Signatures ({signedCount} of {roster.length})
          </h2>
          <ul className="mt-2 divide-y divide-slate-100 text-sm">
            {roster.map((r) => (
              <li
                key={r.id}
                className="flex items-center justify-between py-1.5"
              >
                <span className="text-slate-700">{r.name}</span>
                {r.signedAt ? (
                  <span className="text-xs text-green-700">
                    signed{" "}
                    {new Date(r.signedAt).toLocaleDateString("en-AU", {
                      dateStyle: "medium",
                    })}
                  </span>
                ) : (
                  <span className="text-xs text-amber-700">not signed</span>
                )}
              </li>
            ))}
            {roster.length === 0 && (
              <li className="py-1.5 text-slate-500">
                No active staff are targeted by this agreement.
              </li>
            )}
          </ul>
        </section>
      )}

      <section>
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            if (!confirm(`Delete "${agreement.name}"? This cannot be undone.`))
              return;
            start(async () => {
              const r = await deleteAgreement(agreement.id);
              if (r.ok) router.push("/admin/agreements");
              else setErr(r.error ?? "Could not delete.");
            });
          }}
          className="text-xs font-medium text-red-600 underline"
        >
          Delete this agreement
        </button>
      </section>
    </div>
  );
}
