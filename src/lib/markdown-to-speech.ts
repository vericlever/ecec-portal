// ReadAloud (src/app/sops/[sopId]/read-aloud.tsx) speaks the SOP body via the
// Web Speech API. Since Step 56 that body is Markdown, not plain text - fed
// straight in, a table would be read as literal pipe characters and a
// heading would be read with its "#" marks. This strips GFM syntax down to
// something that reads as plain speech, not a faithful re-render (that's
// MarkdownBody's job) - a table becomes its cells read out comma-separated,
// which is the best a linear voice can do with two-dimensional data anyway.
export function markdownToSpeechText(markdown: string): string {
  return markdown
    .replace(/^\|?(\s*:?-+:?\s*\|)+\s*$/gm, "") // table separator rows
    .replace(/^\|(.+)\|\s*$/gm, (_, inner: string) =>
      inner
        .split("|")
        .map((c) => c.trim())
        .filter(Boolean)
        .join(", "),
    )
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/__(.+?)__/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/_(.+?)_/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/^[-*+]\s+/gm, "")
    .replace(/^\d+\.\s+/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
