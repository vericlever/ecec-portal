import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import type { ReactNode } from "react";

// Shared chrome for every generated report: org name, report title, a
// generated-at timestamp, and page numbers. Every report builds its body with
// react-pdf's layout primitives (View/Text), not arbitrary CSS.

export const styles = StyleSheet.create({
  page: {
    padding: 36,
    fontSize: 10,
    fontFamily: "Helvetica",
    color: "#1e293b",
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    borderBottomWidth: 2,
    borderBottomColor: "#0f172a",
    paddingBottom: 8,
    marginBottom: 16,
  },
  orgName: { fontSize: 9, color: "#64748b" },
  title: { fontSize: 16, fontWeight: 700, marginTop: 2 },
  generatedAt: { fontSize: 8, color: "#94a3b8" },
  section: { marginBottom: 14 },
  sectionTitle: {
    fontSize: 11,
    fontWeight: 700,
    marginBottom: 6,
    color: "#0f172a",
  },
  subTitle: { fontSize: 9, color: "#64748b", marginBottom: 4 },
  row: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderBottomColor: "#e2e8f0",
    paddingVertical: 4,
  },
  headerCell: { fontSize: 8, fontWeight: 700, color: "#64748b" },
  cell: { fontSize: 9 },
  emptyState: { fontSize: 9, color: "#94a3b8", fontStyle: "italic" },
  badgeOverdue: { color: "#b91c1c", fontWeight: 700 },
  badgeSoon: { color: "#b45309" },
  footer: {
    position: "absolute",
    bottom: 20,
    left: 36,
    right: 36,
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 8,
    color: "#94a3b8",
  },
});

export function ReportShell({
  orgName,
  title,
  subtitle,
  children,
}: {
  orgName: string;
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  const generatedAt = new Date().toLocaleString("en-AU", {
    dateStyle: "medium",
    timeStyle: "short",
  });
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.orgName}>{orgName}</Text>
            <Text style={styles.title}>{title}</Text>
            {subtitle && <Text style={styles.subTitle}>{subtitle}</Text>}
          </View>
          <Text style={styles.generatedAt}>Generated {generatedAt}</Text>
        </View>

        {children}

        <Text
          style={styles.footer}
          render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`}
          fixed
        />
      </Page>
    </Document>
  );
}
