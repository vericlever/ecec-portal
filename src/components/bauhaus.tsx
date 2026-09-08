// Bauhaus marks for the public site. Every graphic is inline SVG built from
// circles and arcs - no bitmaps. The chain motif: policy -> procedure ->
// training -> outcomes is one ring drawn at four degrees of completion.

const STAGE_COLOR = {
  policy: "#1F51A8",
  procedure: "#C98A0E",
  training: "#C8451F",
  outcomes: "#1B7A3E",
} as const;

export type Stage = keyof typeof STAGE_COLOR;

// The full four-quadrant ring: three concentric circles split into blue
// (top-right), amber (bottom-right), vermilion (bottom-left), green (top-left),
// with a centre disc split the same way.
export function ChainRing({
  size = 340,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 340 340"
      width={size}
      height={size}
      className={className}
      aria-hidden="true"
    >
      <g fill="none" strokeWidth={8}>
        <path d="M 320 170 A 150 150 0 0 0 170 20" stroke="#1F51A8" />
        <path d="M 170 320 A 150 150 0 0 0 320 170" stroke="#C98A0E" />
        <path d="M 20 170 A 150 150 0 0 0 170 320" stroke="#C8451F" />
        <path d="M 170 20 A 150 150 0 0 0 20 170" stroke="#1B7A3E" />
        <path d="M 296 170 A 126 126 0 0 0 170 44" stroke="#1F51A8" />
        <path d="M 170 296 A 126 126 0 0 0 296 170" stroke="#C98A0E" />
        <path d="M 44 170 A 126 126 0 0 0 170 296" stroke="#C8451F" />
        <path d="M 170 44 A 126 126 0 0 0 44 170" stroke="#1B7A3E" />
        <path d="M 272 170 A 102 102 0 0 0 170 68" stroke="#1F51A8" />
        <path d="M 170 272 A 102 102 0 0 0 272 170" stroke="#C98A0E" />
        <path d="M 68 170 A 102 102 0 0 0 170 272" stroke="#C8451F" />
        <path d="M 170 68 A 102 102 0 0 0 68 170" stroke="#1B7A3E" />
      </g>
      <g stroke="none">
        <path d="M 170 170 L 186 170 A 16 16 0 0 0 170 154 Z" fill="#1F51A8" />
        <path d="M 170 170 L 170 186 A 16 16 0 0 0 186 170 Z" fill="#C98A0E" />
        <path d="M 170 170 L 154 170 A 16 16 0 0 0 170 186 Z" fill="#C8451F" />
        <path d="M 170 170 L 170 154 A 16 16 0 0 0 154 170 Z" fill="#1B7A3E" />
      </g>
    </svg>
  );
}

// A single stage glyph: a quarter arc for policy, a half for procedure, three
// quarters for training, a closed ring for outcomes. `muted` draws the same
// geometry faded, for a chain link that is not done yet.
export function StageArc({
  stage,
  size = 64,
  muted = false,
  strokeWidth = 6,
}: {
  stage: Stage;
  size?: number;
  muted?: boolean;
  strokeWidth?: number;
}) {
  const stroke = muted ? "#1A1A17" : STAGE_COLOR[stage];
  const opacity = muted ? 0.18 : 1;
  const dot = stage === "outcomes";

  const arcs: string[] =
    stage === "policy"
      ? [
          "M 92 50 A 42 42 0 0 0 50 8",
          "M 80 50 A 30 30 0 0 0 50 20",
          "M 68 50 A 18 18 0 0 0 50 32",
        ]
      : stage === "procedure"
        ? [
            "M 92 50 A 42 42 0 0 0 8 50",
            "M 80 50 A 30 30 0 0 0 20 50",
            "M 68 50 A 18 18 0 0 0 32 50",
          ]
        : stage === "training"
          ? [
              "M 92 50 A 42 42 0 1 0 50 92",
              "M 80 50 A 30 30 0 1 0 50 80",
              "M 68 50 A 18 18 0 1 0 50 68",
            ]
          : [];

  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      aria-hidden="true"
      style={{ opacity }}
    >
      <g fill="none" stroke={stroke} strokeWidth={strokeWidth}>
        {stage === "outcomes" ? (
          <>
            <circle cx="50" cy="50" r="42" />
            <circle cx="50" cy="50" r="30" />
            <circle cx="50" cy="50" r="18" />
          </>
        ) : (
          arcs.map((d) => <path key={d} d={d} />)
        )}
      </g>
      {dot && <circle cx="50" cy="50" r="7" fill={stroke} />}
    </svg>
  );
}

// The wordmark's mark: three quarter-arcs anchored at the bottom-left corner
// plus a dot at the origin, green only.
export function LogoMark({ size = 30 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 40 40"
      width={size}
      height={size}
      className="block flex-none"
      aria-hidden="true"
    >
      <g fill="none" stroke="#1B7A3E" strokeWidth={3.4}>
        <path d="M 14 36 A 10 10 0 0 0 4 26" />
        <path d="M 22 36 A 18 18 0 0 0 4 18" />
        <path d="M 30 36 A 26 26 0 0 0 4 10" />
      </g>
      <circle cx="4" cy="36" r="2.8" fill="#1B7A3E" />
    </svg>
  );
}

// The faint concentric-arc field that sits behind a portal page. Corner
// anchored, opacity ~0.13, never competing with text. Purely decorative.
export function PortalBackdrop() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-0 select-none overflow-hidden"
    >
      <svg
        viewBox="0 0 1200 800"
        preserveAspectRatio="xMaxYMax slice"
        className="h-full w-full"
      >
        <g fill="none" strokeWidth={14} opacity={0.13}>
          <path d="M 1200 300 A 500 500 0 0 0 700 800" stroke="#1F51A8" />
          <path d="M 1200 340 A 460 460 0 0 0 740 800" stroke="#1F51A8" />
          <path d="M 1200 380 A 420 420 0 0 0 780 800" stroke="#1F51A8" />
          <path d="M 1200 460 A 340 340 0 0 0 860 800" stroke="#C98A0E" />
          <path d="M 1200 500 A 300 300 0 0 0 900 800" stroke="#C98A0E" />
          <path d="M 1200 540 A 260 260 0 0 0 940 800" stroke="#C98A0E" />
          <path d="M 1200 620 A 180 180 0 0 0 1020 800" stroke="#C8451F" />
          <path d="M 1200 660 A 140 140 0 0 0 1060 800" stroke="#C8451F" />
          <path d="M 1200 700 A 100 100 0 0 0 1100 800" stroke="#C8451F" />
        </g>
        <g fill="none" stroke="#1B7A3E" strokeWidth={14} opacity={0.13}>
          <path d="M 0 640 A 160 160 0 0 1 160 800" />
          <path d="M 0 600 A 200 200 0 0 1 200 800" />
          <path d="M 0 560 A 240 240 0 0 1 240 800" />
        </g>
      </svg>
    </div>
  );
}

export function Wordmark({ size = 30 }: { size?: number }) {
  return (
    <span className="flex items-center gap-3">
      <LogoMark size={size} />
      <span className="font-jost text-[16px] font-semibold tracking-[0.2em] text-ink">
        VERICLEVER
      </span>
    </span>
  );
}
