import { Text, View } from "@react-pdf/renderer";
import { ReportShell, styles } from "../_pdf/shell";
import type { ServiceOverview } from "@/lib/reports";

export function ServiceOverviewPdf({
  orgName,
  data,
}: {
  orgName: string;
  data: ServiceOverview;
}) {
  const stat = (label: string, value: string, sub?: string) => (
    <View style={{ width: "25%" }}>
      <Text style={{ fontSize: 8, color: "#64748b" }}>{label}</Text>
      <Text style={{ fontSize: 16, fontWeight: 700, marginTop: 2 }}>{value}</Text>
      {sub && <Text style={{ fontSize: 8, color: "#94a3b8" }}>{sub}</Text>}
    </View>
  );

  return (
    <ReportShell orgName={orgName} title="Service overview" subtitle={data.serviceName}>
      <View style={[styles.section, { flexDirection: "row" }]}>
        {stat("Staff", String(data.staffTotal))}
        {stat("Fully compliant", `${data.fullyCompliant} of ${data.staffTotal}`)}
        {stat(
          "Procedures signed",
          data.sopPct === null ? "—" : `${data.sopPct}%`,
          data.sopTotal > 0 ? `${data.sopSigned} of ${data.sopTotal}` : "none assigned",
        )}
        {stat(
          "Policies viewed",
          data.policyPct === null ? "—" : `${data.policyPct}%`,
          data.policyTotal > 0
            ? `${data.policyViewed} of ${data.policyTotal}`
            : "none published",
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Outstanding items</Text>
        <Text style={styles.cell}>
          {data.outstanding === 0
            ? "Nothing outstanding across this service."
            : `${data.outstanding} outstanding item${data.outstanding === 1 ? "" : "s"} across the service's staff.`}
        </Text>
      </View>
    </ReportShell>
  );
}
