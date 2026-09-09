import { Text, View } from "@react-pdf/renderer";
import { ReportShell, styles } from "../_pdf/shell";
import type { ReviewCalendarItem } from "@/lib/reports";

export function ReviewCalendarPdf({
  orgName,
  scopeLabel,
  items,
}: {
  orgName: string;
  scopeLabel: string;
  items: ReviewCalendarItem[];
}) {
  return (
    <ReportShell
      orgName={orgName}
      title="Policy & procedure review calendar"
      subtitle={scopeLabel}
    >
      {items.length === 0 ? (
        <Text style={styles.emptyState}>No published policies or procedures on the review clock yet.</Text>
      ) : (
        <View>
          <View style={[styles.row, { borderBottomWidth: 1, borderBottomColor: "#0f172a" }]}>
            <Text style={[styles.headerCell, { width: "12%" }]}>Type</Text>
            <Text style={[styles.headerCell, { width: "48%" }]}>Name</Text>
            <Text style={[styles.headerCell, { width: "20%" }]}>Next review</Text>
            <Text style={[styles.headerCell, { width: "20%" }]}>Status</Text>
          </View>
          {items.map((i) => (
            <View key={`${i.kind}-${i.id}`} style={styles.row}>
              <Text style={[styles.cell, { width: "12%" }]}>{i.kind}</Text>
              <Text style={[styles.cell, { width: "48%" }]}>{i.name}</Text>
              <Text style={[styles.cell, { width: "20%" }]}>{i.nextReviewDate ?? "—"}</Text>
              <Text
                style={[styles.cell, { width: "20%" }, i.overdue ? styles.badgeOverdue : undefined]}
              >
                {i.label}
              </Text>
            </View>
          ))}
        </View>
      )}
    </ReportShell>
  );
}
