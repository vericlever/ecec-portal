"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  REVIEW_PERIODS,
  REVIEW_PERIOD_LABELS,
  SOP_TIER_LABELS,
  SOP_TIER_ORDER,
} from "@/lib/constants";
import { HISTORY_EVENT_LABELS, reviewState } from "@/lib/sop-review";
import {
  deleteSop,
  publishSop,
  setJobRole,
  setSopChildSafeStandard,
  setSopQualityArea,
  unpublishSop,
  updateSopBody,
  updateSopMeta,
  uploadSopDocument,
} from "../actions";
import { TagPicker } from "@/app/admin/_tags/tag-picker";
import {
  CHILD_SAFE_STANDARDS,
  MAX_CHILD_SAFE_STANDARDS,
  MAX_QUALITY_AREAS,
  NQS_QUALITY_AREAS,
} from "@/lib/tags";

type Sop = {
  id: string;
  name: string;
  target_tier: string;
  signoff_type: string;
  priority: number | null;
  notes: string;
  service_id: string | null;
  body: string;
  published_body: string;
  published_version: number | null;
  published_at: string | null;
  review_period_months: number;
  next_review_date: string | null;
  latest_decision: "stands" | "needs_revision" | null;
  suggested_evidence: string;
};

type HistoryRow = {
  id: string;
  eventType: string;
  note: string;
  at: string;
  actor: string;
};

export function SopEditor({
  sop,
  services,
  jobRoles,
  linkedRoleIds,
  qualityAreaIds,
  childSafeStandardIds,
  signOffCount,
  sourceDoc,
  history,
}: {
  sop: Sop;
  services: { id: string; name: string }[];
  jobRoles: { id: string; name: string; is_placeholder: boolean }[];
  linkedRoleIds: string[];
  qualityAreaIds: number[];
  childSafeStandardIds: number[];
  signOffCount: number;
  sourceDoc: {
    id: string;
    file_name: string;
    byte_size: number | null;
    extraction_note: string | null;
  } | null;
  history: HistoryRow[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const [name, setName] = useState(sop.name);
  const [signoffType, setSignoffType] = useState(sop.signoff_type);
  const [category, setCategory] = useState(sop.target_tier);
  const [priority, setPriority] = useState(sop.priority?.toString() ?? "");
  const [notes, setNotes] = useState(sop.notes);
  const [serviceId, setServiceId] = useState(sop.service_id ?? "");
  const [reviewPeriod, setReviewPeriod] = useState(sop.review_period_months);
  const [body, setBody] = useState(sop.body);

  const review = reviewState(sop.next_review_date);

  const fileRef = useRef<HTMLInputElement>(null);
  const linked = new Set(linkedRoleIds);

  const published = sop.published_version != null;
  const dirty = body !== sop.published_body;

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
          <h1 className="text-xl font-semibold">{sop.name}</h1>
          <p className="mt-1 text-xs text-slate-500">
            {published
              ? `Published v${sop.published_version}` +
                (sop.published_at
                  ? ` on ${new Date(sop.published_at).toLocaleDateString("en-AU", { dateStyle: "medium" })}`
                  : "") +
                (dirty ? " · unpublished changes below" : "")
              : "Not published — staff cannot see this yet"}
            {signOffCount > 0 && ` · ${signOffCount} sign-off${signOffCount === 1 ? "" : "s"} recorded`}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              act(
                () => publishSop(sop.id),
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
              onClick={() => act(() => unpublishSop(sop.id), "Unpublished")}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 disabled:opacity-40"
            >
              Unpublish
            </button>
          )}
        </div>
      </div>

      {published && dirty && (
        <p className="rounded-md border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-800">
          Publishing changes bumps the version. Every staff member who signed the
          old version has to read and sign again.
        </p>
      )}
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
              <span className="font-medium text-slate-700">Sign-off</span>
              <select
                value={signoffType}
                onChange={(e) => setSignoffType(e.target.value)}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="self">Staff sign-off</option>
                <option value="self_and_manager">Staff and manager sign-off</option>
              </select>
            </label>
            <label className="block text-sm">
              <span className="font-medium text-slate-700">Category</span>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="">None</option>
                {SOP_TIER_ORDER.map((t) => (
                  <option key={t} value={t}>
                    {SOP_TIER_LABELS[t]}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm">
              <span className="font-medium text-slate-700">
                Priority <span className="font-normal text-slate-400">(optional)</span>
              </span>
              <input
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                inputMode="numeric"
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
          </div>
          <label className="block text-sm">
            <span className="font-medium text-slate-700">Review every</span>
            <select
              value={reviewPeriod}
              onChange={(e) => setReviewPeriod(Number(e.target.value))}
              className="mt-1 w-full max-w-[12rem] rounded-md border border-slate-300 px-3 py-2 text-sm"
            >
              {REVIEW_PERIODS.map((p) => (
                <option key={p} value={p}>
                  {REVIEW_PERIOD_LABELS[p]}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="font-medium text-slate-700">
              Internal notes <span className="font-normal text-slate-400">(not shown to staff)</span>
            </span>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              act(
                () =>
                  updateSopMeta(sop.id, {
                    name,
                    signoffType,
                    category,
                    priority,
                    notes,
                    serviceId: serviceId || null,
                    reviewPeriod,
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
            const f = fileRef.current?.files?.[0];
            if (!f) return;
            const fd = new FormData();
            fd.append("file", f);
            act(() => uploadSopDocument(sop.id, fd), "Document uploaded");
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
            Upload / replace
          </button>
        </form>
      </section>

      {/* Text */}
      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Procedure text staff read and sign
        </h2>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={16}
          className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-xs"
        />
        <button
          type="button"
          disabled={pending || body === sop.body}
          onClick={() => act(() => updateSopBody(sop.id, body), "Text saved")}
          className="mt-2 rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 disabled:opacity-40"
        >
          Save text
        </button>
      </section>

      {/* Review */}
      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Review
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
        {sop.latest_decision === "needs_revision" && (
          <p className="mt-1 text-sm text-red-700">
            The last review decided this procedure needs revision.
          </p>
        )}
        <Link
          href={`/admin/sops/${sop.id}/review`}
          className="mt-3 inline-block rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white"
        >
          Review now
        </Link>
      </section>

      {/* Review history */}
      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Review history
        </h2>
        {history.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">
            No edits or reviews recorded yet.
          </p>
        ) : (
          <ul className="mt-2 divide-y divide-slate-100 text-sm">
            {history.map((h) => (
              <li key={h.id} className="py-2">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-medium text-slate-700">
                    {HISTORY_EVENT_LABELS[h.eventType] ?? h.eventType}
                  </span>
                  <span className="text-xs text-slate-400">
                    {new Date(h.at).toLocaleString("en-AU", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}{" "}
                    · {h.actor}
                  </span>
                </div>
                {h.note && (
                  <p className="mt-0.5 text-xs text-slate-500">{h.note}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Job roles */}
      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Job roles that must complete this procedure
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
                    () => setJobRole(sop.id, r.id, e.target.checked),
                    e.target.checked ? "Added to role" : "Removed from role",
                  )
                }
              />
              <span>
                {r.name}
                {r.is_placeholder && (
                  <span className="text-slate-400"> (no procedures attached yet)</span>
                )}
              </span>
            </label>
          ))}
        </div>
      </section>

      {/* Quality areas and child safe standards */}
      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Quality areas and child safe standards
        </h2>
        <p className="mt-1 text-xs text-slate-500">
          Used by the coverage report and the child safety and quality area
          reports. Not shown to staff.
        </p>
        <div className="mt-3 space-y-5">
          <TagPicker
            legend="NQS quality areas"
            options={NQS_QUALITY_AREAS}
            selectedIds={qualityAreaIds}
            max={MAX_QUALITY_AREAS}
            disabled={pending}
            onToggle={(id, checked) =>
              act(
                () => setSopQualityArea(sop.id, id, checked),
                checked ? "Quality area added" : "Quality area removed",
              )
            }
          />
          <TagPicker
            legend="Child safe standards"
            options={CHILD_SAFE_STANDARDS}
            selectedIds={childSafeStandardIds}
            max={MAX_CHILD_SAFE_STANDARDS}
            disabled={pending}
            onToggle={(id, checked) =>
              act(
                () => setSopChildSafeStandard(sop.id, id, checked),
                checked ? "Standard added" : "Standard removed",
              )
            }
          />
        </div>
      </section>

      <section>
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            if (!confirm(`Delete "${sop.name}"? This cannot be undone.`)) return;
            start(async () => {
              const r = await deleteSop(sop.id);
              if (r.ok) router.push("/admin/sops");
              else setErr(r.error ?? "Could not delete.");
            });
          }}
          className="text-xs font-medium text-red-600 underline"
        >
          Delete this procedure
        </button>
      </section>
    </div>
  );
}
