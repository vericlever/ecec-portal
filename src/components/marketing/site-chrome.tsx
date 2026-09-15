import Link from "next/link";
import { LogoMark, Wordmark } from "@/components/bauhaus";

const CONTACT = "mailto:info@vericlever.com.au";

// Header and footer for every public marketing page (landing, FAQ, and any
// future public page). Kept as one component so the two never drift apart -
// the design handoff is explicit that this header must not change between
// pages. Anchors point back to the landing page ("/#chain" etc.) rather than
// bare "#chain" so they work correctly from a page other than "/".
export function SiteHeader() {
  return (
    <header className="sticky top-0 z-20 border-b-[10px] border-ink bg-paper">
      <div className="mx-auto flex max-w-[1240px] flex-wrap items-center justify-between gap-x-[clamp(16px,3vw,40px)] gap-y-[14px] px-5 sm:px-10 py-[18px]">
        <Link href="/" className="block">
          <Wordmark />
        </Link>
        <nav className="flex flex-wrap items-center gap-x-[clamp(14px,2vw,30px)] gap-y-3 text-[15px] sm:justify-end">
          <Link href="/#chain" className="text-ink hover:text-ink">
            How it works
          </Link>
          <Link href="/#tiers" className="text-ink hover:text-ink">
            Policies &amp; procedures
          </Link>
          <Link href="/faq" className="text-ink hover:text-ink">
            FAQs
          </Link>
          <Link href="/#contact" className="text-ink hover:text-ink">
            Contact
          </Link>
          <Link
            href="/login"
            className="border-l border-ink/20 pl-[30px] text-ink hover:text-ink"
          >
            Sign in
          </Link>
          <a
            href={CONTACT}
            className="bg-outcomes px-5 py-[11px] text-paper hover:bg-outcomes-hover hover:text-paper"
          >
            Book a walkthrough
          </a>
        </nav>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t-4 border-ink">
      <div className="mx-auto flex max-w-[1240px] flex-wrap items-center justify-between gap-6 p-10">
        <div className="flex items-center gap-3">
          <LogoMark size={24} />
          <span className="font-plex-mono text-[12px] font-semibold tracking-[0.16em] text-ink-faint">
            vericlever.com.au &middot; Victoria, Australia
          </span>
        </div>
        <div className="flex flex-wrap gap-6 text-[14px]">
          <Link href="/#chain" className="text-ink-muted hover:text-ink">
            How it works
          </Link>
          <Link href="/faq" className="text-ink-muted hover:text-ink">
            FAQs
          </Link>
          <Link href="/#contact" className="text-ink-muted hover:text-ink">
            Contact
          </Link>
        </div>
      </div>
    </footer>
  );
}
