import { createHash } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { extractDocument } from "@/lib/documents/extract";

const BUCKET = "documents";

export type StoredDocument = {
  id: string;
  file_name: string;
  mime_type: string | null;
  byte_size: number | null;
  extracted_text: string | null;
  extraction_note: string | null;
  needs_review: boolean;
  created_at: string;
};

function safeName(name: string): string {
  const base = name.replace(/[/\\]/g, "_").replace(/[^A-Za-z0-9._ ()-]/g, "").trim();
  return base || "document";
}

// Upload bytes to the private bucket and extract text, without writing a
// documents row - the half of storeDocument() that a bulk-upload staging
// area needs (Step 47): the file has to actually be parsed and stored before
// review, since duplicate/filename/blank-content detection all need the
// result, but no permanent documents row should exist until the batch is
// committed. storeDocument() below is this plus the row insert, for every
// caller that already has a real owner to attach to.
export async function uploadAndExtract(opts: {
  organisationId: string;
  pathPrefix: string; // e.g. "sop"/"policy" for real owners, "bulk_staging" for a pending batch
  ownerId: string; // a real sop/policy id, or the staging row's own id
  fileName: string;
  mimeType: string | null;
  bytes: Uint8Array;
  // Step 57: contracts (and signatures/signed copies) hold pay rates and
  // personal terms and have no reason to be text-extracted. Defaults true so
  // every existing caller is unaffected.
  extract?: boolean;
}): Promise<
  | {
      ok: true;
      storagePath: string;
      extractedText: string | null;
      extractionNote: string | null;
      needsReview: boolean;
    }
  | { ok: false; error: string }
> {
  const admin = createAdminClient();
  const clean = safeName(opts.fileName);
  const path = `${opts.organisationId}/${opts.pathPrefix}/${opts.ownerId}/${Date.now()}-${clean}`;

  const up = await admin.storage
    .from(BUCKET)
    .upload(path, opts.bytes, {
      contentType: opts.mimeType ?? "application/octet-stream",
      upsert: false,
    });
  if (up.error) return { ok: false, error: up.error.message };

  let extractedText: string | null = null;
  let extractionNote: string | null = null;
  let needsReview = false;
  if (opts.extract !== false) {
    try {
      const extracted = await extractDocument(opts.fileName, opts.bytes);
      extractedText = extracted.text || null;
      extractionNote = extracted.note ?? null;
      needsReview = extracted.needsReview;
    } catch (e) {
      extractionNote =
        "Could not read the document automatically: " +
        (e instanceof Error ? e.message : "unknown error");
      needsReview = true;
    }
  }

  return { ok: true, storagePath: path, extractedText, extractionNote, needsReview };
}

// Store an uploaded file: put the bytes in the private bucket, extract text,
// and write one row in documents. The bucket itself has no per-object RLS
// (Storage policies are a separate, wider piece of work), so file storage
// stays on the service-role client - but the documents *row* goes through the
// caller's own RLS-scoped client, so documents_write (migration 0044) is the
// real gate on who may attach a file to what, per owner_type, not just this
// function's callers remembering to check first.
export async function storeDocument(opts: {
  organisationId: string;
  ownerType:
    | "policy"
    | "sop"
    | "contract"
    | "credential"
    | "identity"
    | "sop_evidence"
    | "signature"
    | "signed_copy";
  ownerId: string;
  fileName: string;
  mimeType: string | null;
  bytes: Uint8Array;
  uploadedBy: string;
  extract?: boolean;
}): Promise<
  { ok: true; document: StoredDocument } | { ok: false; error: string }
> {
  const uploaded = await uploadAndExtract({
    organisationId: opts.organisationId,
    pathPrefix: opts.ownerType,
    ownerId: opts.ownerId,
    fileName: opts.fileName,
    mimeType: opts.mimeType,
    bytes: opts.bytes,
    extract: opts.extract,
  });
  if (!uploaded.ok) return uploaded;

  const supabase = createClient();
  const { data, error } = await supabase
    .from("documents")
    .insert({
      organisation_id: opts.organisationId,
      owner_type: opts.ownerType,
      owner_id: opts.ownerId,
      file_name: opts.fileName,
      mime_type: opts.mimeType,
      byte_size: opts.bytes.byteLength,
      storage_path: uploaded.storagePath,
      extracted_text: uploaded.extractedText,
      extraction_note: uploaded.extractionNote,
      needs_review: uploaded.needsReview,
      uploaded_by: opts.uploadedBy,
    })
    .select(
      "id, file_name, mime_type, byte_size, extracted_text, extraction_note, needs_review, created_at",
    )
    .single();

  if (error) {
    const admin = createAdminClient();
    await admin.storage.from(BUCKET).remove([uploaded.storagePath]);
    return { ok: false, error: error.message };
  }
  return { ok: true, document: data as StoredDocument };
}

// A short-lived signed URL to download the original file. The caller must
// already have confirmed the user may see the owning record - this stays on
// the service-role client because it always runs after that check, and the
// bucket read itself has no separate RLS to hand it to anyway.
export async function signedDocumentUrl(
  documentId: string,
): Promise<{ url: string; fileName: string } | null> {
  const admin = createAdminClient();
  const { data: doc } = await admin
    .from("documents")
    .select("storage_path, file_name")
    .eq("id", documentId)
    .maybeSingle();
  if (!doc) return null;

  const { data, error } = await admin.storage
    .from(BUCKET)
    .createSignedUrl(doc.storage_path, 120, { download: doc.file_name });
  if (error || !data) return null;
  return { url: data.signedUrl, fileName: doc.file_name };
}

// sha256 of the exact stored bytes, for Step 39's "hash of the contract
// version signed". Downloads the file once; not cheap, so callers use it only
// at the moment of signing, not on every render.
export async function documentSha256(
  documentId: string | null,
): Promise<string | null> {
  if (!documentId) return null;
  const admin = createAdminClient();
  const { data: doc } = await admin
    .from("documents")
    .select("storage_path")
    .eq("id", documentId)
    .maybeSingle();
  if (!doc) return null;

  const { data, error } = await admin.storage.from(BUCKET).download(doc.storage_path);
  if (error || !data) return null;
  const bytes = new Uint8Array(await data.arrayBuffer());
  return createHash("sha256").update(bytes).digest("hex");
}

export async function deleteDocument(documentId: string): Promise<void> {
  const admin = createAdminClient();
  const { data: doc } = await admin
    .from("documents")
    .select("storage_path")
    .eq("id", documentId)
    .maybeSingle();
  if (doc) await admin.storage.from(BUCKET).remove([doc.storage_path]);
  await admin.from("documents").delete().eq("id", documentId);
}

// Review cycle v2's single evidence file, one per review. sop_reviews stores
// the path directly (evidence_path text) rather than going through the
// documents table's polymorphic owner pattern - there is exactly one file,
// it belongs to exactly one review, and it is never replaced or re-tagged,
// so the extra indirection the documents table exists for buys nothing here.
export async function storeReviewEvidence(opts: {
  organisationId: string;
  sopId: string;
  fileName: string;
  mimeType: string | null;
  bytes: Uint8Array;
}): Promise<{ ok: true; path: string } | { ok: false; error: string }> {
  const admin = createAdminClient();
  const path = `${opts.organisationId}/sop_review/${opts.sopId}/${Date.now()}-${safeName(opts.fileName)}`;
  const up = await admin.storage.from(BUCKET).upload(path, opts.bytes, {
    contentType: opts.mimeType ?? "application/octet-stream",
    upsert: false,
  });
  if (up.error) return { ok: false, error: up.error.message };
  return { ok: true, path };
}

export async function signedReviewEvidenceUrl(
  path: string,
  downloadName: string,
): Promise<string | null> {
  const admin = createAdminClient();
  const { data, error } = await admin.storage
    .from(BUCKET)
    .createSignedUrl(path, 120, { download: downloadName });
  if (error || !data) return null;
  return data.signedUrl;
}
