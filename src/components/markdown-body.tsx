"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

// Step 56: the canonical body/published_body text is Markdown for every
// source format (docx, html, pdf) - this is the one place that turns it
// into something a reader sees, styled to match the portal's existing
// slate/Tailwind look rather than each document carrying its own source
// formatting. Deliberately client-side (a plain "use client" component, no
// server pre-rendering to HTML) so the stored value stays Markdown source of
// truth and rendering is just a display step, not a second copy to keep in
// sync.
export function MarkdownBody({ text }: { text: string }) {
  return (
    <div className="text-[15px] leading-relaxed text-slate-800">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => (
            <h1 className="mb-2 mt-5 text-lg font-semibold text-slate-900 first:mt-0">
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 className="mb-2 mt-5 text-base font-semibold text-slate-900 first:mt-0">
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="mb-1.5 mt-4 text-sm font-semibold text-slate-800 first:mt-0">
              {children}
            </h3>
          ),
          h4: ({ children }) => (
            <h4 className="mb-1.5 mt-3 text-sm font-semibold text-slate-700 first:mt-0">
              {children}
            </h4>
          ),
          p: ({ children }) => (
            <p className="mb-3 leading-relaxed last:mb-0">{children}</p>
          ),
          ul: ({ children }) => (
            <ul className="mb-3 list-disc space-y-1 pl-5 last:mb-0">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="mb-3 list-decimal space-y-1 pl-5 last:mb-0">{children}</ol>
          ),
          li: ({ children }) => <li>{children}</li>,
          strong: ({ children }) => (
            <strong className="font-semibold">{children}</strong>
          ),
          em: ({ children }) => <em className="italic">{children}</em>,
          a: ({ children, href }) => (
            <a href={href} className="text-slate-700 underline hover:text-slate-900">
              {children}
            </a>
          ),
          hr: () => <hr className="my-4 border-slate-200" />,
          blockquote: ({ children }) => (
            <blockquote className="mb-3 border-l-2 border-slate-300 pl-3 text-slate-600 last:mb-0">
              {children}
            </blockquote>
          ),
          code: ({ children }) => (
            <code className="rounded bg-slate-100 px-1 py-0.5 font-mono text-[13px]">
              {children}
            </code>
          ),
          pre: ({ children }) => (
            <pre className="mb-3 overflow-x-auto rounded-md bg-slate-50 p-3 font-mono text-[13px] last:mb-0">
              {children}
            </pre>
          ),
          table: ({ children }) => (
            <div className="mb-3 overflow-x-auto last:mb-0">
              <table className="w-full min-w-[420px] border-collapse text-sm">
                {children}
              </table>
            </div>
          ),
          thead: ({ children }) => <thead className="bg-slate-50">{children}</thead>,
          th: ({ children }) => (
            <th className="border border-slate-200 px-3 py-1.5 text-left align-top font-semibold text-slate-700">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="border border-slate-200 px-3 py-1.5 align-top">{children}</td>
          ),
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}
