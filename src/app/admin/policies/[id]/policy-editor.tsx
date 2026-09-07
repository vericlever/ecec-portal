"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { PolicyCategory } from "@/lib/policy-categories";
import { REVIEW_PERIODS, REVIEW_PERIOD_LABELS } from "@/lib/constants";
import { fmtReviewDate, reviewDateFromNow, reviewState } from "@/lib/sop-review";
import {
  deletePolicy,
  linkSop,
  markPolicyReviewed,
  publishPolicy,
  setPolicyCategory,
  unlinkSop,
  unpublishPolicy,
  updatePolicyBody,
  updatePolicyMeta,
  updatePolicyReview,
  uploadPolicyDocument,
} from "../actions";

type Policy = {
  id: string;
  name: string;
  is_parent_facing: boolean;
  service_id: string | null;
  body: string;
  published_body: string;
  published_version: number | null;
  published_at: string | null;
  review_period_months: number;
  next_review_date: string | null;
};

export function PolicyEditor({
  policy,
  categories,
  linkedCategoryIds,
  services,
  sourceDoc,
  allSops,
  linkedSops,
}: {
  policy: Policy;
  categories: PolicyCategory[];
  linkedCategoryIds: string[];
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
  const [serviceId, setServiceId] = useState(policy.service_id ?? "");
  const [body, setBody] = useState(policy.body);

  const [reviewPeriod, setReviewPeriod] = useState(policy.review_period_months);
  const [nextReviewDate, setNextReviewDate] = useState(
    policy.next_review_date ?? "",
  );
  const review = reviewState(policy.next_review_date);
  const reviewDirty =
    reviewPeriod !== policy.review_period_months ||
    nextReviewDate !== (policy.next_review_date ?? "");

  const fileRef = useRef<HTMLInputElement>(null);
  const [sopToAdd, setSopToAdd] = useState("");
  const linkedCategories = new Set(linkedCategoryIds);

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
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              act(
                () =>
                  updatePolicyMeta(policy.id, {
                    name,
                    serviceId: serviceId || null,
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

      {/* Categories */}
      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Categories
        </h2>
        <p className="mt-1 text-xs text-slate-500">
          How this policy is filed in the library, and used when linking it to
          SOPs. A policy can be in more than one.
        </p>
        <div className="mt-2 space-y-1.5">
          {categories.map((c) => (
            <label key={c.id} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={linkedCategories.has(c.id)}
                disabled={pending}
                onChange={(e) =>
                  act(
                    () => setPolicyCategory(policy.id, c.id, e.target.checked),
                    e.target.checked ? "Added to category" : "Removed",
                  )
                }
              />
              <span>
                {c.name}
                {c.is_parent_facing && (
                  <span className="ml-1 text-xs text-purple-700">
                    (parents can view these)
                  </span>
                )}
              </span>
            </label>
          ))}
        </div>
        {policy.is_parent_facing && (
          <p className="mt-2 text-xs text-purple-700">
            This policy is parent-facing, so a finalised version triggers a Reg
            172 parent notification.
          </p>
        )}
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

      {/* Review cycle */}
      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Review cycle
        </h2>
        <p
          className={`mt-2 text-sm font-medium ${
            review.status === "overdue"
              ? "text-red-700"
              : review.status === "soon"
                ? "text-amber-700"
                : "text-slate-700"
          }`}
        >
          {review.label}
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="font-medium text-slate-700">Review every</span>
            <select
              value={reviewPeriod}
              onChange={(e) => setReviewPeriod(Number(e.target.value))}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            >
              {REVIEW_PERIODS.map((p) => (
                <option key={p} value={p}>
                  {REVIEW_PERIOD_LABELS[p]}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="font-medium text-slate-700">Next review date</span>
            <input
              type="date"
              value={nextReviewDate}
              onChange={(e) => setNextReviewDate(e.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={pending || !reviewDirty}
            onClick={() =>
              act(
                () =>
                  updatePolicyReview(policy.id, { reviewPeriod, nextReviewDate }),
                "Review schedule saved",
              )
            }
            className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 disabled:opacity-40"
          >
            Save review schedule
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              if (
                !confirm(
                  `Mark this policy as reviewed now? The next review moves to ${fmtReviewDate(reviewDateFromNow(policy.review_period_months))}.`,
                )
              )
                return;
              act(() => markPolicyReviewed(policy.id), "Marked as reviewed");
            }}
            className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40"
          >
            Mark as reviewed now
          </button>
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
