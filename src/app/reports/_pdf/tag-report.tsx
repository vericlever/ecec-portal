import { Text, View } from "@react-pdf/renderer";
import { ReportShell, styles } from "./shell";
import type { TagSection } from "@/lib/reports";

// Shared body for Steps 32 (child safety standards) and 33 (quality area):
// one section per tag, listing the procedures tagged to it.
export function TagReportPdf({
  orgName,
  title,
  sections,
}: {
  orgName: string;
  title: string;
  sections: TagSection[];
}) {
  return (
    <ReportShell orgName={orgName} title={title}>
      {sections.map((section) => (
        <View key={section.option.id} style={styles.section} wrap={false}>
          <Text style={styles.sectionTitle}>
            {section.option.code} — {section.option.name}
          </Text>
          {section.sops.length === 0 ? (
            <Text style={styles.emptyState}>No procedure tagged to this standard.</Text>
          ) : (
            <>
              <View style={[styles.row, { borderBottomWidth: 1, borderBottomColor: "#0f172a" }]}>
                <Text style={[styles.headerCell, { width: "34%" }]}>Procedure</Text>
                <Text style={[styles.headerCell, { width: "22%" }]}>Review status</Text>
                <Text style={[styles.headerCell, { width: "22%" }]}>Last reviewed</Text>
                <Text style={[styles.headerCell, { width: "22%" }]}>Suggested evidence</Text>
              </View>
              {section.sops.map((s) => (
                <View key={s.id} style={styles.row}>
                  <Text style={[styles.cell, { width: "34%" }]}>{s.name}</Text>
                  <Text
                    style={[
                      styles.cell,
                      { width: "22%" },
                      s.reviewOverdue ? styles.badgeOverdue : undefined,
                    ]}
                  >
                    {s.reviewLabel}
                  </Text>
                  <Text style={[styles.cell, { width: "22%" }]}>
                    {s.lastReviewedNote ?? "—"}
                  </Text>
                  <Text style={[styles.cell, { width: "22%" }]}>
                    {s.suggestedEvidence ?? "—"}
                  </Text>
                </View>
              ))}
            </>
          )}
        </View>
      ))}
    </ReportShell>
  );
}
