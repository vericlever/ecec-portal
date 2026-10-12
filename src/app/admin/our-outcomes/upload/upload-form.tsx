"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";
import {
  createQuarantineUploadUrl,
  extractAndRedact,
  redactSelection,
  saveOutcomeRecord,
  cancelUpload,
  checkOverlap,
  type OutcomeSourceType,
} from "../actions";
import { fmtReviewDate } from "@/lib/sop-review";

const CAUTION_MESSAGE =
  "Do not upload anything that identifies a child. Remove children's names, dates of birth, photos and any description that would let someone work out which child is involved. Names and other personal details are also removed automatically before anything is stored or analysed, but the automatic check can miss things. Check the preview carefully before you save.";

const SOURCE_TYPES: { value: OutcomeSourceType; label: string }[] = [
  { value: "incident_reports", label: "Incident Reports" },
  { value: "staff_feedback", label: "Staff Feedback" },
  { value: "parent_feedback", label: "Parent Feedback" },
  { value: "regulator", label: "Regulator Report / Documents" },
  { value: "other", label: "Other" },
];

type Step = "pick" | "processing" | "preview" | "saved";

export function UploadForm({ services }: { services: { id: string; name: string }[] }) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const [pending, start] = useTransition();
  const [step, setStep] = useState<Step>("pick");
  const [error, setError] = useState<string | null>(null);

  const [quarantinePath, setQuarantinePath] = useState("");
  const [fileName, setFileName] = useState("");
  const [redactedText, setRedactedText] = useState("");
  const [originalFormat, setOriginalFormat] = useState("");
  const [originalSha256, setOriginalSha256] = useState("");

  const today = new Date().toISOString().slice(0, 10);
  const [sourceType, setSourceType] = useState<OutcomeSourceType>("incident_reports");
  const [serviceId, setServiceId] = useState("");
  const [periodStart, setPeriodStart] = useState(today);
  const [periodEnd, setPeriodEnd] = useState(today);
  const [overlaps, setOverlaps] = useState<{ periodStart: string; periodEnd: string }[]>([]);
  const [isConfidential, setIsConfidential] = useState<"" | "yes" | "no">("");

  function handleFileChosen() {
    const file = fileInputRef.current?.files?.[0];
    if (!file) return;
    setError(null);
    setStep("processing");
    start(async () => {
      const supabase = createClient();
      const urlResult = await createQuarantineUploadUrl(file.name);
      if (!urlResult.ok) {
        setError(urlResult.error);
        setStep("pick");
        return;
      }
      const { error: uploadError } = await supabase.storage
        .from("outcome-quarantine")
        .uploadToSignedUrl(urlResult.path, urlResult.token, file);
      if (uploadError) {
        setError(uploadError.message);
        setStep("pick");
        return;
      }
      const extractResult = await extractAndRedact(urlResult.path, file.name);
      if (!extractResult.ok) {
        setError(extractResult.error);
        setStep("pick");
        return;
      }
      setQuarantinePath(urlResult.path);
      setFileName(file.name);
      setRedactedText(extractResult.redactedText);
      setOriginalFormat(extractResult.originalFormat);
      setOriginalSha256(extractResult.originalSha256);
      setStep("preview");
    });
  }

  function handleRedactSelection() {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || !textRef.current) return;
    // Character offsets within the plain-text content of textRef - the
    // simplest reliable mapping since the preview renders as plain text,
    // not rich markup, so DOM offsets equal string offsets.
    const range = selection.getRangeAt(0);
    const preRange = range.cloneRange();
    preRange.selectNodeContents(textRef.current);
    preRange.setEnd(range.startContainer, range.startOffset);
    const start = preRange.toString().length;
    const end = start + range.toString().length;
    if (start === end) return;

    start2(async () => {
      const result = await redactSelection(redactedText, start, end);
      if (result.ok) setRedactedText(result.text);
      selection.removeAllRanges();
    });
  }
  const [, start2] = useTransition();

  // Warn (never block) when the same type for the same service already
  // covers part of this period.
  useEffect(() => {
    if (step !== "preview") return;
    let cancelled = false;
    checkOverlap(sourceType, serviceId || null, periodStart, periodEnd).then((r) => {
      if (!cancelled) setOverlaps(r.overlaps);
    });
    return () => {
      cancelled = true;
    };
  }, [step, sourceType, serviceId, periodStart, periodEnd]);

  function handleSave() {
    if (isConfidential === "") {
      setError("Answer the question about staff conduct or child protection.");
      return;
    }
    if (!periodStart || !periodEnd || periodEnd < periodStart) {
      setError("The end of the period can't be before its start.");
      return;
    }
    setError(null);
    start(async () => {
      const result = await saveOutcomeRecord({
        quarantinePath,
        redactedText,
        originalFormat,
        originalSha256,
        sourceType,
        serviceId: serviceId || null,
        periodStart,
        periodEnd,
        isConfidential: isConfidential === "yes",
      });
      if (!result.ok) {
        setError(result.error);
        if (isConfidential === "yes") setStep("pick"); // refused + deleted, nothing to go back to
        return;
      }
      // Suggestions are generated before saveOutcomeRecord returns, so they
      // are already waiting. Go straight to To sort, where a manager decides
      // each link by hand - nothing is attached automatically.
      setStep("saved");
      router.push("/admin/our-outcomes#to-sort");
      router.refresh();
    });
  }

  if (step === "saved") {
    return (
      <div className="mt-6 rounded-lg border border-green-200 bg-green-50 p-4">
        <p className="text-sm text-green-800">Saved. Taking you to To sort to decide which procedures this applies to.</p>
        <a href="/admin/our-outcomes" className="mt-2 inline-block text-sm font-medium text-ink underline">
          Back to Our Outcomes
        </a>
      </div>
    );
  }

  return (
    <div className="mt-4 space-y-4">
      <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{CAUTION_MESSAGE}</p>

      {step === "pick" && (
        <div>
          <input
            ref={fileInputRef}
            type="file"
            onChange={handleFileChosen}
            accept=".pdf,.jpg,.jpeg,.png,.tif,.tiff,.heic,.webp,.docx,.html,.htm,.md,.markdown,.txt,.xlsx,.xls,.csv"
            className="block w-full text-sm"
          />
          <p className="mt-2 text-xs text-slate-500">Maximum 20 MB.</p>
        </div>
      )}

      {step === "processing" && <p className="text-sm text-slate-500">Extracting and redacting...</p>}

      {step === "preview" && (
        <div className="space-y-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Preview: {fileName} - select any remaining personal detail to redact it further
            </p>
            <div
              ref={textRef}
              onMouseUp={handleRedactSelection}
              className="mt-2 max-h-96 overflow-y-auto whitespace-pre-wrap rounded-md border border-slate-300 bg-white p-3 text-sm leading-relaxed"
            >
              {redactedText}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="text-xs font-medium text-slate-600">Type</span>
              <select
                value={sourceType}
                onChange={(e) => setSourceType(e.target.value as OutcomeSourceType)}
                className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5"
              >
                {SOURCE_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="text-xs font-medium text-slate-600">Service</span>
              <select
                value={serviceId}
                onChange={(e) => setServiceId(e.target.value)}
                className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5"
              >
                <option value="">All services</option>
                {services.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="text-xs font-medium text-slate-600">Period from</span>
              <input
                type="date"
                value={periodStart}
                onChange={(e) => setPeriodStart(e.target.value)}
                className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5"
              />
            </label>
            <label className="block text-sm">
              <span className="text-xs font-medium text-slate-600">Period to</span>
              <input
                type="date"
                value={periodEnd}
                min={periodStart}
                onChange={(e) => setPeriodEnd(e.target.value)}
                className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5"
              />
            </label>
            {overlaps.length > 0 && (
              <p className="rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900 sm:col-span-2">
                {SOURCE_TYPES.find((t) => t.value === sourceType)?.label} for{" "}
                {services.find((x) => x.id === serviceId)?.name ?? "all services"} already uploaded for{" "}
                {overlaps.map((o) => `${fmtReviewDate(o.periodStart)} to ${fmtReviewDate(o.periodEnd)}`).join(", ")}.
                You can still save this one.
              </p>
            )}
          </div>

          <fieldset className="rounded-md border border-slate-300 p-3">
            <legend className="px-1 text-xs font-medium text-slate-600">
              Is this a report about a staff member&apos;s conduct toward another staff member, a reportable
              conduct allegation or a child protection report?
            </legend>
            <div className="mt-2 flex gap-4 text-sm">
              <label className="flex items-center gap-1.5">
                <input type="radio" name="confidential" checked={isConfidential === "yes"} onChange={() => setIsConfidential("yes")} />
                Yes
              </label>
              <label className="flex items-center gap-1.5">
                <input type="radio" name="confidential" checked={isConfidential === "no"} onChange={() => setIsConfidential("no")} />
                No
              </label>
            </div>
          </fieldset>

          <div className="flex gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={handleSave}
              className="rounded-md bg-ink px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              Save
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  await cancelUpload(quarantinePath);
                  router.push("/admin/our-outcomes");
                })
              }
              className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
