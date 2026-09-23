import { Document, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer";

// Step 57, A5. The execution page appended to a signed contract (and, in
// Part B, an agreement). Deliberately not ReportShell (src/app/reports/_pdf/
// shell.tsx) - that hardcodes A4 portrait, but this page must match
// whatever size and orientation the original document's last page actually
// is (US Letter, landscape, etc.), per the spec's own verification cases.

const styles = StyleSheet.create({
  page: { padding: 36, fontSize: 10, fontFamily: "Helvetica", color: "#1a1a17" },
  heading: { fontSize: 14, fontWeight: 700, marginBottom: 4 },
  intro: { fontSize: 9, color: "#57534e", marginBottom: 16 },
  section: { marginBottom: 14 },
  sectionTitle: { fontSize: 10, fontWeight: 700, marginBottom: 4, color: "#1a1a17" },
  cell: { fontSize: 9, marginBottom: 2 },
  signerBlock: { marginBottom: 16 },
  signerRole: { fontSize: 9, fontWeight: 700, marginBottom: 4 },
  signatureImage: { width: 160, height: 54, objectFit: "contain", marginBottom: 4 },
  awaiting: { fontSize: 9, color: "#94a3b8", fontStyle: "italic" },
  statement: { fontSize: 8, color: "#57534e", marginTop: 8, marginBottom: 8 },
  integrity: { fontSize: 7, color: "#94a3b8" },
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

export type SignerBlock = {
  role: string; // e.g. "Employee", "Employer"
  signatureImage: { data: Buffer; format: "png" } | null;
  typedName: string | null;
  signedAt: string | null; // already formatted in the organisation's timezone
  accountEmail: string | null;
  awaitingLabel?: string; // "Awaiting countersignature" when required but not yet given
};

export function ExecutionPage({
  size,
  title,
  originalPageCount,
  employerLegalName,
  employeeName,
  documentDetails,
  referenceId,
  signers,
  hash,
  generatedAt,
}: {
  size: [number, number];
  title: string;
  originalPageCount: number;
  employerLegalName: string;
  employeeName: string;
  documentDetails: string[];
  referenceId: string;
  signers: SignerBlock[];
  hash: string;
  generatedAt: string;
}) {
  return (
    <Document>
      <Page size={size} style={styles.page}>
        <Text style={styles.heading}>Execution page</Text>
        <Text style={styles.intro}>
          This page forms part of {title} on the preceding {originalPageCount}{" "}
          page{originalPageCount === 1 ? "" : "s"}.
        </Text>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Parties</Text>
          <Text style={styles.cell}>Employer: {employerLegalName}</Text>
          <Text style={styles.cell}>Employee: {employeeName}</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Document details</Text>
          {documentDetails.map((line, i) => (
            <Text key={i} style={styles.cell}>
              {line}
            </Text>
          ))}
          <Text style={styles.cell}>Reference: {referenceId}</Text>
        </View>

        {signers.map((s, i) => (
          <View key={i} style={styles.signerBlock} wrap={false}>
            <Text style={styles.signerRole}>{s.role}</Text>
            {s.awaitingLabel ? (
              <Text style={styles.awaiting}>{s.awaitingLabel}</Text>
            ) : (
              <>
                {s.signatureImage && (
                  // eslint-disable-next-line jsx-a11y/alt-text -- react-pdf's
                  // Image renders into a PDF, not the DOM; it has no `alt` prop.
                  <Image style={styles.signatureImage} src={s.signatureImage} />
                )}
                <Text style={styles.cell}>{s.typedName}</Text>
                <Text style={styles.cell}>Signed: {s.signedAt}</Text>
                {s.accountEmail && <Text style={styles.cell}>Account: {s.accountEmail}</Text>}
              </>
            )}
          </View>
        ))}

        <Text style={styles.statement}>
          Each party signed electronically through the Vericlever portal after reading the
          document and agreeing to sign electronically.
        </Text>

        <Text style={styles.integrity}>SHA-256 of the document as signed: {hash}</Text>
        <Text style={styles.integrity}>Original page count: {originalPageCount}</Text>

        <View style={styles.footer} fixed>
          <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
          <Text>{`Generated ${generatedAt}`}</Text>
        </View>
      </Page>
    </Document>
  );
}
