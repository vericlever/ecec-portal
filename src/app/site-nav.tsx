"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogoMark } from "@/components/bauhaus";
import { NavDropdown, type NavGroup } from "./nav-dropdown";

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
  // Procedures, Policies. No admin-facing duplicate of anything exists for
  // this tier, so there is nothing to disambiguate - the flat nav stays.
  // Leaders get a different structure below: the personal ("My Portal") and
  // the administrative ("Our Staff" / "Our Workflow") views used to share
  // identical labels ("Procedures", "Policies") in two different places -
  // one flat in the primary nav, one inside a single catch-all "Manage"
  // menu - with nothing to tell a manager which one they were about to
  // open. Splitting them into three purpose-named groups fixes that.
  const primary: Item[] = isLeader
    ? [{ href: "/admin", label: "Overview" }]
    : [
        { href: "/home", label: "Home" },
        { href: "/onboarding", label: "My details" },
        { href: "/sops", label: "Procedures" },
        { href: "/policies", label: "Policies" },
      ];

  // My Portal: this person's own procedures, policies, agreements and
  // details - identical destinations to the plain-staff flat nav above,
  // just grouped since a leader also has administrative destinations to
  // keep separate from them.
  const myPortalGroups: NavGroup[] = [
    {
      label: null,
      items: [
        { href: "/sops", label: "My Procedures" },
        { href: "/policies", label: "My Policies" },
        ...(isWorker
          ? [
              { href: "/agreements", label: "My Agreements" },
              { href: "/onboarding", label: "My Details" },
            ]
          : []),
      ],
    },
  ];

  // Our Staff: everything about the people, not the content - the previous
  // "Manage > Staff" group, plus job roles (who is assigned what) moved
  // here from "Library" since it is a staff-structure question, not a
  // content-authoring one.
  const ourStaffGroups: NavGroup[] = [];
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
    if (canEditContent) {
      items.push({ href: "/admin/job-roles", label: "Job roles" });
    }
    ourStaffGroups.push({ label: null, items });
  }
  const showOurStaff = ourStaffGroups.length > 0;

  // Our Workflow: the manager/content-editor view of policies and
  // procedures (search, review, publish), staff outcome flags and reports -
  // the previous "Manage > Library" group. Content editors get the full
  // authoring set; any manager keeps Procedures too, since Review cycle v2
  // lets manager_staff complete a review even though only a content editor
  // may revise and republish the text.
  const ourWorkflowGroups: NavGroup[] = [];
  if (canEditContent || canCountersign || canViewReports) {
    const items: Item[] = [];
    if (canEditContent) items.push({ href: "/admin/policies", label: "Policies" });
    if (canEditContent || canCountersign) {
      items.push({ href: "/admin/sops", label: "Procedures" });
    }
    if (canCountersign) {
      items.push({ href: "/admin/outcome-flags", label: "Outcome flags" });
    }
    if (canEditContent) {
      items.push({ href: "/admin/agreements", label: "Agreements" });
    }
    if (canViewReports) items.push({ href: "/reports", label: "Reports" });
    ourWorkflowGroups.push({ label: null, items });
  }
  const showOurWorkflow = ourWorkflowGroups.length > 0;

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(href + "/");

  const linkCls = (href: string) =>
    `text-sm ${
      isActive(href)
        ? "font-semibold text-ink border-b-[3px] border-procedure pb-[3px]"
        : "text-ink-muted"
    } hover:text-ink`;

  // For the mobile sheet, which lists every destination flat with a
  // section heading rather than as nested dropdowns.
  const mobileSections: { label: string; groups: NavGroup[] }[] = isLeader
    ? [
        { label: "My Portal", groups: myPortalGroups },
        ...(showOurStaff ? [{ label: "Our Staff", groups: ourStaffGroups }] : []),
        ...(showOurWorkflow ? [{ label: "Our Workflow", groups: ourWorkflowGroups }] : []),
      ]
    : [];

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
          {isLeader && <NavDropdown label="My Portal" groups={myPortalGroups} />}
          {showOurStaff && <NavDropdown label="Our Staff" groups={ourStaffGroups} />}
          {showOurWorkflow && <NavDropdown label="Our Workflow" groups={ourWorkflowGroups} />}
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

            {mobileSections.map((section) => (
              <div key={section.label} className="mt-2 border-t border-ink/15 pt-2">
                <div className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
                  {section.label}
                </div>
                {section.groups.flatMap((g) => g.items).map((it) => (
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
