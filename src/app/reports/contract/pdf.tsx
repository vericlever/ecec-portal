import { Text, View } from "@react-pdf/renderer";
import { ReportShell, styles } from "../_pdf/shell";
import type { ContractRow } from "@/lib/contracts";

function fmt(v: string | null): string {
  if (!v) return "—";
  return new Date(v).toLocaleDateString("en-AU", { dateStyle: "medium" });
}

export function ContractPdf({
  orgName,
  staffName,
  contract,
}: {
  orgName: string;
  staffName: string;
  contract: ContractRow;
}) {
  return (
    <ReportShell orgName={orgName} title="Employment contract" subtitle={staffName}>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Contract details</Text>
        <Text style={styles.cell}>
          {contract.period_type === "fixed"
            ? `Fixed period: ${fmt(contract.start_date)} to ${fmt(contract.expiry_date)} (${contract.duration_months} months)`
            : `No fixed period, starting ${fmt(contract.start_date)}`}
        </Text>
        {contract.notes && <Text style={styles.cell}>{contract.notes}</Text>}
      </View>

      {contract.is_deed ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Execution</Text>
          <Text style={styles.cell}>
            This document is a deed, executed on paper with the required
            witnessing. The signed copy is held as the uploaded document, not
            recorded here.
          </Text>
        </View>
      ) : (
        <>
          <View style={styles.section} wrap={false}>
            <Text style={styles.sectionTitle}>Employee signature</Text>
            {contract.signed_at ? (
              <>
                <Text style={styles.cell}>Signed: {contract.signed_name}</Text>
                <Text style={styles.cell}>Date: {fmt(contract.signed_at)}</Text>
                {contract.signed_content_hash && (
                  <Text style={{ fontSize: 7, color: "#94a3b8", marginTop: 2 }}>
                    Document hash (SHA-256): {contract.signed_content_hash}
                  </Text>
                )}
              </>
            ) : (
              <Text style={styles.emptyState}>Not yet signed.</Text>
            )}
          </View>

          <View style={styles.section} wrap={false}>
            <Text style={styles.sectionTitle}>Countersignature</Text>
            {contract.countersigned_at ? (
              <>
                <Text style={styles.cell}>
                  Countersigned: {contract.countersigned_name}
                </Text>
                <Text style={styles.cell}>Date: {fmt(contract.countersigned_at)}</Text>
                {contract.countersigned_content_hash && (
                  <Text style={{ fontSize: 7, color: "#94a3b8", marginTop: 2 }}>
                    Document hash (SHA-256): {contract.countersigned_content_hash}
                  </Text>
                )}
              </>
            ) : (
              <Text style={styles.emptyState}>Not yet countersigned.</Text>
            )}
          </View>
        </>
      )}
    </ReportShell>
  );
}
