// Step 56: "document -> plain text" became "document -> Markdown". Every
// format below converges on Markdown as the canonical body text rather than
// flattened plain text, specifically so a two-column table (a metadata
// block, a code-and-description reference table) keeps its row pairing
// instead of becoming unrelated adjacent lines - the failure the plain-text
// extractor it replaced always had, regardless of which tenant's template
// produced the table. Format is still dispatched by extension; adding a new
// one is still one more branch here and nothing else changes.
//
// `needsReview` marks a document whose conversion confidence is genuinely
// lower than "just trust it": every PDF (heuristic layout guessing, never a
// certainty - see pdf-markdown.ts), and any docx/html whose grouping-row
// heuristic hit a table row that looked heading-like but didn't cleanly
// match the shape (see markdown.ts's promoteGroupingRows). It is advisory
// only - see src/lib/documents/store.ts and the bulk-upload actions for how
// it flows through without ever blocking an upload.

import { htmlToMarkdown, promoteGroupingRows } from "@/lib/documents/markdown";
import { pdfToMarkdown } from "@/lib/documents/pdf-markdown";

export type Extracted = {
  text: string;
  format: string;
  note?: string;
  pages?: number;
  needsReview: boolean;
};

async function docxToMarkdown(
  bytes: Uint8Array,
): Promise<{ markdown: string; needsReview: boolean; warningNote?: string }> {
  const mammoth = await import("mammoth");
  const { value: html, messages } = await mammoth.convertToHtml(
    { buffer: Buffer.from(bytes) },
    {
      // Mammoth's own defaults map Word's "Heading 1".."Heading 6" styles to
      // h1..h6, but not "Title"/"Subtitle" - confirmed by testing a real
      // generated docx, not assumed - so a document titled via Word's Title
      // style (a common way to set a document's name) would otherwise stay
      // a plain paragraph instead of becoming a heading.
      styleMap: [
        "p[style-name='Title'] => h1:fresh",
        "p[style-name='Subtitle'] => h2:fresh",
      ],
    },
  );
  const raw = htmlToMarkdown(html);
  const { markdown, ambiguousCount } = promoteGroupingRows(raw);
  const warnings = messages.filter((m) => m.type === "warning" || m.type === "error");
  return {
    markdown,
    needsReview: ambiguousCount > 0,
    warningNote:
      ambiguousCount > 0
        ? `${ambiguousCount} table row${ambiguousCount === 1 ? "" : "s"} looked like a section heading but didn't clearly match the shape - please check the converted text.`
        : warnings.length > 0
          ? warnings[0].message
          : undefined,
  };
}

export async function extractDocument(
  fileName: string,
  bytes: Uint8Array,
): Promise<Extracted> {
  const ext = fileName.toLowerCase().split(".").pop() ?? "";

  if (ext === "docx") {
    try {
      const { markdown, needsReview, warningNote } = await docxToMarkdown(bytes);
      return {
        text: markdown,
        format: "docx",
        needsReview,
        note: markdown.trim() ? warningNote : "No readable text found in the document.",
      };
    } catch (e) {
      return {
        text: "",
        format: "docx",
        needsReview: true,
        note:
          "Could not convert this .docx automatically: " +
          (e instanceof Error ? e.message : "unknown error"),
      };
    }
  }

  if (ext === "pdf") {
    try {
      const { markdown, pages } = await pdfToMarkdown(bytes);
      return {
        text: markdown,
        pages,
        format: "pdf",
        // Always flagged - a PDF's structure is inferred from font size and
        // position, never read from a real document model the way docx's
        // is, so every one of these is a best-effort guess by design, not
        // just on the rare page that looks ambiguous.
        needsReview: true,
        note:
          markdown.length < 20
            ? "This PDF has little or no selectable text - it may be a scan. Paste or type the text if it is needed on screen."
            : "Converted from PDF automatically - headings and tables are a best-effort guess from the page layout. Please check they look right.",
      };
    } catch (e) {
      return {
        text: "",
        format: "pdf",
        needsReview: true,
        note:
          "Could not convert this PDF automatically: " +
          (e instanceof Error ? e.message : "unknown error"),
      };
    }
  }

  if (ext === "txt" || ext === "md" || ext === "markdown") {
    return {
      text: new TextDecoder().decode(bytes).trim(),
      format: ext,
      needsReview: false,
    };
  }

  if (ext === "html" || ext === "htm") {
    const raw = htmlToMarkdown(new TextDecoder().decode(bytes));
    const { markdown, ambiguousCount } = promoteGroupingRows(raw);
    return {
      text: markdown,
      format: "html",
      needsReview: ambiguousCount > 0,
      note:
        ambiguousCount > 0
          ? `${ambiguousCount} table row${ambiguousCount === 1 ? "" : "s"} looked like a section heading but didn't clearly match the shape - please check the converted text.`
          : undefined,
    };
  }

  if (ext === "doc") {
    return {
      text: "",
      format: "doc",
      needsReview: false,
      note: "Old .doc format cannot be read. Save it as .docx, or paste the text.",
    };
  }

  return {
    text: "",
    format: ext || "unknown",
    needsReview: false,
    note: `.${ext || "?"} files cannot be read automatically yet. Paste the text.`,
  };
}
