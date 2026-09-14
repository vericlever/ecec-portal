"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

export type NavItem = { href: string; label: string };
export type NavGroup = { label: string | null; items: NavItem[] };

// Generic top-level nav dropdown - "My Portal", "Our Staff" and "Our
// Workflow" are all this component with different groups, replacing the
// single catch-all "Manage" menu that mixed staff administration and
// content authoring under one label with no way to tell them apart.
export function NavDropdown({ label, groups }: { label: string; groups: NavGroup[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  const isActiveHref = (href: string) =>
    pathname === href || pathname.startsWith(href + "/");
  const active = groups.some((g) => g.items.some((it) => isActiveHref(it.href)));

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-1 text-sm hover:text-ink ${
          active
            ? "border-b-[3px] border-procedure pb-[3px] font-semibold text-ink"
            : "text-ink-muted"
        }`}
      >
        {label}
        <svg
          viewBox="0 0 12 12"
          className={`h-3 w-3 transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden="true"
        >
          <path
            d="M2 4 L6 8 L10 4"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {open && (
        <div className="absolute left-0 z-50 mt-3 w-56 border-2 border-ink bg-paper py-1">
          {groups.map((g, i) => (
            <div key={i} className={i > 0 ? "mt-1 border-t border-ink/15 pt-1" : ""}>
              {g.label && (
                <div className="px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
                  {g.label}
                </div>
              )}
              {g.items.map((it) => (
                <Link
                  key={it.href}
                  href={it.href}
                  className={`block px-3 py-1.5 text-sm hover:bg-ink/[0.04] ${
                    isActiveHref(it.href) ? "font-semibold text-ink" : "text-ink-muted"
                  }`}
                >
                  {it.label}
                </Link>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
