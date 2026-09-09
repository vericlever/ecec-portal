import { Text, View } from "@react-pdf/renderer";
import { ReportShell, styles } from "../_pdf/shell";
import type { HrExpiringPerson } from "@/lib/reports";

export function HrExpiringItemsPdf({
  orgName,
  scopeLabel,
  people,
}: {
  orgName: string;
  scopeLabel: string;
  people: HrExpiringPerson[];
}) {
  return (
    <ReportShell orgName={orgName} title="HR expiring items report" subtitle={scopeLabel}>
      {people.length === 0 ? (
        <Text style={styles.emptyState}>Nothing expired or expiring within 60 days.</Text>
      ) : (
        people.map((p) => (
          <View key={p.profileId} style={styles.section} wrap={false}>
            <Text style={styles.sectionTitle}>
              {p.fullName} — {p.serviceName}
            </Text>
            {p.credentials.map((c, i) => (
              <View key={i} style={styles.row}>
                <Text style={[styles.cell, { width: "40%" }]}>{c.kind}: {c.label}</Text>
                <Text
                  style={[
                    styles.cell,
                    { width: "30%" },
                    c.status === "expired" ? styles.badgeOverdue : styles.badgeSoon,
                  ]}
                >
                  {c.status === "expired" ? "Expired" : "Expiring"} {c.expiryDate}
                </Text>
                <Text style={[styles.cell, { width: "30%" }]}>
                  {c.daysLeft < 0 ? `${Math.abs(c.daysLeft)} days ago` : `in ${c.daysLeft} days`}
                </Text>
              </View>
            ))}
            {p.contract && (
              <View style={styles.row}>
                <Text style={[styles.cell, { width: "40%" }]}>Contract</Text>
                <Text
                  style={[
                    styles.cell,
                    { width: "30%" },
                    p.contract.bucket === "expired" ? styles.badgeOverdue : styles.badgeSoon,
                  ]}
                >
                  {p.contract.bucket === "expired" ? "Expired" : "Due for renewal"}{" "}
                  {p.contract.expiryDate}
                </Text>
                <Text style={[styles.cell, { width: "30%" }]}>
                  {p.contract.daysLeft < 0
                    ? `${Math.abs(p.contract.daysLeft)} days ago`
                    : `in ${p.contract.daysLeft} days`}
                </Text>
              </View>
            )}
          </View>
        ))
      )}
    </ReportShell>
  );
}
