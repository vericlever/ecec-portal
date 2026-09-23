// Step 57, A8. For every contract signed by typed name before drawn
// signatures existed (signed_at set, no signed_signature_document_id),
// generates a signed copy with a text-only signer block. Skips - and
// separately counts - any whose original stored file isn't actually a real
// PDF (the old upload accept list allowed .doc/.docx/images; there is no
// original PDF for those to merge an execution page onto). Does not ask
// anyone to re-sign.
//
// Lives here, called from an admin-only route
// (src/app/api/admin/contract-backfill/route.ts), rather than a standalone
// script: @react-pdf/renderer (used inside buildSignedCopy) cannot run
// under a bare `npx tsx` invocation - it hits ERR_PACKAGE_PATH_NOT_EXPORTED
// on @react-pdf/hyphenate's ./en-us subpath under Node's strict ESM exports
// enforcement, the same tooling limitation hit earlier generating a test
// PDF standalone this session. It only works inside Next.js's own webpack
// build, which next.config.mjs already externalises this package for
// (confirmed working - see Steps 30-38's report generation).
//
// Runs on the admin client throughout: no real user session drives a bulk
// maintenance pass over every contract in the tenant, same reasoning
// scripts/reprocess-documents.ts and scripts/bulk-republish.ts already
// established for one-time content migrations.

import { createAdminClient } from "@/lib/supabase/admin";
import { validatePdf } from "./validate-pdf";
import { buildSignedCopy } from "./signed-copy";
import type { SignerBlock } from "./execution-page";

const BUCKET = "documents";
const BACKFILL_LABEL = "Typed-name signature, signed before drawn signatures were introduced";

export type BackfillResult = {
  succeeded: number;
  skippedNotPdf: number;
  failed: number;
  details: { contractId: string; employeeName: string; status: string }[];
};

export async function runContractBackfill(opts: { dryRun: boolean }): Promise<BackfillResult> {
  const admin = createAdminClient();

  const { data: contracts, error } = await admin
    .from("contracts")
    .select(
      `id, organisation_id, profile_id, document_id, signed_at, signed_name, signed_content_hash,
       countersigned_at, countersigned_name, requires_countersign, is_deed, start_date, period_type,
       duration_months, expiry_date, signed_copy_document_id`,
    )
    .not("signed_at", "is", null)
    .is("signed_signature_document_id", null)
    .eq("is_deed", false);
  if (error) throw error;

  let succeeded = 0;
  let skippedNotPdf = 0;
  let failed = 0;
  const details: BackfillResult["details"] = [];

  for (const contract of contracts ?? []) {
    if (!contract.document_id || !contract.signed_content_hash) continue;

    const { data: doc } = await admin
      .from("documents")
      .select("storage_path, mime_type")
      .eq("id", contract.document_id)
      .maybeSingle();
    if (!doc) {
      details.push({ contractId: contract.id, employeeName: "", status: "original document row missing" });
      continue;
    }

    const { data: fileData, error: dlError } = await admin.storage.from(BUCKET).download(doc.storage_path);
    if (dlError || !fileData) {
      details.push({ contractId: contract.id, employeeName: "", status: `download failed: ${dlError?.message}` });
      failed++;
      continue;
    }
    const originalBytes = new Uint8Array(await fileData.arrayBuffer());

    const pdfCheck = await validatePdf(originalBytes, doc.mime_type, doc.storage_path);
    if (!pdfCheck.ok) {
      details.push({ contractId: contract.id, employeeName: "", status: "original is not a real PDF, skipped" });
      skippedNotPdf++;
      continue;
    }

    const [{ data: org }, { data: profile }] = await Promise.all([
      admin.from("organisations").select("name, display_name, timezone").eq("id", contract.organisation_id).maybeSingle(),
      admin.from("profiles").select("full_name").eq("id", contract.profile_id).maybeSingle(),
    ]);
    const employerLegalName =
      (org?.display_name as string | null) || (org?.name as string | null) || "the employer";
    const employeeName = profile?.full_name ?? "Employee";
    const timezone = (org?.timezone as string | null) ?? "Australia/Melbourne";

    const fmtSigned = (iso: string) =>
      new Date(iso).toLocaleString("en-AU", { timeZone: timezone, dateStyle: "medium", timeStyle: "short" });

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
        role: `Employee - ${BACKFILL_LABEL}`,
        signatureImage: null,
        typedName: contract.signed_name,
        signedAt: fmtSigned(contract.signed_at),
        accountEmail: null,
      },
    ];
    if (contract.requires_countersign) {
      signers.push(
        contract.countersigned_at
          ? {
              role: `Employer - ${BACKFILL_LABEL}`,
              signatureImage: null,
              typedName: contract.countersigned_name,
              signedAt: fmtSigned(contract.countersigned_at),
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

    try {
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

      if (opts.dryRun) {
        details.push({ contractId: contract.id, employeeName, status: `would build ${bytes.length} bytes` });
      } else {
        const cleanName = `Signed contract - ${employeeName.replace(/[^A-Za-z0-9._ ()-]/g, "").trim()}.pdf`;
        const storagePath = `${contract.organisation_id}/signed_copy/${contract.id}/${Date.now()}-${cleanName}`;
        const up = await admin.storage.from(BUCKET).upload(storagePath, bytes, {
          contentType: "application/pdf",
          upsert: false,
        });
        if (up.error) throw new Error(up.error.message);

        const { data: docRow, error: docError } = await admin
          .from("documents")
          .insert({
            organisation_id: contract.organisation_id,
            owner_type: "signed_copy",
            owner_id: contract.id,
            file_name: cleanName,
            mime_type: "application/pdf",
            byte_size: bytes.byteLength,
            storage_path: storagePath,
            needs_review: false,
            uploaded_by: contract.profile_id,
          })
          .select("id")
          .single();
        if (docError || !docRow) throw new Error(docError?.message ?? "Could not save signed copy row.");

        await admin
          .from("contracts")
          .update({
            signed_copy_document_id: docRow.id,
            signed_copy_hash: hash,
            signed_copy_generated_at: new Date().toISOString(),
          })
          .eq("id", contract.id);

        details.push({ contractId: contract.id, employeeName, status: `built ${bytes.length} bytes` });
      }
      succeeded++;
    } catch (e) {
      details.push({ contractId: contract.id, employeeName, status: `FAILED: ${e instanceof Error ? e.message : e}` });
      failed++;
    }
  }

  return { succeeded, skippedNotPdf, failed, details };
}
