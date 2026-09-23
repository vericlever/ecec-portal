import { createHash } from "node:crypto";
import { PDFDocument } from "pdf-lib";
import { renderToBuffer } from "@react-pdf/renderer";
import type { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { storeDocument, deleteDocument } from "@/lib/documents/store";
import { fmtDateTime } from "@/lib/format-date";
import { ExecutionPage, type SignerBlock } from "./execution-page";

type ServerClient = ReturnType<typeof createClient>;

const BUCKET = "documents";

// Storage has no per-object RLS (confirmed by rls-check.mjs's own probes),
// so a file's bytes always come through the admin client - same reasoning
// documentSha256 (src/lib/documents/store.ts) already uses. Everything else
// in this module runs on the caller's own request-scoped client, so
// documents_select/contracts_select still gate what can actually be read.
async function downloadBytes(storagePath: string): Promise<Uint8Array> {
  const admin = createAdminClient();
  const { data, error } = await admin.storage.from(BUCKET).download(storagePath);
  if (error || !data) throw new Error(`Could not download ${storagePath}: ${error?.message ?? "not found"}`);
  return new Uint8Array(await data.arrayBuffer());
}

export type BuildSignedCopyInput = {
  originalBytes: Uint8Array;
  expectedHash: string;
  title: string;
  employerLegalName: string;
  employeeName: string;
  documentDetails: string[];
  referenceId: string;
  timezone: string;
  signers: SignerBlock[];
};

// Step 57, A5. Independent of where the document came from - Part B calls
// this exact function for agreements too. Original pages are never touched:
// loaded once, an execution page copied in from a second, separately
// rendered document, and appended.
export async function buildSignedCopy(
  input: BuildSignedCopyInput,
): Promise<{ bytes: Uint8Array; hash: string }> {
  const actualHash = createHash("sha256").update(input.originalBytes).digest("hex");
  if (actualHash !== input.expectedHash) {
    throw new Error(
      "The original document has changed since it was signed - a signed copy cannot be produced until this is looked at.",
    );
  }

  const original = await PDFDocument.load(input.originalBytes);
  const pageCount = original.getPageCount();
  const lastPage = original.getPage(pageCount - 1);
  const { width, height } = lastPage.getSize();

  const executionBuffer = await renderToBuffer(
    ExecutionPage({
      size: [width, height],
      title: input.title,
      originalPageCount: pageCount,
      employerLegalName: input.employerLegalName,
      employeeName: input.employeeName,
      documentDetails: input.documentDetails,
      referenceId: input.referenceId,
      signers: input.signers,
      hash: actualHash,
      generatedAt: fmtDateTime(new Date().toISOString(), input.timezone),
    }),
  );

  const executionDoc = await PDFDocument.load(executionBuffer);
  const [executionPage] = await original.copyPages(executionDoc, [0]);
  original.addPage(executionPage);
  original.setTitle(`${input.title} - signed`);

  const bytes = await original.save();
  return { bytes, hash: actualHash };
}

async function signerImage(
  supabase: ServerClient,
  documentId: string | null,
): Promise<{ data: Buffer; format: "png" } | null> {
  if (!documentId) return null;
  const { data: doc } = await supabase
    .from("documents")
    .select("storage_path")
    .eq("id", documentId)
    .maybeSingle();
  if (!doc) return null;
  const bytes = await downloadBytes(doc.storage_path);
  return { data: Buffer.from(bytes), format: "png" };
}

// Called from signOwnContract()/countersignContract() after the RPC
// succeeds, on the SAME caller-scoped client - a plain employee signing
// their own contract needs to be able to read their own contract/org/
// profile rows and write the resulting documents/signed_copy_* records, all
// of which the relevant RLS already allows for the contract's own owner
// (documents_select/write in migration 0082, set_contract_signed_copy in
// 0083). Never rolls the signature back on failure - see the callers.
export async function generateContractSignedCopy(
  supabase: ServerClient,
  contractId: string,
): Promise<void> {
  const { data: contract, error } = await supabase
    .from("contracts")
    .select(
      `id, organisation_id, profile_id, document_id, signed_at, signed_name, signed_content_hash,
       signed_signature_document_id, countersigned_at, countersigned_name, countersigned_signature_document_id,
       requires_countersign, signed_copy_document_id, start_date, period_type, duration_months, expiry_date`,
    )
    .eq("id", contractId)
    .maybeSingle();
  if (error || !contract) throw new Error("Contract not found.");
  if (!contract.document_id || !contract.signed_at || !contract.signed_content_hash) {
    throw new Error("Contract has no signed document to build a copy from.");
  }

  const [{ data: origDoc }, { data: org }, { data: profile }] = await Promise.all([
    supabase.from("documents").select("storage_path").eq("id", contract.document_id).maybeSingle(),
    supabase.from("organisations").select("name, display_name, timezone").eq("id", contract.organisation_id).maybeSingle(),
    supabase.from("profiles").select("full_name").eq("id", contract.profile_id).maybeSingle(),
  ]);
  if (!origDoc) throw new Error("Original contract document not found.");

  const originalBytes = await downloadBytes(origDoc.storage_path);
  const employerLegalName =
    (org?.display_name as string | null) || (org?.name as string | null) || "the employer";
  const employeeName = profile?.full_name ?? "Employee";
  const timezone = (org?.timezone as string | null) ?? "Australia/Melbourne";

  const [employeeImage, employerImage] = await Promise.all([
    signerImage(supabase, contract.signed_signature_document_id),
    signerImage(supabase, contract.countersigned_signature_document_id),
  ]);

  const documentDetails =
    contract.period_type === "fixed"
      ? [
          `Start date: ${contract.start_date}`,
          `Period: fixed, ${contract.duration_months} months`,
          `Expiry: ${contract.expiry_date}`,
        ]
      : [`Start date: ${contract.start_date}`, "Period: no fixed period"];

  const signers: SignerBlock[] = [
    {
      role: "Employee",
      signatureImage: employeeImage,
      typedName: contract.signed_name,
      signedAt: fmtDateTime(contract.signed_at, timezone),
      accountEmail: null,
    },
  ];
  if (contract.requires_countersign) {
    signers.push(
      contract.countersigned_at
        ? {
            role: "Employer",
            signatureImage: employerImage,
            typedName: contract.countersigned_name,
            signedAt: fmtDateTime(contract.countersigned_at, timezone),
            accountEmail: null,
          }
        : {
            role: "Employer",
            signatureImage: null,
            typedName: null,
            signedAt: null,
            accountEmail: null,
            awaitingLabel: "Awaiting countersignature",
          },
    );
  }

  const { bytes, hash } = await buildSignedCopy({
    originalBytes,
    expectedHash: contract.signed_content_hash,
    title: "Employment contract",
    employerLegalName,
    employeeName,
    documentDetails,
    referenceId: contract.id.slice(0, 8),
    timezone,
    signers,
  });

  const stored = await storeDocument({
    organisationId: contract.organisation_id,
    ownerType: "signed_copy",
    ownerId: contract.id,
    fileName: `Signed contract - ${employeeName}.pdf`,
    mimeType: "application/pdf",
    bytes,
    uploadedBy: contract.profile_id,
    extract: false,
  });
  if (!stored.ok) throw new Error(stored.error);

  const previousSignedCopyId = contract.signed_copy_document_id as string | null;

  const { error: rpcError } = await supabase.rpc("set_contract_signed_copy", {
    p_contract_id: contract.id,
    p_signed_copy_document_id: stored.document.id,
    p_signed_copy_hash: hash,
  });
  if (rpcError) throw new Error(rpcError.message);

  if (previousSignedCopyId) {
    await deleteDocument(previousSignedCopyId);
  }
}
