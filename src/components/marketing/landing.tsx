import Link from "next/link";
import { ChainRing, StageArc, Wordmark, LogoMark } from "@/components/bauhaus";

const CONTACT = "mailto:hello@vericlever.com.au";

export function Landing() {
  return (
    <div className="font-jost overflow-x-hidden bg-paper text-ink">
      {/* Header */}
      <header className="sticky top-0 z-20 border-b-[10px] border-ink bg-paper">
        <div className="mx-auto flex max-w-[1240px] flex-wrap items-center justify-between gap-x-[clamp(16px,3vw,40px)] gap-y-[14px] px-5 sm:px-10 py-[18px]">
          <Wordmark />
          <nav className="flex flex-wrap items-center gap-x-[clamp(14px,2vw,30px)] gap-y-3 text-[15px] sm:justify-end">
            <a href="#chain" className="text-ink hover:text-ink">
              How it works
            </a>
            <a href="#tiers" className="text-ink hover:text-ink">
              Policies &amp; procedures
            </a>
            <a href="#consultancy" className="text-ink hover:text-ink">
              Consultancy
            </a>
            <a href="#contact" className="text-ink hover:text-ink">
              Contact
            </a>
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

      {/* Hero */}
      <section className="mx-auto grid max-w-[1240px] items-center gap-16 border-b-4 border-ink px-5 sm:px-10 pb-12 sm:pb-24 pt-12 sm:pt-[88px] [grid-template-columns:repeat(auto-fit,minmax(min(100%,440px),1fr))]">
        <div className="flex flex-col gap-[26px]">
          <p className="text-[13px] font-semibold uppercase tracking-[0.24em] text-outcomes">
            For Australian ECEC providers
          </p>
          <h1 className="text-[clamp(38px,5.2vw,60px)] font-semibold leading-[1.03] tracking-[-0.025em] text-pretty">
            Policy, procedure, training and evidence &mdash; one unbroken chain.
          </h1>
          <p className="max-w-[520px] text-[19px] leading-relaxed text-ink-muted">
            VeriClever takes your service from policy to outcomes, tracking the
            work you do easily and systematically, making you inspection ready,
            every day.
          </p>
          <div className="flex flex-wrap gap-[14px] pt-1.5">
            <a
              href={CONTACT}
              className="bg-outcomes px-[26px] py-[15px] text-[16px] text-paper hover:bg-outcomes-hover hover:text-paper"
            >
              Book a walkthrough
            </a>
            <a
              href="#chain"
              className="border border-ink px-[26px] py-[15px] text-[16px] text-ink hover:bg-ink hover:text-paper"
            >
              See how it works
            </a>
          </div>
          <p className="font-plex-mono pt-2.5 text-[13px] text-ink-faint">
            Software built by the industry for the industry.
          </p>
        </div>
        <div className="flex justify-center">
          <ChainRing size={420} className="h-auto w-full max-w-[420px]" />
        </div>
      </section>

      {/* How it works */}
      <section
        id="chain"
        className="mx-auto flex max-w-[1240px] flex-col gap-11 border-b-4 border-ink px-5 sm:px-10 pb-12 sm:pb-[90px] pt-12 sm:pt-[84px]"
      >
        <div className="grid items-end gap-12 [grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),1fr))]">
          <h2 className="text-[30px] sm:text-[42px] font-semibold leading-[1.08] tracking-[-0.02em]">
            Four links. We hold them together for you.
          </h2>
          <p className="text-[17px] leading-[1.55] text-ink-muted">
            Each stage is drawn as part of the same ring: a quarter for policy, a
            half for procedure, three quarters for training, a closed ring when
            the evidence is held.
          </p>
        </div>
        <div className="grid gap-6 [grid-template-columns:repeat(auto-fit,minmax(min(100%,290px),1fr))]">
          <StageCard
            stage="policy"
            index="01"
            title="The obligation"
            body="Regulator-facing and parent-facing. Versioned, approved, and sitting behind every procedure that serves it."
          />
          <StageCard
            stage="procedure"
            index="02"
            title="The practice"
            body="Short, room-level procedures written the way staff work. Each one linked to the policy it carries."
          />
          <StageCard
            stage="training"
            index="03"
            title="The knowledge"
            body="Not a tick box. Staff read, answer, and sign off — so you know the practice is understood, not just acknowledged."
          />
          <StageCard
            stage="outcomes"
            index="04"
            title="The evidence"
            body="Who read what, when, and what changed since. Ready for an A&R visit without a scramble."
          />
        </div>
      </section>

      {/* Two tiers */}
      <section
        id="tiers"
        className="mx-auto grid max-w-[1240px] items-center gap-16 border-b-4 border-ink px-5 sm:px-10 pb-12 sm:pb-[90px] pt-12 sm:pt-[84px] [grid-template-columns:repeat(auto-fit,minmax(min(100%,440px),1fr))]"
      >
        <div className="flex flex-col gap-[22px]">
          <p className="text-[13px] font-semibold uppercase tracking-[0.24em] text-outcomes">
            Two tiers, on purpose
          </p>
          <h2 className="text-[28px] sm:text-[40px] font-semibold leading-[1.08] tracking-[-0.02em]">
            Policies carry the obligation. Procedures carry the work.
          </h2>
          <p className="text-[17px] leading-[1.55] text-ink-muted">
            Most systems flatten the two into one document set, then ask
            educators to read twelve pages of regulatory language to find the
            three steps that apply to them. VeriClever keeps policy behind the
            scenes where it belongs and puts a short procedure in front of staff
            — with the link between them held by the system, not by memory.
          </p>
          <ul className="flex flex-col gap-3">
            {[
              "Change a policy and every procedure it touches is flagged for review.",
              "Re-issue a procedure and sign-off resets only for the staff it affects.",
              "Every sign-off traces back to a clause you can point at.",
            ].map((t) => (
              <li key={t} className="flex items-baseline gap-3 text-[16px]">
                <span className="font-plex-mono text-[13px] text-outcomes">
                  &mdash;
                </span>
                {t}
              </li>
            ))}
          </ul>
        </div>
        <div className="flex flex-col gap-[22px] border-2 border-ink p-6 sm:p-[34px]">
          <div className="flex flex-wrap items-baseline justify-between gap-4">
            <span className="text-[22px] font-semibold">Emergency evacuation</span>
            <span className="text-[12px] font-semibold tracking-[0.16em] text-ink-faint">
              Reg 97 &middot; NQS 2.2
            </span>
          </div>
          <div className="flex flex-col">
            <SpecimenRow
              stage="policy"
              title="Emergency & evacuation policy"
              meta="v4 · approved 12 Mar 2026"
              label="POLICY"
            />
            <SpecimenRow
              stage="procedure"
              title="Evacuation drill procedure"
              meta="6 steps · room-level · 2 min read"
              label="PROCEDURE"
            />
            <SpecimenRow
              stage="training"
              title="Read, understood, signed"
              meta="22 of 24 educators · 2 due this week"
              label="TRAINING"
            />
            <SpecimenRow
              stage="outcomes"
              title="Drill logged, evidence held"
              meta="last run 14 Aug 2026 · attendance attached"
              label="OUTCOME"
              last
            />
          </div>
        </div>
      </section>

      {/* Status table */}
      <section className="mx-auto flex max-w-[1240px] flex-col gap-9 border-b-4 border-ink px-5 sm:px-10 pb-12 sm:pb-[90px] pt-12 sm:pt-[84px]">
        <div className="grid items-end gap-12 [grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),1fr))]">
          <h2 className="text-[28px] sm:text-[40px] font-semibold leading-[1.08] tracking-[-0.02em]">
            The whole service, one screen.
          </h2>
          <p className="text-[17px] leading-[1.55] text-ink-muted">
            The same four marks run through the portal. A director can see which
            chains are closed and which are missing a link, without opening a
            single document.
          </p>
        </div>
        <div className="overflow-x-auto border-2 border-ink px-4 py-6 sm:px-8 sm:py-[30px]">
          <div className="grid min-w-[560px] items-center gap-4 border-b-4 border-ink pb-3.5 [grid-template-columns:minmax(220px,2fr)_repeat(4,84px)]">
            <div className="text-[12px] font-semibold uppercase tracking-[0.16em] text-ink-faint">
              Topic
            </div>
            {["Policy", "Procedure", "Training", "Evidence"].map((h) => (
              <div
                key={h}
                className="text-[12px] font-semibold tracking-[0.16em] text-ink-faint"
              >
                {h}
              </div>
            ))}
          </div>
          <StatusRow
            topic="Emergency evacuation"
            done={["policy", "procedure", "training", "outcomes"]}
          />
          <StatusRow
            topic="Nappy change & toileting"
            done={["policy", "procedure"]}
          />
          <StatusRow topic="Anaphylaxis response" done={["policy"]} last />
        </div>
      </section>

      {/* Consultancy */}
      <section id="consultancy" className="bg-ink text-paper">
        <div className="mx-auto grid max-w-[1240px] items-center gap-16 px-5 sm:px-10 pb-12 sm:pb-[90px] pt-12 sm:pt-[84px] [grid-template-columns:repeat(auto-fit,minmax(min(100%,440px),1fr))]">
          <div className="flex flex-col gap-[22px]">
            <p className="text-[13px] font-semibold uppercase tracking-[0.24em] text-outcomes-on-dark">
              Where software stops
            </p>
            <h2 className="text-[28px] sm:text-[40px] font-semibold leading-[1.08] tracking-[-0.02em] text-paper">
              Judgement is not a feature.
            </h2>
            <p className="text-[17px] leading-[1.55] text-[#C9C4B6]">
              A portal can tell you a procedure was signed. It cannot tell you
              whether the procedure was the right one for your service, your
              rooms and your team. VeriClever comes with people who have run
              services and sat through assessment — available when the decision
              needs a human.
            </p>
            <div className="flex flex-wrap gap-[14px] pt-1.5">
              <a
                href={CONTACT}
                className="bg-paper px-[26px] py-[15px] text-[16px] text-ink hover:bg-[#e6e2d6] hover:text-ink"
              >
                Talk to a consultant
              </a>
            </div>
          </div>
          <div className="flex justify-center">
            <svg
              viewBox="0 0 340 220"
              className="block w-full max-w-[400px]"
              aria-hidden="true"
            >
              <g fill="none" stroke="#6FBF8B" strokeWidth={5}>
                <path d="M 60 200 A 40 40 0 0 1 140 200" />
                <path d="M 44 200 A 56 56 0 0 1 156 200" />
                <path d="M 28 200 A 72 72 0 0 1 172 200" />
              </g>
              <g fill="none" stroke="#E4A73A" strokeWidth={5}>
                <path d="M 200 200 A 40 40 0 0 1 280 200" />
                <path d="M 184 200 A 56 56 0 0 1 296 200" />
                <path d="M 168 200 A 72 72 0 0 1 312 200" />
              </g>
              <line
                x1="10"
                y1="200"
                x2="330"
                y2="200"
                stroke="#FFFFFF"
                strokeWidth={1.5}
                opacity={0.4}
              />
            </svg>
          </div>
        </div>
      </section>

      {/* Contact */}
      <section
        id="contact"
        className="mx-auto grid max-w-[1240px] items-center gap-16 px-5 sm:px-10 pb-12 sm:pb-24 pt-12 sm:pt-[84px] [grid-template-columns:repeat(auto-fit,minmax(min(100%,440px),1fr))]"
      >
        <div className="flex flex-col gap-[22px]">
          <p className="text-[13px] font-semibold uppercase tracking-[0.24em] text-outcomes">
            See it on your own material
          </p>
          <h2 className="text-[28px] sm:text-[40px] font-semibold leading-[1.08] tracking-[-0.02em]">
            Thirty minutes, your own policies on screen, no slide deck.
          </h2>
          <p className="text-[17px] leading-[1.55] text-ink-muted">
            Bring one policy and the procedures that sit under it. We&apos;ll
            build the chain in front of you and you can judge whether it holds up
            in your service.
          </p>
          <div className="flex flex-wrap gap-[14px] pt-1.5">
            <a
              href={CONTACT}
              className="bg-outcomes px-[26px] py-[15px] text-[16px] text-paper hover:bg-outcomes-hover hover:text-paper"
            >
              Book a walkthrough
            </a>
            <a
              href={CONTACT}
              className="border border-ink px-[26px] py-[15px] text-[16px] text-ink hover:bg-ink hover:text-paper"
            >
              Send a question
            </a>
          </div>
        </div>
        <div className="flex justify-center">
          <svg
            viewBox="0 0 340 240"
            className="block w-full max-w-[400px]"
            aria-hidden="true"
          >
            <g fill="none" strokeWidth={6}>
              <path d="M 320 220 A 150 150 0 0 0 170 70" stroke="#1F51A8" />
              <path d="M 296 220 A 126 126 0 0 0 170 94" stroke="#1F51A8" />
              <path d="M 272 220 A 102 102 0 0 0 170 118" stroke="#1F51A8" />
              <path d="M 170 70 A 150 150 0 0 0 20 220" stroke="#1B7A3E" />
              <path d="M 170 94 A 126 126 0 0 0 44 220" stroke="#1B7A3E" />
              <path d="M 170 118 A 102 102 0 0 0 68 220" stroke="#1B7A3E" />
            </g>
            <line
              x1="10"
              y1="220"
              x2="330"
              y2="220"
              stroke="#1A1A17"
              strokeWidth={1.5}
              opacity={0.3}
            />
          </svg>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t-4 border-ink">
        <div className="mx-auto flex max-w-[1240px] flex-wrap items-center justify-between gap-6 p-10">
          <div className="flex items-center gap-3">
            <LogoMark size={24} />
            <span className="font-plex-mono text-[12px] font-semibold tracking-[0.16em] text-ink-faint">
              vericlever.com.au &middot; Victoria, Australia
            </span>
          </div>
          <div className="flex flex-wrap gap-6 text-[14px]">
            <a href="#chain" className="text-ink-muted hover:text-ink">
              How it works
            </a>
            <a href="#consultancy" className="text-ink-muted hover:text-ink">
              Consultancy
            </a>
            <a href="#contact" className="text-ink-muted hover:text-ink">
              Contact
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}

function StageCard({
  stage,
  index,
  title,
  body,
}: {
  stage: "policy" | "procedure" | "training" | "outcomes";
  index: string;
  title: string;
  body: string;
}) {
  const top = {
    policy: "border-t-policy",
    procedure: "border-t-procedure",
    training: "border-t-training",
    outcomes: "border-t-outcomes",
  }[stage];
  return (
    <div
      className={`flex flex-col gap-[18px] border-2 border-ink border-t-[10px] ${top} bg-paper p-7`}
    >
      <StageArc stage={stage} size={64} />
      <div className="text-[12px] font-semibold tracking-[0.2em] text-ink-faint">
        {index} / {stage.toUpperCase()}
      </div>
      <div className="text-[21px] font-semibold">{title}</div>
      <div className="text-[15px] leading-[1.5] text-ink-muted">{body}</div>
    </div>
  );
}

function SpecimenRow({
  stage,
  title,
  meta,
  label,
  last = false,
}: {
  stage: "policy" | "procedure" | "training" | "outcomes";
  title: string;
  meta: string;
  label: string;
  last?: boolean;
}) {
  const color = {
    policy: "text-policy",
    procedure: "text-procedure-text",
    training: "text-training",
    outcomes: "text-outcomes",
  }[stage];
  return (
    <div
      className={`flex items-center gap-4 border-t border-ink/[0.12] py-4 ${
        last ? "border-b border-ink/[0.12]" : ""
      }`}
    >
      <StageArc stage={stage} size={28} strokeWidth={7} />
      <div className="min-w-0 flex-1">
        <div className="text-[16px] font-medium">{title}</div>
        <div className="text-[14px] text-ink-faint">{meta}</div>
      </div>
      <div
        className={`text-[12px] font-semibold tracking-[0.16em] ${color}`}
      >
        {label}
      </div>
    </div>
  );
}

const ALL_STAGES = ["policy", "procedure", "training", "outcomes"] as const;

function StatusRow({
  topic,
  done,
  last = false,
}: {
  topic: string;
  done: readonly ("policy" | "procedure" | "training" | "outcomes")[];
  last?: boolean;
}) {
  return (
    <div
      className={`grid min-w-[560px] items-center gap-4 py-4 [grid-template-columns:minmax(220px,2fr)_repeat(4,84px)] ${
        last ? "" : "border-b border-ink/10"
      }`}
    >
      <div className="text-[16px]">{topic}</div>
      {ALL_STAGES.map((s) => (
        <StageArc
          key={s}
          stage={s}
          size={26}
          strokeWidth={8}
          muted={!done.includes(s)}
        />
      ))}
    </div>
  );
}
