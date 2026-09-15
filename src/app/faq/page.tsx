import type { Metadata } from "next";
import { ArchMotif, type ArchColour } from "@/components/bauhaus";
import { SiteHeader, SiteFooter } from "@/components/marketing/site-chrome";
import { renderInline, stripMd } from "@/lib/inline-md";
import {
  FAQ_ENTRIES,
  CLOSING_NOTE,
  REVIEWED,
  REVIEWED_ISO,
  NEXT_REVIEW,
  type FaqBlock,
  type FaqEntry,
} from "./faq-data";

export const metadata: Metadata = {
  title: "Policies and procedures under the NQF: FAQs | Vericlever",
  description:
    "Answers to the operational questions the National Quality Framework regulations don't settle: policy vs procedure, Regulation 170 and 172, mandatory categories, sign-off evidence, and Victorian notification pathways.",
};

const COLOUR_CLASSES: Record<ArchColour, { border: string; text: string }> = {
  blue: { border: "border-policy", text: "text-policy" },
  amber: { border: "border-procedure", text: "text-procedure-text" },
  vermilion: { border: "border-training", text: "text-training" },
  green: { border: "border-outcomes", text: "text-outcomes" },
};

function flattenAnswer(entry: FaqEntry): string {
  return entry.body
    .map((b) => (b.t === "list" ? b.items.map(stripMd).join(" ") : stripMd(b.md)))
    .join(" ");
}

function Blocks({ blocks, colour }: { blocks: FaqBlock[]; colour: ArchColour }) {
  const c = COLOUR_CLASSES[colour];
  return (
    <>
      {blocks.map((b, i) => {
        if (b.t === "p") {
          return (
            <p key={i} className="mt-4 text-[17px] leading-[1.6] text-ink-muted first:mt-0">
              {renderInline(b.md)}
            </p>
          );
        }
        if (b.t === "list") {
          return b.ordered ? (
            <ol
              key={i}
              className="mt-4 flex list-decimal flex-col gap-2 pl-5 text-[16px] leading-[1.55] text-ink-muted"
            >
              {b.items.map((item, j) => (
                <li key={j}>{renderInline(item)}</li>
              ))}
            </ol>
          ) : (
            <ul
              key={i}
              className="mt-4 flex list-disc flex-col gap-2 pl-5 text-[16px] leading-[1.55] text-ink-muted"
            >
              {b.items.map((item, j) => (
                <li key={j}>{renderInline(item)}</li>
              ))}
            </ul>
          );
        }
        if (b.t === "callout") {
          return (
            <div key={i} className={`mt-5 border-l-[6px] ${c.border} bg-ink/[0.03] py-3.5 pl-5 pr-4`}>
              <div className={`text-[12px] font-semibold uppercase tracking-[0.16em] ${c.text}`}>
                {b.label}
              </div>
              <p className="mt-1.5 text-[16px] leading-[1.6] text-ink-muted">{renderInline(b.md)}</p>
            </div>
          );
        }
        return (
          <p key={i} className="mt-4 text-[14px] italic leading-[1.5] text-ink-faint">
            {renderInline(b.md)}
          </p>
        );
      })}
    </>
  );
}

export default function FaqPage() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    dateModified: REVIEWED_ISO,
    mainEntity: FAQ_ENTRIES.map((entry) => ({
      "@type": "Question",
      name: entry.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: flattenAnswer(entry),
      },
    })),
  };

  return (
    <div className="font-jost overflow-x-hidden bg-paper text-ink">
      {/* eslint-disable-next-line react/no-danger -- static, non-user-controlled schema data */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <SiteHeader />

      {/* Page header */}
      <section className="mx-auto flex max-w-[1240px] flex-col gap-5 border-b-4 border-ink px-5 pb-9 pt-12 sm:px-10 sm:pb-8 sm:pt-[72px]">
        <p className="text-[13px] font-semibold uppercase tracking-[0.24em] text-outcomes">
          FAQs
        </p>
        <h1 className="max-w-[880px] text-[clamp(30px,4.2vw,46px)] font-semibold leading-[1.08] tracking-[-0.02em] text-pretty">
          Policies and procedures under the National Quality Framework
        </h1>
        <p className="max-w-[700px] text-[17px] leading-[1.55] text-ink-muted">
          Answers to the operational questions that the regulations themselves
          do not settle. Written for approved providers, nominated
          supervisors and centre directors in Australia.
        </p>
        <p className="font-plex-mono text-[13px] text-ink-faint">
          Reviewed {REVIEWED} &middot; Next review {NEXT_REVIEW} &middot;{" "}
          {FAQ_ENTRIES.length} FAQs
        </p>
      </section>

      {/* Index + answers */}
      <section className="mx-auto flex max-w-[1240px] flex-col gap-10 px-5 py-12 sm:flex-row sm:gap-0 sm:px-10 sm:py-[84px]">
        <nav
          aria-label="On this page"
          className="shrink-0 sm:w-[260px] sm:border-r-4 sm:border-ink sm:pr-8"
        >
          <div className="sm:sticky sm:top-[110px]">
            <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-ink-faint">
              On this page
            </p>
            <ol className="mt-4 flex flex-col gap-2.5 text-[14px] leading-[1.4]">
              {FAQ_ENTRIES.map((entry, i) => (
                <li key={entry.id}>
                  <a
                    href={`#${entry.id}`}
                    className="text-ink-muted hover:text-ink"
                  >
                    {i + 1}. {entry.question}
                  </a>
                </li>
              ))}
            </ol>
          </div>
        </nav>

        <div className="flex min-w-0 flex-1 flex-col sm:max-w-[780px] sm:pl-14">
          {FAQ_ENTRIES.map((entry, i) => (
            <div
              key={entry.id}
              id={entry.id}
              className={`scroll-mt-[100px] py-9 first:pt-0 ${
                i > 0 ? "border-t-2 border-ink/90" : ""
              }`}
            >
              <ArchMotif colour={entry.colour} size={72} />
              <h2 className="mt-3 text-[26px] font-semibold leading-[1.15] tracking-[-0.015em]">
                {entry.question}
              </h2>
              <Blocks blocks={entry.body} colour={entry.colour} />
            </div>
          ))}

          <p className="mt-10 border-t-2 border-ink/90 pt-8 text-[14px] italic leading-[1.55] text-ink-faint">
            {CLOSING_NOTE}
          </p>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}
