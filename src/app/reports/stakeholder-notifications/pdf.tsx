import { Text, View } from "@react-pdf/renderer";
import { ReportShell, styles } from "../_pdf/shell";
import type { StakeholderNotification } from "@/lib/reports";

export function StakeholderNotificationsPdf({
  orgName,
  notifications,
}: {
  orgName: string;
  notifications: StakeholderNotification[];
}) {
  return (
    <ReportShell orgName={orgName} title="Stakeholder Notification Report">
      {notifications.length === 0 ? (
        <View style={styles.section}>
          <Text style={styles.emptyState}>
            No parent notifications recorded yet. This report sources from the
            Reg 172 policy-notification trigger, which is not live in this
            portal yet (the outbound sending domain has not been verified).
            Once that is resolved and a notification fires, it will appear
            here with the policy name, version and the date it was sent.
          </Text>
        </View>
      ) : (
        <View>
          <View style={[styles.row, { borderBottomWidth: 1, borderBottomColor: "#0f172a" }]}>
            <Text style={[styles.headerCell, { width: "50%" }]}>Policy</Text>
            <Text style={[styles.headerCell, { width: "20%" }]}>Version</Text>
            <Text style={[styles.headerCell, { width: "30%" }]}>Notified</Text>
          </View>
          {notifications.map((n, i) => (
            <View key={i} style={styles.row}>
              <Text style={[styles.cell, { width: "50%" }]}>{n.policyName}</Text>
              <Text style={[styles.cell, { width: "20%" }]}>v{n.policyVersion}</Text>
              <Text style={[styles.cell, { width: "30%" }]}>{n.notifiedAt}</Text>
            </View>
          ))}
        </View>
      )}
    </ReportShell>
  );
}
