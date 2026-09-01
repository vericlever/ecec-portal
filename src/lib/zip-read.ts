import { inflateRawSync } from "node:zlib";

// Minimal ZIP reader: enough to pull named entries out of an Office Open XML
// container (.docx now, .odt / .xlsx later). Reads the central directory, which
// is the authoritative index, and inflates deflate-compressed entries.

function u16(b: Uint8Array, o: number): number {
  return b[o] | (b[o + 1] << 8);
}
function u32(b: Uint8Array, o: number): number {
  return (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;
}

function findEndOfCentralDirectory(buf: Uint8Array): number {
  const sig = 0x06054b50;
  const min = Math.max(0, buf.length - 22 - 0xffff);
  for (let i = buf.length - 22; i >= min; i--) {
    if (u32(buf, i) === sig) return i;
  }
  return -1;
}

export function readZip(buf: Uint8Array): Map<string, Uint8Array> {
  const eocd = findEndOfCentralDirectory(buf);
  if (eocd < 0) throw new Error("Not a ZIP archive.");

  const count = u16(buf, eocd + 10);
  let p = u32(buf, eocd + 16);
  const out = new Map<string, Uint8Array>();
  const dec = new TextDecoder();

  for (let i = 0; i < count; i++) {
    if (u32(buf, p) !== 0x02014b50) break; // central directory header signature
    const method = u16(buf, p + 10);
    const compSize = u32(buf, p + 20);
    const nameLen = u16(buf, p + 28);
    const extraLen = u16(buf, p + 30);
    const commentLen = u16(buf, p + 32);
    const localHeaderOffset = u32(buf, p + 42);
    const name = dec.decode(buf.subarray(p + 46, p + 46 + nameLen));

    // The local header repeats name/extra lengths; the data follows them.
    const lhNameLen = u16(buf, localHeaderOffset + 26);
    const lhExtraLen = u16(buf, localHeaderOffset + 28);
    const dataStart = localHeaderOffset + 30 + lhNameLen + lhExtraLen;
    const comp = buf.subarray(dataStart, dataStart + compSize);

    let data: Uint8Array;
    if (method === 0) data = comp;
    else if (method === 8) data = new Uint8Array(inflateRawSync(comp));
    else data = new Uint8Array(0);
    out.set(name, data);

    p += 46 + nameLen + extraLen + commentLen;
  }

  return out;
}
