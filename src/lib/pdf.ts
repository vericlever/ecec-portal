import { renderToBuffer } from "@react-pdf/renderer";
import type { ReactElement } from "react";

// Renders a react-pdf <Document> to bytes and wraps it as a download
// response: Content-Disposition: attachment, binary body. The client always
// fetches this, makes a blob, and clicks a hidden anchor - never a new tab.
export async function pdfResponse(
  doc: ReactElement,
  filename: string,
): Promise<Response> {
  const buffer = await renderToBuffer(doc);
  const body = new Uint8Array(buffer);
  return new Response(body, {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="${safeFilename(filename)}"`,
    },
  });
}

function safeFilename(name: string): string {
  return name.replace(/[^A-Za-z0-9._ -]+/g, "_");
}
