"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ReportDownloadButton } from "@/app/reports/report-download-button";
import type { ContractRow } from "@/lib/contracts";
import { renewalState, executionState } from "@/lib/contracts";
import {
  uploadContract,
  deleteContract,
  signOwnContract,
  countersignContract,
  regenerateSignedCopy,
} from "./actions";
import { fmtDate as fmtDateOnly, fmtDateTime } from "@/lib/format-date";
import { contractDueDate, dueSignoffPhrase, isOverdue } from "@/lib/signoff-clock";
import { SignForm } from "@/components/sign-form";
import { PDF_ONLY_STATEMENT } from "@/lib/signing/validate-pdf";

// start_date/expiry_date are plain calendar dates (Step 43), never
// timezone-converted; this just adds the null-handling the shared helper
// doesn't need to care about.
function fmtDate(v: string | null) {
  if (!v) return "—";
  return fmtDateOnly(v);
}

function RenewalBadge({ contract }: { contract: ContractRow }) {
  const state = renewalState(contract);
  if (state.bucket === "none" || state.bucket === "ok") return null;
  const text =
    state.bucket === "expired"
      ? `Expired ${fmtDate(contract.expiry_date)}`
      : `Renewal due — ${state.daysLeft} ${state.daysLeft === 1 ? "day" : "days"} left`;
  return (
    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
      {text}
    </span>
  );
}

export function ContractPanel({
  profileId,
  contracts,
  canManage,
  canSign = false,
  timezone,
  paused = false,
  pausedDaysBanked = 0,
}: {
  profileId: string;
  contracts: ContractRow[];
  canManage: boolean;
  // The contract owner viewing their own record (the onboarding page) can sign.
  canSign?: boolean;
  timezone: string;
  // Step 44 pause/leave - this person's own clock, frozen either way.
  paused?: boolean;
  pausedDaysBanked?: number;
}) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [periodType, setPeriodType] = useState<"fixed" | "no_fixed_period">(
    "fixed",
  );
  const [isDeed, setIsDeed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const active = contracts.find((c) => !c.superseded_at) ?? null;
  const history = contracts.filter((c) => c.superseded_at);
  const execution = active ? executionState(active) : null;
  const contractDue = active ? contractDueDate(active.created_at, pausedDaysBanked) : null;
  const signOverdue =
    active && !active.signed_at && !active.is_deed && !paused && contractDue
      ? isOverdue(contractDue)
      : false;

  const onSubmit = (form: HTMLFormElement) => {
    start(async () => {
      setError(null);
      const r = await uploadContract(profileId, new FormData(form));
      if (r.ok) {
        setShowForm(false);
        form.reset();
        setIsDeed(false);
        router.refresh();
      } else {
        setError(r.error);
      }
    });
  };

  const onDelete = (id: string) => {
    start(async () => {
      setError(null);
      const r = await deleteContract(id);
      if (r.ok) router.refresh();
      else setError(r.error);
    });
  };

  const onSign = (id: string, name: string, signatureDataUrl: string) => {
    start(async () => {
      setError(null);
      const r = await signOwnContract(id, name, signatureDataUrl);
      if (r.ok) router.refresh();
      else setError(r.error);
    });
  };

  const onCountersign = (id: string, name: string, signatureDataUrl: string) => {
    start(async () => {
      setError(null);
      const r = await countersignContract(id, name, signatureDataUrl);
      if (r.ok) router.refresh();
      else setError(r.error);
    });
  };

  const onRegenerate = (id: string) => {
    start(async () => {
      setError(null);
      const r = await regenerateSignedCopy(id);
      if (r.ok) router.refresh();
      else setError(r.error);
    });
  };

  return (
    <div className="mt-2 space-y-3 rounded-lg border border-slate-200 bg-white p-4">
      {active ? (
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-slate-800">
              {active.period_type === "fixed"
                ? "Fixed period"
                : "No fixed period"}
            </span>
            <RenewalBadge contract={active} />
          </div>
          <dl className="mt-1 grid grid-cols-2 gap-x-6 gap-y-0.5 text-sm">
            <dt className="text-slate-500">Start date</dt>
            <dd className="text-slate-800">{fmtDate(active.start_date)}</dd>
            {active.period_type === "fixed" && (
              <>
                <dt className="text-slate-500">Length</dt>
                <dd className="text-slate-800">
                  {active.duration_months} months
                </dd>
                <dt className="text-slate-500">Expiry</dt>
                <dd className="text-slate-800">{fmtDate(active.expiry_date)}</dd>
              </>
            )}
            {active.notes && (
              <>
                <dt className="text-slate-500">Notes</dt>
                <dd className="text-slate-800">{active.notes}</dd>
              </>
            )}
            {!active.is_deed && (
              <>
                <dt className="text-slate-500">Signed by staff member</dt>
                <dd className={active.signed_at ? "text-slate-800" : signOverdue ? "font-medium text-red-700" : "text-slate-800"}>
                  {active.signed_at
                    ? `${active.signed_name ?? "Yes"} · ${fmtDateTime(active.signed_at, timezone)}`
                    : paused
                      ? "Not signed yet · Paused"
                      : `Not signed yet · ${dueSignoffPhrase(contractDue as Date)}`}
                </dd>
                <dt className="text-slate-500">Countersigned</dt>
                <dd className="text-slate-800">
                  {active.countersigned_at
                    ? `${active.countersigned_name ?? "Yes"} · ${fmtDateTime(active.countersigned_at, timezone)}`
                    : "Not yet"}
                </dd>
              </>
            )}
          </dl>

          {active.is_deed && (
            <p className="mt-2 rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
              This contract is a deed and is signed on paper, not in the
              portal. The signed copy is the uploaded document.
            </p>
          )}

          {!active.is_deed && execution === "executed" && (
            <p className="mt-2 rounded-md border border-green-200 bg-green-50 p-2.5 text-sm text-green-800">
              Fully executed - signed by both parties.
            </p>
          )}

          {!active.is_deed && !active.signed_at && active.document_id && (
            <iframe
              src={`/api/documents/${active.document_id}`}
              className="mt-2 h-80 w-full rounded-md border border-slate-200"
              title="Contract preview"
            />
          )}

          {canSign && !active.is_deed && !active.signed_at && (
            <div className="mt-2 rounded-md border border-amber-200 bg-amber-50 p-3">
              <p className="mb-2 text-sm text-amber-900">
                Sign to read and accept this contract.
              </p>
              <SignForm
                pending={pending}
                submitLabel="I have read this contract and I accept it"
                onSign={({ name, signatureDataUrl }) => onSign(active.id, name, signatureDataUrl)}
              />
            </div>
          )}

          {canManage &&
            !active.is_deed &&
            active.signed_at &&
            !active.countersigned_at && (
              <div className="mt-2 rounded-md border border-slate-200 bg-slate-50 p-3">
                <p className="mb-2 text-sm text-slate-700">
                  Countersign this contract.
                </p>
                <SignForm
                  pending={pending}
                  submitLabel="Countersign"
                  onSign={({ name, signatureDataUrl }) => onCountersign(active.id, name, signatureDataUrl)}
                />
              </div>
            )}

          {!active.is_deed && active.signed_at && (
            <div className="mt-2">
              {active.signed_copy_document_id ? (
                <iframe
                  src={`/api/documents/${active.signed_copy_document_id}`}
                  className="h-80 w-full rounded-md border border-slate-200"
                  title="Signed contract preview"
                />
              ) : (
                <p className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-500">
                  Signed copy being prepared - refresh in a moment.
                  {canManage && (
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => onRegenerate(active.id)}
                      className="ml-2 text-slate-700 underline hover:text-slate-900"
                    >
                      Try again
                    </button>
                  )}
                </p>
              )}
            </div>
          )}

          <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
            {active.signed_copy_document_id ? (
              <a
                href={`/api/documents/${active.signed_copy_document_id}`}
                className="font-medium text-slate-900 underline hover:text-slate-700"
              >
                Download signed contract
              </a>
            ) : null}
            {active.document_id ? (
              <a
                href={`/api/documents/${active.document_id}`}
                className="text-slate-700 underline hover:text-slate-900"
              >
                {active.signed_copy_document_id ? "Original as uploaded" : "Download contract"}
              </a>
            ) : (
              <span className="text-amber-700">No document on file</span>
            )}
            {(active.is_deed || !active.signed_copy_document_id) && (
              <ReportDownloadButton
                href={`/reports/contract?contract=${active.id}`}
                label="Print signature summary (PDF)"
                className="text-slate-700 underline hover:text-slate-900"
              />
            )}
            {canManage && (
              <button
                type="button"
                disabled={pending}
                onClick={() => onDelete(active.id)}
                className="text-xs text-slate-400 underline hover:text-slate-700"
              >
                Remove
              </button>
            )}
          </div>
        </div>
      ) : (
        <p className="text-sm text-slate-500">No contract on file.</p>
      )}

      {history.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer text-slate-500">
            Earlier contracts ({history.length})
          </summary>
          <ul className="mt-2 space-y-1">
            {history.map((c) => (
              <li
                key={c.id}
                className="flex flex-wrap items-baseline justify-between gap-x-3 text-slate-600"
              >
                <span>
                  {fmtDate(c.start_date)}
                  {" – "}
                  {c.period_type === "fixed"
                    ? fmtDate(c.expiry_date)
                    : "no fixed period"}
                </span>
                {c.document_id && (
                  <a
                    href={`/api/documents/${c.document_id}`}
                    className="text-slate-500 underline hover:text-slate-800"
                  >
                    Download
                  </a>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}

      {canManage && !showForm && (
        <button
          type="button"
          onClick={() => setShowForm(true)}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
        >
          {active ? "Replace contract" : "Upload contract"}
        </button>
      )}

      {canManage && showForm && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit(e.currentTarget);
          }}
          className="space-y-3 border-t border-slate-100 pt-3 text-sm"
        >
          {active && (
            <p className="text-xs text-slate-500">
              Uploading a new contract keeps the current one as history and makes
              this the active period.
            </p>
          )}
          <label className="block">
            <span className="text-slate-600">Executed contract document</span>
            <input
              type="file"
              name="file"
              required
              accept={isDeed ? undefined : ".pdf"}
              className="mt-1 block w-full text-sm"
            />
            {!isDeed && (
              <span className="mt-1 block text-xs text-slate-400">{PDF_ONLY_STATEMENT}</span>
            )}
          </label>
          <label className="block">
            <span className="text-slate-600">Start date</span>
            <input
              type="date"
              name="start_date"
              required
              className="mt-1 block rounded-md border border-slate-300 px-2 py-1"
            />
          </label>
          <fieldset>
            <span className="text-slate-600">Contract period</span>
            <div className="mt-1 flex gap-4">
              <label className="flex items-center gap-1.5">
                <input
                  type="radio"
                  name="period_type"
                  value="fixed"
                  checked={periodType === "fixed"}
                  onChange={() => setPeriodType("fixed")}
                />
                Fixed period
              </label>
              <label className="flex items-center gap-1.5">
                <input
                  type="radio"
                  name="period_type"
                  value="no_fixed_period"
                  checked={periodType === "no_fixed_period"}
                  onChange={() => setPeriodType("no_fixed_period")}
                />
                No fixed period
              </label>
            </div>
          </fieldset>
          {periodType === "fixed" && (
            <label className="block">
              <span className="text-slate-600">Length in months</span>
              <input
                type="number"
                name="duration_months"
                min={1}
                step={1}
                required
                className="mt-1 block w-24 rounded-md border border-slate-300 px-2 py-1"
              />
              <span className="ml-2 text-xs text-slate-500">
                Expiry is calculated from the start date and this length.
              </span>
            </label>
          )}
          <label className="block">
            <span className="text-slate-600">Notes (optional)</span>
            <textarea
              name="notes"
              rows={2}
              className="mt-1 block w-full rounded-md border border-slate-300 px-2 py-1"
            />
          </label>
          <label className="flex items-start gap-2">
            <input
              type="checkbox"
              name="is_deed"
              checked={isDeed}
              onChange={(e) => setIsDeed(e.target.checked)}
              className="mt-0.5"
            />
            <span className="text-slate-600">
              This document is a deed. It will be signed on paper, not in the
              portal - a deed generally needs an attesting witness, which a
              typed name here cannot provide.
            </span>
          </label>
          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={pending}
              className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white disabled:bg-slate-300"
            >
              {pending ? "Saving…" : "Save contract"}
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
