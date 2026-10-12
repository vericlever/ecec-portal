"use client";

import { useEffect, useState, type ReactNode } from "react";

type Props = {
  id: string;
  title: string;
  count?: number;
  defaultOpen?: boolean;
  // Shown on the right of the heading, outside the toggle (links, filters).
  actions?: ReactNode;
  children: ReactNode;
};

// One area of the Our Outcomes page that can be collapsed. The body stays in
// the page when closed (only hidden), so a half-finished edit inside a card
// is not lost by collapsing. A link to #id (the redirect after an upload, the
// menu's Staff Flags link) opens the area it points at.
export function CollapsibleSection({ id, title, count, defaultOpen = false, actions, children }: Props) {
  const [open, setOpen] = useState(defaultOpen);

  useEffect(() => {
    const openIfTargeted = () => {
      if (window.location.hash === `#${id}`) setOpen(true);
    };
    openIfTargeted();
    window.addEventListener("hashchange", openIfTargeted);
    return () => window.removeEventListener("hashchange", openIfTargeted);
  }, [id]);

  return (
    <section id={id} className="mt-8 scroll-mt-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          <button
            type="button"
            aria-expanded={open}
            aria-controls={`${id}-body`}
            onClick={() => setOpen((o) => !o)}
            className="flex items-center gap-1.5 uppercase"
          >
            <svg
              viewBox="0 0 12 12"
              className={`h-3 w-3 transition-transform ${open ? "rotate-90" : ""}`}
              aria-hidden="true"
            >
              <path
                d="M4 2 L8 6 L4 10"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            {title}
            {count !== undefined && (
              <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium normal-case tracking-normal text-slate-500">
                {count}
              </span>
            )}
          </button>
        </h2>
        {actions}
      </div>
      <div id={`${id}-body`} hidden={!open}>
        {children}
      </div>
    </section>
  );
}
