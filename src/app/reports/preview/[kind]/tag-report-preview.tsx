"use client";

import Link from "next/link";
import { useState } from "react";
import { ReportDownloadButton } from "../../report-download-button";
import { WHOLE_OF_ORG_LABEL, type AreaReport, type TagReport } from "@/lib/tag-report";
import { fmtDateLong } from "@/lib/format-date";

// On-screen version of the report. It renders the same TagReport the PDF is
// built from, so the numbers match; the QIP statements are editable here and
// travel with the PDF request.
export function TagReportPreview({ report, route, service }: { report: TagReport; route: string; service: string }) {
  const [statements, setStatements] = useState<Record<string, string>>(
    Object.fromEntries(report.areas.map((a) => [String(a.option.id), a.statement])),
  );

  return (
    <div>
      <Link href="/reports" className="text-xs text-slate-500 hover:underline">
        Back to reports
      </Link>
      <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">{report.title}</h1>
          <p className="mt-1 text-sm text-slate-500">
            Service: {report.serviceLabel}. Period: {fmtDateLong(report.period.start)} to{" "}
            {fmtDateLong(report.period.end)}.
          </p>
        </div>
        <ReportDownloadButton href={route} body={{ service, statements }} label="Download PDF" />
      </div>

      <h2 className="mt-6 text-xs font-semibold uppercase tracking-wide text-slate-500">Summary</h2>
      <Grid
        head={[
          "Area",
          "Aligned",
          `Reviewed in last ${report.period.months} months`,
          "Overdue",
          "Due in next 90 days",
          "Never reviewed",
        ]}
        rows={report.summary.map((r) => [
          r.label,
          r.counts.aligned,
          r.counts.reviewed,
          r.counts.overdue,
          r.counts.dueSoon,
          r.counts.neverReviewed,
        ])}
      />

      {report.areas.map((area) => (
        <Area
          key={area.option.id}
          report={report}
          area={area}
          statement={statements[String(area.option.id)] ?? ""}
          onStatement={(v) => setStatements((s) => ({ ...s, [String(area.option.id)]: v }))}
        />
      ))}
    </div>
  );
}

function Area({
  report,
  area,
  statement,
  onStatement,
}: {
  report: TagReport;
  area: AreaReport;
  statement: string;
  onStatement: (v: string) => void;
}) {
  const single = !report.isAllServices;
  const head = ["Metric", ...report.columns];
  const s2 = area.section2;
  const s3 = area.section3;
  return (
    <section className="mt-10 border-t border-slate-200 pt-6">
      <h2 className="text-base font-semibold text-slate-900">
        {area.option.code}: {area.option.name}
      </h2>

      <h3 className="mt-4 text-sm font-semibold text-slate-800">1. Procedures aligned to this area</h3>
      <Grid
        head={head}
        rows={[
          ["Aligned", ...area.section1.map((c) => c.aligned)],
          [`Reviewed in last ${report.period.months} months`, ...area.section1.map((c) => c.reviewed)],
          ["Overdue", ...area.section1.map((c) => c.overdue)],
          ["Due in next 90 days", ...area.section1.map((c) => c.dueSoon)],
          ["Never reviewed", ...area.section1.map((c) => c.neverReviewed)],
        ]}
      />

      <h3 className="mt-4 text-sm font-semibold text-slate-800">2. Staff engagement with these procedures</h3>
      <Grid
        head={head}
        rows={[
          [
            "Viewed and signed off",
            ...s2.pct.map((p, i) => (p === null ? "No required staff" : `${p}% (${s2.signed[i]} of ${s2.required[i]})`)),
          ],
          ...s2.byRole.map((r) => [`Sign-offs: ${r.role}`, ...r.counts]),
        ]}
      />

      <h3 className="mt-4 text-sm font-semibold text-slate-800">3. Outcomes data feeding reflection</h3>
      <Grid
        head={head}
        rows={[
          ["Collected: uploads", ...s3.uploads],
          ["Collected: staff flags", ...s3.flags],
          ["Reflected on", ...s3.reflected],
          ["Procedure reviews that drew on outcomes data", ...s3.reviewsDrew],
        ]}
      />
      <p className="mt-1 text-xs text-slate-500">These reviews are a subset of the reviews counted in section 1.</p>
      <p className="text-xs text-slate-500">
        Staff flags are held for the whole organisation and are not split by service.
        {report.isAllServices
          ? " Whole-of-organisation uploads appear in each service column and are counted once under All Services."
          : ""}
      </p>
      {s3.uploadListing.length > 0 && (
        <div className="mt-2 text-sm text-slate-700">
          <div className="text-xs font-semibold text-slate-500">Data uploads this period</div>
          <ul>
            {s3.uploadListing.map((u, i) => {
              const tag = single ? (u.wholeOfOrg ? WHOLE_OF_ORG_LABEL : null) : u.serviceName;
              return (
                <li key={i}>
                  {u.typeLabel}, {u.month}
                  {tag ? ` (${tag})` : ""}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <h3 className="mt-4 text-sm font-semibold text-slate-800">4. Procedure detail</h3>
      {area.procedures.length === 0 ? (
        <p className="text-sm text-slate-500">No procedure is aligned to this area.</p>
      ) : (
        <Grid
          head={["Procedure", "Role", "Policies served", "Last reviewed", "Next due", "Sign-off %"]}
          rows={area.procedures.map((p) => [
            p.name,
            p.roles.length > 0 ? p.roles.join(", ") : "Not assigned",
            p.policyNames.length > 0 ? p.policyNames.join(", ") : "No policy linked",
            p.lastReviewed ?? "Not yet reviewed",
            p.nextDue ? (p.overdue ? `${p.nextDue} (overdue)` : p.nextDue) : "Not set",
            p.signOffPct === null ? "n/a" : `${p.signOffPct}%`,
          ])}
        />
      )}

      <h3 className="mt-4 text-sm font-semibold text-slate-800">5. QIP statement</h3>
      <textarea
        value={statement}
        onChange={(e) => onStatement(e.target.value)}
        rows={4}
        maxLength={4000}
        className="mt-1 w-full rounded-md border border-slate-300 p-2 text-sm"
        aria-label={`QIP statement for ${area.option.code}`}
      />
    </section>
  );
}

function Grid({ head, rows }: { head: string[]; rows: (string | number)[][] }) {
  const numeric = head.length <= 5;
  return (
    <div className="mt-1 overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-slate-300 bg-slate-50 text-left text-xs text-slate-600">
            {head.map((h, i) => (
              <th key={i} className={`px-2 py-1.5 font-semibold ${i > 0 && numeric ? "text-right" : ""}`}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-slate-200 align-top">
              {r.map((c, j) => (
                <td key={j} className={`px-2 py-1.5 ${j > 0 && numeric ? "text-right" : ""}`}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
