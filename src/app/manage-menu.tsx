"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

type Item = { href: string; label: string };

export function ManageMenu({
  canManageStaff,
  canCountersign,
  canEditContent,
}: {
  canManageStaff: boolean;
  canCountersign: boolean;
  canEditContent: boolean;
}) {
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

  const groups: { label: string | null; items: Item[] }[] = [];
  groups.push({ label: null, items: [{ href: "/account", label: "My details" }] });
  if (canManageStaff || canCountersign) {
    const items: Item[] = [];
    if (canManageStaff) {
      items.push({ href: "/admin/staff", label: "Staff" });
      items.push({ href: "/admin/credentials", label: "Expiring credentials" });
      items.push({ href: "/admin/contracts", label: "Contracts" });
      items.push({ href: "/admin/verification", label: "Document verification" });
    }
    if (canCountersign) {
      items.push({ href: "/admin/countersign", label: "SOP countersigning" });
      items.push({ href: "/admin/observations", label: "Practice observations" });
    }
    groups.push({ label: "Staff", items });
  }
  if (canEditContent) {
    groups.push({
      label: "Library",
      items: [
        { href: "/admin/policies", label: "Policies" },
        { href: "/admin/sops", label: "SOPs" },
        { href: "/admin/agreements", label: "Agreements" },
        { href: "/admin/job-roles", label: "Job roles" },
      ],
    });
  }

  const active = pathname.startsWith("/admin");

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
        Manage
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
                    pathname === it.href || pathname.startsWith(it.href + "/")
                      ? "font-semibold text-ink"
                      : "text-ink-muted"
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
