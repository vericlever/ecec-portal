import { storeDocument } from "@/lib/documents/store";

// Step 57, A4. Decodes the signature pad's data URL, sanity-checks it's a
// real, reasonably-sized PNG (not an empty canvas or something a modified
// client sent instead), and stores it the same way any other document is
// stored - never text-extracted, since it holds nothing to extract.
const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const MIN_BYTES = 1024; // 1 KB
const MAX_BYTES = 300 * 1024; // 300 KB
const MAX_DIMENSION = 2000; // px, generous - the pad itself exports at most 600x200

export type StoreSignatureResult =
  | { ok: true; documentId: string }
  | { ok: false; error: string };

export async function storeSignature(opts: {
  dataUrl: string;
  organisationId: string;
  contractId: string;
  uploadedBy: string;
}): Promise<StoreSignatureResult> {
  const match = /^data:image\/png;base64,(.+)$/.exec(opts.dataUrl);
  if (!match) return { ok: false, error: "That doesn't look like a signature." };

  const bytes = Uint8Array.from(Buffer.from(match[1], "base64"));
  if (bytes.length < MIN_BYTES || bytes.length > MAX_BYTES) {
    return { ok: false, error: "The signature image is an unexpected size. Try signing again." };
  }
  if (!PNG_MAGIC.every((b, i) => bytes[i] === b)) {
    return { ok: false, error: "That doesn't look like a signature." };
  }

  // PNG IHDR chunk: width and height are the first two 4-byte big-endian
  // fields after the 8-byte signature + 4-byte length + 4-byte "IHDR" tag.
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const width = view.getUint32(16);
  const height = view.getUint32(20);
  if (width === 0 || height === 0 || width > MAX_DIMENSION || height > MAX_DIMENSION) {
    return { ok: false, error: "The signature image is an unexpected size. Try signing again." };
  }

  const stored = await storeDocument({
    organisationId: opts.organisationId,
    ownerType: "signature",
    ownerId: opts.contractId,
    fileName: `signature-${Date.now()}.png`,
    mimeType: "image/png",
    bytes,
    uploadedBy: opts.uploadedBy,
    extract: false,
  });
  if (!stored.ok) return { ok: false, error: stored.error };
  return { ok: true, documentId: stored.document.id };
}
