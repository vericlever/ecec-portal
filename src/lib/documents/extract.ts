import { readZip } from "@/lib/zip-read";

// General-purpose "document -> plain text" step. Format is dispatched by
// extension; adding a new one (.odt, .rtf, OCR for scanned PDFs) is one more
// branch here and nothing else changes.

export type Extracted = {
  text: string;
  format: string;
  note?: string;
  pages?: number;
};

function decodeXmlEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, "&");
}

function docxToText(bytes: Uint8Array): string {
  const files = readZip(bytes);
  const xmlBytes = files.get("word/document.xml");
  if (!xmlBytes) return "";
  const xml = new TextDecoder().decode(xmlBytes);

  // Each <w:p> is a paragraph; <w:t> holds the text runs; <w:tab/> a tab.
  const paras = xml.split(/<w:p(?:\s[^>]*)?>/).slice(1);
  const lines = paras.map((chunk) => {
    const body = chunk.split("</w:p>")[0].replace(/<w:tab\/?>/g, "\t");
    const runs = [...body.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)];
    return runs.map((m) => decodeXmlEntities(m[1])).join("");
  });

  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function htmlToText(html: string): string {
  return decodeXmlEntities(
    html
      .replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")
      .replace(/<\/(p|div|h[1-6]|li|tr|br)>/gi, "\n")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, ""),
  )
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function pdfToText(
  bytes: Uint8Array,
): Promise<{ text: string; pages: number }> {
  const { extractText } = await import("unpdf");
  const { totalPages, text } = await extractText(bytes, { mergePages: true });
  return { text: (text ?? "").trim(), pages: totalPages ?? 0 };
}

export async function extractDocument(
  fileName: string,
  bytes: Uint8Array,
): Promise<Extracted> {
  const ext = fileName.toLowerCase().split(".").pop() ?? "";

  if (ext === "docx") {
    const text = docxToText(bytes);
    return {
      text,
      format: "docx",
      note: text ? undefined : "No readable text found in the document.",
    };
  }

  if (ext === "pdf") {
    const { text, pages } = await pdfToText(bytes);
    return {
      text,
      pages,
      format: "pdf",
      note:
        text.length < 20
          ? "This PDF has little or no selectable text - it may be a scan. Paste or type the text if it is needed on screen."
          : undefined,
    };
  }

  if (ext === "txt" || ext === "md" || ext === "markdown") {
    return { text: new TextDecoder().decode(bytes).trim(), format: ext };
  }

  if (ext === "html" || ext === "htm") {
    return { text: htmlToText(new TextDecoder().decode(bytes)), format: "html" };
  }

  if (ext === "doc") {
    return {
      text: "",
      format: "doc",
      note: "Old .doc format cannot be read. Save it as .docx, or paste the text.",
    };
  }

  return {
    text: "",
    format: ext || "unknown",
    note: `.${ext || "?"} files cannot be read automatically yet. Paste the text.`,
  };
}
