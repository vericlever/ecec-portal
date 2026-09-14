import { StageArc, type Stage } from "./bauhaus";

// Step 53. The four-stage chain (policy -> procedure -> training -> outcomes)
// as one graphic, shared verbatim between the staff /home and the admin
// /admin overview - only the intro sentence differs, since what someone's
// own part in the chain is differs by tier, but the model itself does not.
// Same geometry family as the public login page's legend (label + sub-label,
// same per-stage accent colour), but laid out as a single row with a
// connector rather than a plain grid, and using StageArc - four sweep states
// of one arc, not the ChainRing composite - since each stage needs to read
// as its own icon here.

const STAGES: { stage: Stage; label: string; sub: string; colorCls: string }[] = [
  { stage: "policy", label: "Policy", sub: "The obligation", colorCls: "text-policy" },
  { stage: "procedure", label: "Procedure", sub: "The practice", colorCls: "text-procedure-text" },
  { stage: "training", label: "Training", sub: "The knowledge", colorCls: "text-training" },
  { stage: "outcomes", label: "Outcomes", sub: "The evidence", colorCls: "text-outcomes" },
];

const ICON_SIZE = 56;

export function ChainOverview({ intro }: { intro: string }) {
  return (
    <section className="mb-6 rounded-lg border border-slate-200 bg-white p-4 sm:p-5">
      <p className="text-sm text-slate-600">{intro}</p>

      {/* 4-column layout (lg+): icons on a shared baseline with a connector
          line behind them. The line's own width only spans icon-1's centre
          to icon-4's centre - it never draws further out than that, so it
          reads as terminating at their outer edge without any clipping
          maths, and each icon's opaque badge covers the segment that would
          otherwise run across it. */}
      <div className="relative mt-5 hidden lg:grid lg:grid-cols-4">
        <div
          aria-hidden="true"
          className="absolute h-[2px] bg-slate-200"
          style={{ top: ICON_SIZE / 2, left: "12.5%", right: "12.5%" }}
        />
        {STAGES.map((s) => (
          <div key={s.stage} className="relative flex flex-col items-center">
            <div className="relative z-10 rounded-full bg-white">
              <StageArc stage={s.stage} size={ICON_SIZE} strokeWidth={7} />
            </div>
            <div className="relative mt-3 h-0 w-full">
              <div className="absolute left-1/2 w-max text-left leading-tight">
                <div className={`text-xs font-semibold uppercase tracking-[0.14em] ${s.colorCls}`}>
                  {s.label}
                </div>
                <div className="text-xs text-slate-500">{s.sub}</div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Below lg: a plain stacked list, icon and label side by side. The
          connector line drops out entirely rather than trying to bend
          around a reflowed 2-column or 1-column grid. */}
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:hidden">
        {STAGES.map((s) => (
          <div key={s.stage} className="flex items-center gap-3">
            <StageArc stage={s.stage} size={40} strokeWidth={6} />
            <div className="leading-tight">
              <div className={`text-xs font-semibold uppercase tracking-[0.14em] ${s.colorCls}`}>
                {s.label}
              </div>
              <div className="text-xs text-slate-500">{s.sub}</div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
