"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogoMark } from "@/components/bauhaus";
import { ManageMenu } from "./manage-menu";

type Item = { href: string; label: string };

export type SiteNavProps = {
  fullName: string;
  tierLabel: string;
  isLeader: boolean;
  isWorker: boolean;
  canManageStaff: boolean;
  canCountersign: boolean;
  canEditContent: boolean;
  canViewReports: boolean;
};

export function SiteNav(props: SiteNavProps) {
  const {
    fullName,
    tierLabel,
    isLeader,
    isWorker,
    canManageStaff,
    canCountersign,
    canEditContent,
    canViewReports,
  } = props;

  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLElement>(null);
  const pathname = usePathname();

  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // Plain staff (build addendum item 2, revised): Home, My details,
  // Procedures, Policies. Policies was dropped as a standalone tab per the
  // original spec (reachable only via the Step 15 click-through from a
  // procedure to its source policy) but reinstated on request. Leaders keep
  // the existing nav unchanged, Overview included.
  const primary: Item[] = isLeader
    ? [
        { href: "/admin", label: "Overview" },
        { href: "/sops", label: "Procedures" },
        { href: "/policies", label: "Policies" },
        ...(canViewReports ? [{ href: "/reports", label: "Reports" }] : []),
        ...(isWorker
          ? [
              { href: "/agreements", label: "Agreements" },
              { href: "/onboarding", label: "My details" },
            ]
          : []),
      ]
    : [
        { href: "/home", label: "Home" },
        { href: "/onboarding", label: "My details" },
        { href: "/sops", label: "Procedures" },
        { href: "/policies", label: "Policies" },
      ];

  const manageGroups: { label: string; items: Item[] }[] = [];
  if (canManageStaff || canCountersign || canEditContent) {
    manageGroups.push({
      label: "",
      items: [{ href: "/account", label: "My details" }],
    });
  }
  if (canManageStaff || canCountersign) {
    const items: Item[] = [];
    if (canManageStaff) {
      items.push({ href: "/admin/staff", label: "Staff" });
      items.push({ href: "/admin/credentials", label: "Expiring credentials" });
      items.push({ href: "/admin/contracts", label: "Contracts" });
      items.push({ href: "/admin/verification", label: "Document verification" });
    }
    if (canCountersign) {
      items.push({ href: "/admin/countersign", label: "Procedure countersigning" });
    }
    manageGroups.push({ label: "Staff", items });
  }
  // Library: content editors get the full editing set. Any manager keeps
  // Procedures too - Review cycle v2 lets manager_staff complete a review
  // even though only a content editor may revise and republish the text.
  if (canEditContent || canCountersign) {
    const items: Item[] = [];
    if (canEditContent) items.push({ href: "/admin/policies", label: "Policies" });
    items.push({ href: "/admin/sops", label: "Procedures" });
    if (canEditContent) {
      items.push(
        { href: "/admin/agreements", label: "Agreements" },
        { href: "/admin/job-roles", label: "Job roles" },
      );
    }
    manageGroups.push({ label: "Library", items });
  }
  const showManage = canManageStaff || canCountersign || canEditContent;

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(href + "/");

  const linkCls = (href: string) =>
    `text-sm ${
      isActive(href)
        ? "font-semibold text-ink border-b-[3px] border-procedure pb-[3px]"
        : "text-ink-muted"
    } hover:text-ink`;

  return (
    <nav
      ref={ref}
      className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-4"
    >
      <div className="flex items-center gap-6">
        <Link
          href={isLeader ? "/admin" : "/home"}
          className="flex items-center gap-2.5 text-ink hover:text-ink"
        >
          <LogoMark size={24} />
          <span className="font-jost text-[15px] font-semibold tracking-[0.2em] text-ink">
            VERICLEVER
          </span>
        </Link>

        {/* Desktop links */}
        <div className="hidden items-center gap-5 sm:flex">
          {primary.map((it) => (
            <Link key={it.href} href={it.href} className={linkCls(it.href)}>
              {it.label}
            </Link>
          ))}
          {showManage && (
            <ManageMenu
              canManageStaff={canManageStaff}
              canCountersign={canCountersign}
              canEditContent={canEditContent}
            />
          )}
        </div>
      </div>

      {/* Desktop account */}
      <div className="hidden items-center gap-3.5 sm:flex">
        <Link href="/account" className="group text-right leading-tight">
          <div className="text-sm font-medium text-ink group-hover:underline">
            {fullName}
          </div>
          <div className="text-xs text-ink-faint">{tierLabel}</div>
        </Link>
        <form action="/logout" method="post">
          <button
            type="submit"
            className="border-2 border-ink px-3.5 py-1.5 text-sm text-ink hover:bg-ink hover:text-paper"
          >
            Sign out
          </button>
        </form>
      </div>

      {/* Mobile menu button */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Menu"
        aria-expanded={open}
        className="border-2 border-ink p-1.5 text-ink sm:hidden"
      >
        <svg viewBox="0 0 20 20" className="h-5 w-5" aria-hidden="true">
          {open ? (
            <path
              d="M5 5 L15 15 M15 5 L5 15"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
          ) : (
            <path
              d="M3 6 H17 M3 10 H17 M3 14 H17"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
          )}
        </svg>
      </button>

      {/* Mobile sheet */}
      {open && (
        <div className="absolute inset-x-0 top-full z-50 border-b-2 border-ink bg-paper sm:hidden">
          <div className="mx-auto max-w-3xl space-y-1 px-4 py-3">
            {primary.map((it) => (
              <Link
                key={it.href}
                href={it.href}
                className={`block px-2 py-2 text-sm ${
                  isActive(it.href)
                    ? "font-semibold text-ink"
                    : "text-ink-muted"
                }`}
              >
                {it.label}
              </Link>
            ))}

            {manageGroups.map((g) => (
              <div key={g.label} className="mt-2 border-t border-ink/15 pt-2">
                {g.label && (
                  <div className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
                    {g.label}
                  </div>
                )}
                {g.items.map((it) => (
                  <Link
                    key={it.href}
                    href={it.href}
                    className={`block px-2 py-2 text-sm ${
                      isActive(it.href)
                        ? "font-semibold text-ink"
                        : "text-ink-muted"
                    }`}
                  >
                    {it.label}
                  </Link>
                ))}
              </div>
            ))}

            <div className="mt-2 flex items-center justify-between border-t border-ink/15 pt-3">
              <Link href="/account" className="text-sm">
                <div className="font-medium text-ink">{fullName}</div>
                <div className="text-xs text-ink-faint">{tierLabel}</div>
              </Link>
              <form action="/logout" method="post">
                <button
                  type="submit"
                  className="border-2 border-ink px-3 py-1.5 text-xs font-medium text-ink"
                >
                  Sign out
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}
