"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  deletePolicy,
  linkSop,
  publishPolicy,
  unlinkSop,
  unpublishPolicy,
  updatePolicyBody,
  updatePolicyMeta,
  uploadPolicyDocument,
} from "../actions";

const DOC_TYPES = [
  { value: "policy", label: "Policy" },
  { value: "procedure", label: "Procedure" },
  { value: "handbook", label: "Handbook" },
  { value: "disaster_plan", label: "Disaster plan" },
];

type Policy = {
  id: string;
  name: string;
  document_type: string;
  is_parent_facing: boolean;
  service_id: string | null;
  program: string;
  body: string;
  published_body: string;
  published_version: number | null;
  published_at: string | null;
};

export function PolicyEditor({
  policy,
  services,
  sourceDoc,
  allSops,
  linkedSops,
}: {
  policy: Policy;
  services: { id: string; name: string }[];
  sourceDoc: {
    id: string;
    file_name: string;
    byte_size: number | null;
    extraction_note: string | null;
  } | null;
  allSops: { id: string; name: string }[];
  linkedSops: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const [name, setName] = useState(policy.name);
  const [documentType, setDocumentType] = useState(policy.document_type);
  const [parentFacing, setParentFacing] = useState(policy.is_parent_facing);
  const [serviceId, setServiceId] = useState(policy.service_id ?? "");
  const [program, setProgram] = useState(policy.program);
  const [body, setBody] = useState(policy.body);

  const fileRef = useRef<HTMLInputElement>(null);
  const [sopToAdd, setSopToAdd] = useState("");

  const published = policy.published_version != null;
  const dirty = body !== policy.published_body;

  function act(fn: () => Promise<{ ok: boolean; error?: string }>, done?: string) {
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
          <h1 className="text-xl font-semibold">{policy.name}</h1>
          <p className="mt-1 text-xs text-slate-500">
            {published
              ? `Published v${policy.published_version}` +
                (policy.published_at
                  ? ` on ${new Date(policy.published_at).toLocaleDateString("en-AU", { dateStyle: "medium" })}`
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
                () => publishPolicy(policy.id),
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
                act(() => unpublishPolicy(policy.id), "Unpublished")
              }
              className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 disabled:opacity-40"
            >
              Unpublish
            </button>
          )}
        </div>
      </div>

      {msg && <p className="text-sm text-green-700">{msg}</p>}
      {err && <p className="text-sm text-red-600">{err}</p>}

      {/* Details */}
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
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm">
              <span className="font-medium text-slate-700">Type</span>
              <select
                value={documentType}
                onChange={(e) => setDocumentType(e.target.value)}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              >
                {DOC_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="font-medium text-slate-700">Site</span>
              <select
                value={serviceId}
                onChange={(e) => setServiceId(e.target.value)}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="">All sites</option>
                {services.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} only
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={parentFacing}
              onChange={(e) => setParentFacing(e.target.checked)}
            />
            <span className="text-slate-700">
              Parent-facing (carries a parent-notification obligation)
            </span>
          </label>
          <label className="block text-sm">
            <span className="font-medium text-slate-700">
              Program <span className="font-normal text-slate-400">(optional)</span>
            </span>
            <input
              value={program}
              onChange={(e) => setProgram(e.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              act(
                () =>
                  updatePolicyMeta(policy.id, {
                    name,
                    documentType,
                    isParentFacing: parentFacing,
                    serviceId: serviceId || null,
                    program,
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

      {/* Document */}
      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Source document
        </h2>
        {sourceDoc ? (
          <p className="mt-2 text-sm">
            <a
              href={`/api/documents/${sourceDoc.id}`}
              className="font-medium text-slate-800 underline"
            >
              {sourceDoc.file_name}
            </a>
            {sourceDoc.byte_size != null && (
              <span className="text-slate-400">
                {" "}
                · {(sourceDoc.byte_size / 1024).toFixed(0)} KB
              </span>
            )}
          </p>
        ) : (
          <p className="mt-2 text-sm text-slate-500">No document uploaded.</p>
        )}
        {sourceDoc?.extraction_note && (
          <p className="mt-1 text-xs text-amber-700">{sourceDoc.extraction_note}</p>
        )}
        <form
          className="mt-3 flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData();
            const f = fileRef.current?.files?.[0];
            if (!f) return;
            fd.append("file", f);
            act(() => uploadPolicyDocument(policy.id, fd), "Document uploaded");
            if (fileRef.current) fileRef.current.value = "";
          }}
        >
          <input
            ref={fileRef}
            type="file"
            accept=".docx,.pdf,.txt,.md,.html,.htm"
            className="text-sm text-slate-600 file:mr-3 file:rounded-md file:border file:border-slate-300 file:bg-slate-50 file:px-3 file:py-1.5 file:text-xs file:font-medium"
          />
          <button
            type="submit"
            disabled={pending}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 disabled:opacity-40"
          >
            {sourceDoc ? "Replace" : "Upload"}
          </button>
        </form>
      </section>

      {/* Text */}
      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Text staff read
        </h2>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={16}
          className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-xs"
        />
        <div className="mt-2 flex items-center gap-3">
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              act(() => updatePolicyBody(policy.id, body), "Text saved")
            }
            className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 disabled:opacity-40"
          >
            Save text
          </button>
          {published && dirty && (
            <span className="text-xs text-amber-700">
              Publish to make these changes visible to staff.
            </span>
          )}
        </div>
      </section>

      {/* Linked SOPs */}
      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Linked SOPs
        </h2>
        {linkedSops.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">No SOPs linked.</p>
        ) : (
          <ul className="mt-2 space-y-1 text-sm">
            {linkedSops.map((s) => (
              <li key={s.id} className="flex items-center justify-between">
                <span>{s.name}</span>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() =>
                    act(() => unlinkSop(policy.id, s.id), "Unlinked")
                  }
                  className="text-xs text-slate-400 underline hover:text-slate-700"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input
            list="sop-options"
            value={sopToAdd}
            onChange={(e) => setSopToAdd(e.target.value)}
            placeholder="Find a SOP by name"
            className="min-w-0 flex-1 rounded-md border border-slate-300 px-3 py-1.5 text-sm"
          />
          <datalist id="sop-options">
            {allSops.map((s) => (
              <option key={s.id} value={s.name} />
            ))}
          </datalist>
          <button
            type="button"
            disabled={pending || !sopToAdd.trim()}
            onClick={() => {
              const match = allSops.find(
                (s) => s.name.toLowerCase() === sopToAdd.trim().toLowerCase(),
              );
              if (!match) {
                setErr("Pick a SOP from the list.");
                return;
              }
              act(() => linkSop(policy.id, match.id), "Linked");
              setSopToAdd("");
            }}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 disabled:opacity-40"
          >
            Link
          </button>
        </div>
      </section>

      {/* Delete */}
      <section>
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            if (!confirm(`Delete "${policy.name}"? This cannot be undone.`)) return;
            start(async () => {
              const r = await deletePolicy(policy.id);
              if (r.ok) router.push("/admin/policies");
              else setErr(r.error ?? "Could not delete.");
            });
          }}
          className="text-xs font-medium text-red-600 underline"
        >
          Delete this policy
        </button>
      </section>
    </div>
  );
}
