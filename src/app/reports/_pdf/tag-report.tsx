import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import type { ReactNode } from "react";
import { fmtDateLong } from "@/lib/format-date";
import { WHOLE_OF_ORG_LABEL, type AreaReport, type SmallCount, type TagReport } from "@/lib/tag-report";

// Shared PDF for the Child safety standards report and the Quality area
// report. Everything flows: table rows grow to fit their text, nothing is
// absolutely positioned except the page footer, each area starts on its own
// page, rows never split across a page break, and the procedure table's
// header row repeats on every page the table runs onto. Neutral tones only:
// outcomes data is never coloured as a score.

const s = StyleSheet.create({
  page: { paddingTop: 36, paddingHorizontal: 36, paddingBottom: 56, fontSize: 9, fontFamily: "Helvetica", color: "#1e293b" },
  chrome: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderBottomWidth: 1.5,
    borderBottomColor: "#0f172a",
    paddingBottom: 6,
    marginBottom: 14,
  },
  chromeOrg: { fontSize: 9, fontWeight: 700, color: "#0f172a" },
  chromeTitle: { fontSize: 8.5, color: "#475569", marginTop: 1 },
  chromeRight: { fontSize: 8.5, color: "#475569", textAlign: "right", maxWidth: 260 },
  footer: {
    position: "absolute",
    bottom: 22,
    left: 36,
    right: 36,
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 8,
    color: "#64748b",
  },
  h1: { fontSize: 15, fontWeight: 700, color: "#0f172a", marginBottom: 4 },
  h2: { fontSize: 10.5, fontWeight: 700, color: "#0f172a", marginTop: 14, marginBottom: 5 },
  lead: { fontSize: 9, color: "#475569", marginBottom: 8, lineHeight: 1.4 },
  note: { fontSize: 8, color: "#64748b", marginTop: 4, lineHeight: 1.35 },
  paragraph: { fontSize: 9.5, lineHeight: 1.5, color: "#1e293b" },
  listLine: { fontSize: 9, marginTop: 2, lineHeight: 1.35 },
  tableHead: { flexDirection: "row", backgroundColor: "#f1f5f9", borderBottomWidth: 0.75, borderBottomColor: "#94a3b8", paddingVertical: 4 },
  tableRow: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: "#e2e8f0", paddingVertical: 4 },
  th: { fontSize: 8, fontWeight: 700, color: "#334155", paddingHorizontal: 4 },
  td: { fontSize: 8.5, paddingHorizontal: 4, lineHeight: 1.3 },
  subLabel: { fontSize: 8, fontWeight: 700, color: "#475569", paddingHorizontal: 4 },
});

type Col = { header: string; width: string; align?: "left" | "right" };

function Table({ cols, rows, fixedHeader = false }: { cols: Col[]; rows: ReactNode[][]; fixedHeader?: boolean }) {
  return (
    <View>
      <View style={s.tableHead} fixed={fixedHeader} wrap={false}>
        {cols.map((c, i) => (
          <Text key={i} style={[s.th, { width: c.width, textAlign: c.align ?? "left" }]}>
            {c.header}
          </Text>
        ))}
      </View>
      {rows.map((row, r) => (
        <View key={r} style={s.tableRow} wrap={false}>
          {row.map((cell, i) => (
            <Text key={i} style={[s.td, { width: cols[i].width, textAlign: cols[i].align ?? "left" }]}>
              {cell}
            </Text>
          ))}
        </View>
      ))}
    </View>
  );
}

// First column takes the remaining width, the data columns share the rest.
function metricCols(report: TagReport, first = "Metric"): Col[] {
  const dataWidth = report.columns.length > 2 ? 15 : 22;
  return [
    { header: first, width: `${100 - dataWidth * report.columns.length}%` },
    ...report.columns.map((c) => ({ header: c, width: `${dataWidth}%`, align: "right" as const })),
  ];
}

const count = (n: SmallCount | number | null) => (n === null ? "n/a" : String(n));

function Chrome({ report, orgName, area }: { report: TagReport; orgName: string; area?: AreaReport }) {
  return (
    <>
      <View style={s.chrome} fixed>
        <View>
          <Text style={s.chromeOrg}>{orgName}</Text>
          <Text style={s.chromeTitle}>
            {report.title}
            {area ? `: ${area.option.code}` : ""}
          </Text>
        </View>
        <View>
          <Text style={s.chromeRight}>Service: {report.serviceLabel}</Text>
          <Text style={s.chromeRight}>
            Period: {fmtDateLong(report.period.start)} to {fmtDateLong(report.period.end)}
          </Text>
        </View>
      </View>
      <View style={s.footer} fixed>
        <Text>Generated {fmtDateLong(report.asOf)}</Text>
        <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
      </View>
    </>
  );
}

function AreaPages({ report, area, orgName, statement }: { report: TagReport; area: AreaReport; orgName: string; statement: string }) {
  const months = report.period.months;
  const reviewedLabel = `Reviewed in last ${months} months`;
  const single = !report.isAllServices;

  const section1: ReactNode[][] = [
    ["Aligned", ...area.section1.map((c) => count(c.aligned))],
    [reviewedLabel, ...area.section1.map((c) => count(c.reviewed))],
    ["Overdue", ...area.section1.map((c) => count(c.overdue))],
    ["Due in next 90 days", ...area.section1.map((c) => count(c.dueSoon))],
    ["Never reviewed", ...area.section1.map((c) => count(c.neverReviewed))],
  ];

  const s2 = area.section2;
  const section2: ReactNode[][] = [
    [
      "Viewed and signed off",
      ...s2.pct.map((p, i) => (p === null ? "No required staff" : `${p}% (${s2.signed[i]} of ${s2.required[i]})`)),
    ],
    ...s2.byRole.map((r) => [`Sign-offs: ${r.role}`, ...r.counts.map(count)]),
  ];

  const s3 = area.section3;
  const section3: ReactNode[][] = [
    ["Collected: uploads", ...s3.uploads.map(count)],
    ["Collected: staff flags", ...s3.flags.map(count)],
    ["Reflected on", ...s3.reflected.map(count)],
    ["Procedure reviews that drew on outcomes data", ...s3.reviewsDrew.map(count)],
  ];

  return (
    <>
      <Page size="A4" style={s.page}>
        <Chrome report={report} orgName={orgName} area={area} />
        <Text style={s.h1}>
          {area.option.code}: {area.option.name}
        </Text>

        <Text style={s.h2}>1. Procedures aligned to this area</Text>
        <Table cols={metricCols(report)} rows={section1} />

        <Text style={s.h2}>2. Staff engagement with these procedures</Text>
        <Table cols={metricCols(report)} rows={section2} />

        <Text style={s.h2}>3. Outcomes data feeding reflection</Text>
        <Table cols={metricCols(report)} rows={section3} />
        <Text style={s.note}>These reviews are a subset of the reviews counted in section 1.</Text>
        <Text style={s.note}>
          Staff flags are held for the whole organisation and are not split by service.
          {report.isAllServices
            ? " Whole-of-organisation uploads appear in each service column and are counted once under All Services."
            : ""}
        </Text>
        {s3.uploadListing.length > 0 && (
          <View wrap={false} style={{ marginTop: 6 }}>
            <Text style={s.subLabel}>Data uploads this period</Text>
            {s3.uploadListing.map((u, i) => {
              const tag = single ? (u.wholeOfOrg ? WHOLE_OF_ORG_LABEL : null) : u.serviceName;
              return (
                <Text key={i} style={s.listLine}>
                  {u.typeLabel}, {u.month}
                  {tag ? ` (${tag})` : ""}
                </Text>
              );
            })}
          </View>
        )}

        <Text style={s.h2}>4. Procedures aligned to this area</Text>
        {area.procedures.length === 0 ? (
          <Text style={s.note}>No procedure is aligned to this area.</Text>
        ) : (
          area.procedures.map((p) => (
            <Text key={p.id} style={s.listLine}>
              {p.name}
              {p.overdue ? " (review overdue)" : ""}
            </Text>
          ))
        )}

        <View wrap={false}>
          <Text style={s.h2}>5. QIP statement</Text>
          <Text style={s.paragraph}>{statement}</Text>
        </View>
      </Page>
    </>
  );
}

export function TagReportPdf({
  orgName,
  report,
  statements,
}: {
  orgName: string;
  report: TagReport;
  // Edited QIP statements keyed by area id. A missing key falls back to the
  // auto-drafted statement.
  statements?: Record<string, string>;
}) {
  return (
    <Document title={`${report.title} - ${report.serviceLabel}`} author={orgName}>
      <Page size="A4" style={s.page}>
        <Chrome report={report} orgName={orgName} />
        <Text style={s.h1}>Summary</Text>
        <Text style={s.lead}>
          Procedures aligned to each area, with their review status as at {fmtDateLong(report.asOf)}. Detail for each
          area follows, one area to a page.
        </Text>
        <Table
          fixedHeader
          cols={[
            { header: "Area", width: "40%" },
            { header: "Aligned", width: "10%", align: "right" },
            { header: `Reviewed in last ${report.period.months} months`, width: "15%", align: "right" },
            { header: "Overdue", width: "10%", align: "right" },
            { header: "Due in next 90 days", width: "13%", align: "right" },
            { header: "Never reviewed", width: "12%", align: "right" },
          ]}
          rows={report.summary.map((r) => [
            r.label,
            count(r.counts.aligned),
            count(r.counts.reviewed),
            count(r.counts.overdue),
            count(r.counts.dueSoon),
            count(r.counts.neverReviewed),
          ])}
        />
      </Page>
      {report.areas.map((area) => (
        <AreaPages
          key={area.option.id}
          report={report}
          area={area}
          orgName={orgName}
          statement={statements?.[String(area.option.id)]?.trim() || area.statement}
        />
      ))}
    </Document>
  );
}
