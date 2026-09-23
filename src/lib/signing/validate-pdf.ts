import { PDFDocument } from "pdf-lib";

// Step 57, A1. PDF is the only accepted upload for anything signed in the
// portal - shared by contract upload (Part A) and agreement upload
// (Part B). A deed keeps accepting any file type and never calls this.
export const PDF_ONLY_STATEMENT =
  "To preserve the original document exactly as issued, contracts and agreements can only be uploaded as PDF files. If you have a Word document, save it as PDF first.";

const PDF_MAGIC = "%PDF-";

export type PdfValidation = { ok: true } | { ok: false; error: string };

export async function validatePdf(
  bytes: Uint8Array,
  mimeType: string | null,
  fileName: string,
): Promise<PdfValidation> {
  const looksLikePdf =
    (mimeType === "application/pdf" || !mimeType) &&
    new TextDecoder("latin1").decode(bytes.slice(0, 5)) === PDF_MAGIC;
  if (!looksLikePdf) {
    return { ok: false, error: `${PDF_ONLY_STATEMENT} (${fileName})` };
  }

  try {
    // No ignoreEncryption - an encrypted PDF should fail to load, which is
    // exactly the case this branch exists to catch.
    await PDFDocument.load(bytes);
  } catch {
    return {
      ok: false,
      error: "This PDF is password protected or damaged. Upload an unprotected copy.",
    };
  }

  return { ok: true };
}
