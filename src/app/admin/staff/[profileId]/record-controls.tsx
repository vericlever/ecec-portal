"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { SIGHTED_BY } from "@/lib/nqaits";
import {
  clearSighting,
  recordSighting,
  setHrVerifier,
  setProbation,
} from "./actions";

type Table =
  | "wwcc_checks"
  | "teacher_registrations"
  | "qualifications"
  | "training_records";

export function SightingControl({
  table,
  recordId,
  sightedAt,
  sightedBy,
  canVerify,
}: {
  table: Table;
  recordId: string;
  sightedAt: string | null;
  sightedBy: string | null;
  canVerify: boolean;
}) {
  const router = useRouter();
  const [who, setWho] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (sightedAt) {
    return (
      <div className="flex items-center justify-between text-sm">
        <span className="text-green-700">
          Sighted {new Date(sightedAt).toLocaleDateString("en-AU", { dateStyle: "medium" })}
          {sightedBy ? ` by ${sightedBy}` : ""}
        </span>
        {canVerify && (
          <button
            type="button"
            onClick={() =>
              start(async () => {
                const r = await clearSighting(table, recordId);
                if (r.ok) router.refresh();
                else setError(r.error);
              })
            }
            className="text-xs text-slate-400 underline hover:text-slate-700"
          >
            Undo
          </button>
        )}
      </div>
    );
  }

  if (!canVerify) {
    return <span className="text-sm text-amber-700">Awaiting sighting by a leader</span>;
  }

  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className="text-slate-600">I have sighted this document, in my capacity as</span>
      <select
        value={who}
        onChange={(e) => setWho(e.target.value)}
        className="rounded-md border border-slate-300 px-2 py-1 text-sm"
      >
        <option value="">choose…</option>
        {SIGHTED_BY.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
      <button
        type="button"
        disabled={!who || pending}
        onClick={() =>
          start(async () => {
            setError(null);
            const r = await recordSighting(table, recordId, who);
            if (r.ok) router.refresh();
            else setError(r.error);
          })
        }
        className="rounded-md bg-slate-900 px-3 py-1 text-xs font-medium text-white disabled:bg-slate-300"
      >
        {pending ? "Saving…" : "Record sighting"}
      </button>
      {error && <span className="text-red-600">{error}</span>}
    </div>
  );
}

function fmtDate(v: string) {
  return new Date(v).toLocaleDateString("en-AU", { dateStyle: "medium" });
}

export function ProbationControl({
  profileId,
  onProbation,
  startDate,
  canEdit,
}: {
  profileId: string;
  onProbation: boolean | null;
  startDate: string | null;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const savedStatus =
    onProbation === true ? "yes" : onProbation === false ? "no" : "";
  const [status, setStatus] = useState<"" | "yes" | "no">(savedStatus);
  const [date, setDate] = useState(startDate ?? "");

  const dirty = status !== savedStatus || date !== (startDate ?? "");

  if (!canEdit) {
    return (
      <div className="space-y-1 text-sm text-slate-700">
        <p>
          {savedStatus === "yes"
            ? "On a probationary period"
            : savedStatus === "no"
              ? "Not on a probationary period"
              : "Not set"}
        </p>
        {savedStatus === "yes" && (
          <p className="text-slate-500">
            Probation start date:{" "}
            {startDate ? fmtDate(startDate) : "not set"}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3 text-sm">
      <div className="flex items-center gap-3">
        <span className="text-slate-600">On a probationary period</span>
        <div className="flex gap-3">
          {[
            { v: "yes", label: "Yes" },
            { v: "no", label: "No" },
            { v: "", label: "Not set" },
          ].map((opt) => (
            <label key={opt.v} className="flex items-center gap-1.5">
              <input
                type="radio"
                name={`probation-${profileId}`}
                checked={status === opt.v}
                disabled={pending}
                onChange={() => setStatus(opt.v as "" | "yes" | "no")}
              />
              {opt.label}
            </label>
          ))}
        </div>
      </div>

      {status === "yes" && (
        <label className="flex flex-wrap items-center gap-3">
          <span className="text-slate-600">Probation start date</span>
          <input
            type="date"
            value={date}
            disabled={pending}
            onChange={(e) => setDate(e.target.value)}
            className="rounded-md border border-slate-300 px-2 py-1 text-sm"
          />
          <span className="text-xs text-slate-500">
            Separate from the employment start date. SOP sign-off deadlines are
            measured from here.
          </span>
        </label>
      )}

      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={!dirty || pending}
          onClick={() =>
            start(async () => {
              setError(null);
              const r = await setProbation(profileId, {
                onProbation: status,
                startDate: status === "yes" ? date : "",
              });
              if (r.ok) router.refresh();
              else setError(r.error);
            })
          }
          className="rounded-md bg-slate-900 px-3 py-1 text-xs font-medium text-white disabled:bg-slate-300"
        >
          {pending ? "Saving…" : "Save"}
        </button>
        {error && <span className="text-red-600">{error}</span>}
      </div>
    </div>
  );
}

export function HrVerifierToggle({
  profileId,
  value,
}: {
  profileId: string;
  value: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <label className="flex items-start gap-3 text-sm">
      <input
        type="checkbox"
        checked={value}
        disabled={pending}
        onChange={(e) =>
          start(async () => {
            setError(null);
            const r = await setHrVerifier(profileId, e.target.checked);
            if (r.ok) router.refresh();
            else setError(r.error);
          })
        }
        className="mt-0.5 h-4 w-4"
      />
      <span>
        <span className="font-medium text-slate-800">HR sign-off</span>
        <span className="block text-xs text-slate-500">
          Can sight and verify onboarding documents for staff at their service.
        </span>
        {error && <span className="block text-red-600">{error}</span>}
      </span>
    </label>
  );
}
