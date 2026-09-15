import { Fragment, type ReactNode } from "react";

// Minimal **bold** / *italic* renderer for static marketing copy authored as
// markdown strings. Not a general parser - just enough for the FAQ content's
// emphasis, so the source text can be transcribed as written rather than
// hand-converted to JSX line by line.
export function renderInline(text: string): ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g).filter(Boolean);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith("*") && part.endsWith("*")) {
      return <em key={i}>{part.slice(1, -1)}</em>;
    }
    return <Fragment key={i}>{part}</Fragment>;
  });
}

// Plain-text form of the same markdown, for the JSON-LD schema (which needs a
// string, not JSX) - derived from the same source strings as the visible
// copy so the two can't drift apart.
export function stripMd(text: string): string {
  return text.replace(/\*\*([^*]+)\*\*/g, "$1").replace(/\*([^*]+)\*/g, "$1");
}
