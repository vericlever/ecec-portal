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
    }
    groups.push({ label: "Staff", items });
  }
  if (canEditContent) {
    groups.push({
      label: "Library",
      items: [
        { href: "/admin/policies", label: "Policies" },
        { href: "/admin/sops", label: "SOPs" },
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
        className={`flex items-center gap-1 text-sm ${
          active ? "text-slate-900" : "text-slate-500"
        } hover:text-slate-900`}
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
        <div className="absolute left-0 z-20 mt-2 w-56 rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
          {groups.map((g, i) => (
            <div key={i} className={i > 0 ? "mt-1 border-t border-slate-100 pt-1" : ""}>
              {g.label && (
                <div className="px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  {g.label}
                </div>
              )}
              {g.items.map((it) => (
                <Link
                  key={it.href}
                  href={it.href}
                  className={`block px-3 py-1.5 text-sm hover:bg-slate-50 ${
                    pathname === it.href || pathname.startsWith(it.href + "/")
                      ? "font-medium text-slate-900"
                      : "text-slate-600"
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
