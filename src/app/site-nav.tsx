"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
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

  const primary: Item[] = [
    ...(isLeader ? [{ href: "/admin", label: "Overview" }] : []),
    { href: "/sops", label: "SOPs" },
    { href: "/policies", label: "Policies" },
    ...(isWorker
      ? [
          { href: "/agreements", label: "Agreements" },
          { href: "/onboarding", label: "My details" },
        ]
      : []),
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
      items.push({ href: "/admin/countersign", label: "SOP countersigning" });
      items.push({ href: "/admin/observations", label: "Practice observations" });
    }
    manageGroups.push({ label: "Staff", items });
  }
  if (canEditContent) {
    manageGroups.push({
      label: "Library",
      items: [
        { href: "/admin/policies", label: "Policies" },
        { href: "/admin/sops", label: "SOPs" },
        { href: "/admin/agreements", label: "Agreements" },
        { href: "/admin/job-roles", label: "Job roles" },
      ],
    });
  }
  const showManage = canManageStaff || canCountersign || canEditContent;

  const linkCls = (href: string) =>
    `text-sm ${
      pathname === href || pathname.startsWith(href + "/")
        ? "font-medium text-slate-900"
        : "text-slate-500"
    } hover:text-slate-900`;

  return (
    <nav
      ref={ref}
      className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-3"
    >
      <div className="flex items-center gap-4">
        <Link
          href={isLeader ? "/admin" : "/sops"}
          className="text-sm font-semibold tracking-tight"
        >
          VeriClever
        </Link>

        {/* Desktop links */}
        <div className="hidden items-center gap-4 sm:flex">
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
      <div className="hidden items-center gap-3 text-right text-xs text-slate-500 sm:flex">
        <Link href="/account" className="group">
          <div className="font-medium text-slate-700 group-hover:text-slate-900 group-hover:underline">
            {fullName}
          </div>
          <div>{tierLabel}</div>
        </Link>
        <form action="/logout" method="post">
          <button
            type="submit"
            className="rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
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
        className="rounded-md border border-slate-300 p-1.5 text-slate-600 sm:hidden"
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
        <div className="absolute inset-x-0 top-full z-30 border-b border-slate-200 bg-white shadow-lg sm:hidden">
          <div className="mx-auto max-w-3xl space-y-1 px-4 py-3">
            {primary.map((it) => (
              <Link
                key={it.href}
                href={it.href}
                className={`block rounded-md px-2 py-2 ${linkCls(it.href)}`}
              >
                {it.label}
              </Link>
            ))}

            {manageGroups.map((g) => (
              <div key={g.label} className="mt-2 border-t border-slate-100 pt-2">
                {g.label && (
                  <div className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                    {g.label}
                  </div>
                )}
                {g.items.map((it) => (
                  <Link
                    key={it.href}
                    href={it.href}
                    className={`block rounded-md px-2 py-2 ${linkCls(it.href)}`}
                  >
                    {it.label}
                  </Link>
                ))}
              </div>
            ))}

            <div className="mt-2 flex items-center justify-between border-t border-slate-100 pt-3">
              <Link href="/account" className="text-sm">
                <div className="font-medium text-slate-800">{fullName}</div>
                <div className="text-xs text-slate-500">{tierLabel}</div>
              </Link>
              <form action="/logout" method="post">
                <button
                  type="submit"
                  className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600"
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
