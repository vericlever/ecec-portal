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
  created_at: string;
};

function safeName(name: string): string {
  const base = name.replace(/[/\\]/g, "_").replace(/[^A-Za-z0-9._ ()-]/g, "").trim();
  return base || "document";
}

// Store an uploaded file: put the bytes in the private bucket, extract text,
// and write one row in documents. Uses the service-role client - callers must
// already have checked the user is allowed to do this.
export async function storeDocument(opts: {
  organisationId: string;
  ownerType: "policy" | "sop" | "contract" | "credential" | "identity";
  ownerId: string;
  fileName: string;
  mimeType: string | null;
  bytes: Uint8Array;
  uploadedBy: string;
}): Promise<
  { ok: true; document: StoredDocument } | { ok: false; error: string }
> {
  const admin = createAdminClient();
  const clean = safeName(opts.fileName);
  const path = `${opts.organisationId}/${opts.ownerType}/${opts.ownerId}/${Date.now()}-${clean}`;

  const up = await admin.storage
    .from(BUCKET)
    .upload(path, opts.bytes, {
      contentType: opts.mimeType ?? "application/octet-stream",
      upsert: false,
    });
  if (up.error) return { ok: false, error: up.error.message };

  let extractedText: string | null = null;
  let extractionNote: string | null = null;
  try {
    const extracted = await extractDocument(opts.fileName, opts.bytes);
    extractedText = extracted.text || null;
    extractionNote = extracted.note ?? null;
  } catch (e) {
    extractionNote =
      "Could not read the document automatically: " +
      (e instanceof Error ? e.message : "unknown error");
  }

  const { data, error } = await admin
    .from("documents")
    .insert({
      organisation_id: opts.organisationId,
      owner_type: opts.ownerType,
      owner_id: opts.ownerId,
      file_name: opts.fileName,
      mime_type: opts.mimeType,
      byte_size: opts.bytes.byteLength,
      storage_path: path,
      extracted_text: extractedText,
      extraction_note: extractionNote,
      uploaded_by: opts.uploadedBy,
    })
    .select("id, file_name, mime_type, byte_size, extracted_text, extraction_note, created_at")
    .single();

  if (error) {
    await admin.storage.from(BUCKET).remove([path]);
    return { ok: false, error: error.message };
  }
  return { ok: true, document: data as StoredDocument };
}

// A short-lived signed URL to download the original file. The caller must
// already have confirmed the user may see the owning record.
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
