import { StyleSheet, Text, View } from "@react-pdf/renderer";
import { ReportShell, styles } from "./shell";
import type { TagSection } from "@/lib/reports";

const blockStyles = StyleSheet.create({
  block: { marginBottom: 12, paddingBottom: 10, borderBottomWidth: 0.5, borderBottomColor: "#e2e8f0" },
  procedureName: { fontSize: 10.5, fontWeight: 700, color: "#0f172a" },
  statusLine: { fontSize: 8.5, color: "#64748b", marginTop: 2 },
  label: { fontSize: 8, fontWeight: 700, color: "#0f172a", marginTop: 6 },
  paragraph: { fontSize: 9, color: "#1e293b", marginTop: 2, lineHeight: 1.4 },
  actionRow: { fontSize: 8.5, color: "#1e293b", marginTop: 2 },
  neverReviewed: { fontSize: 9, color: "#b45309", marginTop: 2 },
});

const DECISION_LABEL: Record<string, string> = {
  stands: "Procedure stands as written",
  needs_revision: "Procedure needs revision",
};

const ACTION_STATUS_LABEL: Record<string, string> = {
  open: "open",
  done: "done",
  cancelled: "cancelled",
};

// Shared body for the child safety standards report and its NQS equivalent:
// one section per tag, each tagged procedure rendered as a full block (a
// reflection is a paragraph, not a table cell). A procedure tagged to more
// than one standard appears in full under each one - the duplication is
// intended, since each standard has to stand alone as evidence.
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
            section.sops.map((s) => (
              <View key={s.id} style={blockStyles.block}>
                <Text style={blockStyles.procedureName}>{s.name}</Text>
                <Text style={blockStyles.statusLine}>
                  {s.policyNames.length > 0
                    ? `Serves: ${s.policyNames.join(", ")}`
                    : "Serves: no policy linked"}
                  {"  ·  "}
                  {s.everReviewed
                    ? `Last review ${s.lastReviewedDate}`
                    : "Not yet reviewed"}
                  {"  ·  "}
                  {s.nextReviewDueDate
                    ? `Next review due ${s.nextReviewDueDate}`
                    : "Next review due date not set"}
                  {s.decision && `  ·  ${DECISION_LABEL[s.decision]}`}
                </Text>

                {!s.everReviewed ? (
                  <Text style={blockStyles.neverReviewed}>
                    This procedure has not yet been reviewed.
                    {s.nextReviewDueDate && ` Review due ${s.nextReviewDueDate}.`}
                  </Text>
                ) : (
                  <>
                    <Text style={blockStyles.label}>Practice (level 3)</Text>
                    <Text style={blockStyles.paragraph}>{s.practiceReflection}</Text>

                    <Text style={blockStyles.label}>Outcomes (level 4)</Text>
                    <Text style={blockStyles.paragraph}>{s.outcomeReflection}</Text>

                    <Text style={blockStyles.label}>Actions</Text>
                    {s.actions.length === 0 ? (
                      <Text style={blockStyles.paragraph}>None raised.</Text>
                    ) : (
                      s.actions.map((a, i) => (
                        <Text key={i} style={blockStyles.actionRow}>
                          {a.description} — {a.ownerName}, due {a.dueDate} (
                          {ACTION_STATUS_LABEL[a.status]})
                        </Text>
                      ))
                    )}

                    <Text style={blockStyles.label}>Evidence</Text>
                    <Text style={blockStyles.paragraph}>
                      {s.evidenceFileName
                        ? `Attached: ${s.evidenceFileName}`
                        : "None attached."}
                    </Text>
                  </>
                )}
              </View>
            ))
          )}
        </View>
      ))}
    </ReportShell>
  );
}
