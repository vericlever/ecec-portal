import { Text, View } from "@react-pdf/renderer";
import { ReportShell, styles } from "../_pdf/shell";
import type { ChangeHistoryEntry } from "@/lib/reports";

export function ChangeHistoryPdf({
  orgName,
  entries,
}: {
  orgName: string;
  entries: ChangeHistoryEntry[];
}) {
  return (
    <ReportShell
      orgName={orgName}
      title="Version & change history report"
      subtitle="Procedure history is a full edit log. Policies have no per-edit log yet, so the policy rows below show the latest published version only."
    >
      {entries.length === 0 ? (
        <Text style={styles.emptyState}>No history recorded yet.</Text>
      ) : (
        <View>
          <View style={[styles.row, { borderBottomWidth: 1, borderBottomColor: "#0f172a" }]}>
            <Text style={[styles.headerCell, { width: "10%" }]}>Type</Text>
            <Text style={[styles.headerCell, { width: "28%" }]}>Name</Text>
            <Text style={[styles.headerCell, { width: "20%" }]}>Event</Text>
            <Text style={[styles.headerCell, { width: "22%" }]}>By</Text>
            <Text style={[styles.headerCell, { width: "20%" }]}>When</Text>
          </View>
          {entries.map((e, i) => (
            <View key={i} style={styles.row}>
              <Text style={[styles.cell, { width: "10%" }]}>{e.kind}</Text>
              <Text style={[styles.cell, { width: "28%" }]}>{e.name}</Text>
              <Text style={[styles.cell, { width: "20%" }]}>{e.eventLabel}</Text>
              <Text style={[styles.cell, { width: "22%" }]}>{e.actor}</Text>
              <Text style={[styles.cell, { width: "20%" }]}>
                {new Date(e.at).toLocaleDateString("en-AU", { dateStyle: "medium" })}
              </Text>
            </View>
          ))}
        </View>
      )}
    </ReportShell>
  );
}
