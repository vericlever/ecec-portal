import { Text, View } from "@react-pdf/renderer";
import { ReportShell, styles } from "../_pdf/shell";
import type { PerStaffCompliance } from "@/lib/reports";

export function PerStaffCompliancePdf({
  orgName,
  data,
}: {
  orgName: string;
  data: PerStaffCompliance;
}) {
  return (
    <ReportShell
      orgName={orgName}
      title="Per-staff compliance report"
      subtitle={`${data.fullName} — ${data.serviceName}${data.jobRoleName ? ` — ${data.jobRoleName}` : ""}`}
    >
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>
          Procedures signed ({data.sopSigned.length})
        </Text>
        {data.sopSigned.length === 0 ? (
          <Text style={styles.emptyState}>None yet.</Text>
        ) : (
          data.sopSigned.map((s) => (
            <Text key={s.id} style={styles.cell}>• {s.name}</Text>
          ))
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>
          Procedures outstanding ({data.sopOutstanding.length})
        </Text>
        {data.sopOutstanding.length === 0 ? (
          <Text style={styles.emptyState}>None — everything in the suite is signed.</Text>
        ) : (
          data.sopOutstanding.map((s) => (
            <Text key={s.id} style={styles.cell}>
              • {s.name}
              {s.awaitingCountersign ? " (awaiting manager countersignature)" : ""}
            </Text>
          ))
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>
          Policies ({data.policiesViewed} viewed, {data.policiesOutstanding.length}{" "}
          outstanding)
        </Text>
        {data.policiesOutstanding.length === 0 ? (
          <Text style={styles.emptyState}>Everything published has been viewed.</Text>
        ) : (
          data.policiesOutstanding.map((p) => (
            <Text key={p.id} style={styles.cell}>• {p.name}</Text>
          ))
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Credentials</Text>
        {data.credentials.length === 0 ? (
          <Text style={styles.emptyState}>Nothing expired or expiring within 60 days.</Text>
        ) : (
          data.credentials.map((c, i) => (
            <Text
              key={i}
              style={[styles.cell, c.status === "expired" ? styles.badgeOverdue : styles.badgeSoon]}
            >
              • {c.kind}: {c.label} — {c.status} {c.expiryDate}
            </Text>
          ))
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Contract</Text>
        {!data.contract ? (
          <Text style={styles.emptyState}>No active contract on file.</Text>
        ) : (
          <>
            <Text style={styles.cell}>
              {data.contract.period_type === "fixed"
                ? `Fixed term, expires ${data.contract.expiry_date}`
                : "No fixed period"}
            </Text>
            <Text style={styles.cell}>
              {data.contract.signed_at
                ? `Signed by ${data.contract.signed_name} on ${new Date(data.contract.signed_at).toLocaleDateString("en-AU")}`
                : "Not yet signed"}
            </Text>
            {(data.contractRenewal.bucket === "due" || data.contractRenewal.bucket === "expired") && (
              <Text style={styles.badgeOverdue}>
                {data.contractRenewal.bucket === "expired" ? "Expired" : "Due for renewal"}
              </Text>
            )}
          </>
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Agreements</Text>
        <Text style={styles.cell}>
          {data.agreementsUnsigned === 0
            ? "Everything has been signed."
            : `${data.agreementsUnsigned} agreement${data.agreementsUnsigned === 1 ? "" : "s"} not yet signed.`}
        </Text>
      </View>
    </ReportShell>
  );
}
