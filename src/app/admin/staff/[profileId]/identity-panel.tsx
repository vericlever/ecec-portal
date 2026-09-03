"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { SightingControl } from "./record-controls";
import { uploadIdentityDocument, deleteIdentityDocument } from "./actions";

export type IdentityDoc = {
  id: string;
  kind: "photo_id" | "visa" | "other";
  label: string | null;
  document_id: string | null;
  sighted_at: string | null;
  sighted_by: string | null;
};

const KIND_LABEL: Record<IdentityDoc["kind"], string> = {
  photo_id: "Photo ID",
  visa: "Visa document",
  other: "Other identity document",
};

export function IdentityPanel({
  profileId,
  docs,
  canSight,
}: {
  profileId: string;
  docs: IdentityDoc[];
  canSight: boolean;
}) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const onSubmit = (form: HTMLFormElement) => {
    start(async () => {
      setError(null);
      const r = await uploadIdentityDocument(profileId, new FormData(form));
      if (r.ok) {
        setShowForm(false);
        form.reset();
        router.refresh();
      } else {
        setError(r.error);
      }
    });
  };

  const onDelete = (id: string) => {
    start(async () => {
      setError(null);
      const r = await deleteIdentityDocument(id);
      if (r.ok) router.refresh();
      else setError(r.error);
    });
  };

  return (
    <div className="mt-2 space-y-3 rounded-lg border border-slate-200 bg-white p-4">
      {docs.length === 0 ? (
        <p className="text-sm text-slate-500">No identity documents uploaded.</p>
      ) : (
        <ul className="space-y-3">
          {docs.map((d) => (
            <li key={d.id} className="border-b border-slate-100 pb-3 last:border-0 last:pb-0">
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="font-medium text-slate-800">
                  {KIND_LABEL[d.kind]}
                  {d.label ? ` — ${d.label}` : ""}
                </span>
                <div className="flex items-center gap-3">
                  {d.document_id && (
                    <a
                      href={`/api/documents/${d.document_id}`}
                      className="text-slate-700 underline hover:text-slate-900"
                    >
                      Download
                    </a>
                  )}
                  {!d.sighted_at && (
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => onDelete(d.id)}
                      className="text-xs text-slate-400 underline hover:text-slate-700"
                    >
                      Remove
                    </button>
                  )}
                </div>
              </div>
              <div className="mt-2">
                <SightingControl
                  table="identity_documents"
                  recordId={d.id}
                  sightedAt={d.sighted_at}
                  sightedBy={d.sighted_by}
                  canVerify={canSight}
                />
              </div>
            </li>
          ))}
        </ul>
      )}

      {!showForm && (
        <button
          type="button"
          onClick={() => setShowForm(true)}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
        >
          Add a document
        </button>
      )}

      {showForm && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit(e.currentTarget);
          }}
          className="space-y-3 border-t border-slate-100 pt-3 text-sm"
        >
          <label className="block">
            <span className="text-slate-600">Document type</span>
            <select
              name="kind"
              required
              defaultValue="photo_id"
              className="mt-1 block rounded-md border border-slate-300 px-2 py-1"
            >
              <option value="photo_id">Photo ID</option>
              <option value="visa">Visa document</option>
              <option value="other">Other</option>
            </select>
          </label>
          <label className="block">
            <span className="text-slate-600">Label (optional)</span>
            <input
              type="text"
              name="label"
              placeholder="e.g. Driver licence, Subclass 482"
              className="mt-1 block w-full rounded-md border border-slate-300 px-2 py-1"
            />
          </label>
          <label className="block">
            <span className="text-slate-600">File or photo</span>
            <input
              type="file"
              name="file"
              required
              accept="image/*,application/pdf"
              className="mt-1 block w-full text-sm"
            />
            <span className="mt-1 block text-xs text-slate-400">
              On a phone you can take a photo of the document.
            </span>
          </label>
          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={pending}
              className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white disabled:bg-slate-300"
            >
              {pending ? "Uploading…" : "Upload"}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowForm(false);
                setError(null);
              }}
              className="text-xs text-slate-500 underline"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
