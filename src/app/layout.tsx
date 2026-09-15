import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { Jost, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

const jost = Jost({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-jost",
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-plex-mono",
  display: "swap",
});
import {
  getProfile,
  isManager,
  isWorker,
  isAdmin,
  canEditContent,
  canViewReports,
} from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { pendingSightingsByProfile } from "@/lib/verification";
import { PortalBackdrop } from "@/components/bauhaus";
import { SiteNav } from "./site-nav";

export const metadata: Metadata = {
  title: "VeriClever",
  description:
    "Staff compliance and training for early childhood education and care",
};

export const viewport: Viewport = {
  themeColor: "#1A1A17",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await getProfile();
  const leader = Boolean(
    profile && (isManager(profile.access_tier) || profile.hr_manager),
  );

  // /faq and /parent/[serviceId] are public and own their own layout, same as
  // the landing page - but unlike the landing page neither redirects a
  // signed-in visitor away, so without this check a logged-in staff member
  // opening one (or a parent whose browser happens to also hold a stray
  // staff session cookie) would get the portal's nav and backdrop wrapped
  // around the public page as well, squeezed into the portal's narrower
  // main column.
  const pathname = (await headers()).get("x-pathname") ?? "";
  const showPortalChrome =
    Boolean(profile) && pathname !== "/faq" && !pathname.startsWith("/parent/");

  // Admin-editable label shown next to the staff member's own name in the
  // nav - falls back to the account name (organisations.name, RLS-locked to
  // a platform superuser) when no display_name has been set yet.
  let orgName: string | null = null;
  if (profile?.organisation_id) {
    const { data: org } = await createClient()
      .from("organisations")
      .select("name, display_name")
      .eq("id", profile.organisation_id)
      .maybeSingle();
    orgName = (org?.display_name as string | null) || (org?.name as string | null) || null;
  }

  // Anyone with a job role is a worker who needs a Worker Register entry - and
  // so is an Admin, who has an underlying staff record too (Step 40).
  let showOnboardingPrompt = false;
  if (profile && isWorker(profile)) {
    const { data } = await createClient()
      .from("worker_details")
      .select("onboarding_completed_at")
      .eq("profile_id", profile.id)
      .maybeSingle();
    showOnboardingPrompt = !data?.onboarding_completed_at;
  }

  // Leaders and HR verifiers get a running count of staff whose onboarding
  // documents they still need to sight.
  let staffToSignOff = 0;
  if (profile && (isManager(profile.access_tier) || profile.hr_manager)) {
    const counts = await pendingSightingsByProfile(createClient(), profile.id);
    staffToSignOff = counts.size;
  }

  return (
    <html lang="en-AU" className={`${jost.variable} ${plexMono.variable}`}>
      <body className="font-jost min-h-screen bg-paper text-slate-900 antialiased">
        {showPortalChrome && <PortalBackdrop />}
        {showPortalChrome && profile && (
          <header className="relative z-40 border-b-[10px] border-ink bg-paper">
            <SiteNav
              fullName={profile.full_name}
              orgName={orgName}
              isLeader={leader}
              // The top-nav "Agreements"/"My details" shortcuts are for staff
              // who live there day to day. An Admin reaches the same pages by
              // clicking their own name into /account instead (Step 40 gave
              // /account its "Your details" link) - a persistent nav item
              // would be clutter for a tier that isn't usually also a worker.
              isWorker={isWorker(profile) && !isAdmin(profile.access_tier)}
              isAdmin={isAdmin(profile.access_tier)}
              canManageStaff={
                isManager(profile.access_tier) || profile.hr_manager
              }
              canCountersign={isManager(profile.access_tier)}
              canEditContent={canEditContent(profile.access_tier)}
              canViewReports={canViewReports(profile.access_tier)}
              canViewParentPortal={isManager(profile.access_tier)}
            />
          </header>
        )}
        {showPortalChrome && showOnboardingPrompt && (
          <div className="relative z-30 border-b border-amber-200 bg-amber-50">
            <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-2 text-sm text-amber-900">
              <span>Your onboarding details are not complete yet.</span>
              <Link
                href="/onboarding"
                className="shrink-0 rounded-md bg-amber-900 px-2.5 py-1 text-xs font-medium text-white"
              >
                Complete onboarding
              </Link>
            </div>
          </div>
        )}
        {showPortalChrome && staffToSignOff > 0 && (
          <div className="relative z-30 border-b border-amber-200 bg-amber-50">
            <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-2 text-sm text-amber-900">
              <span>
                {staffToSignOff === 1
                  ? "1 staff member has onboarding documents waiting for your sign-off."
                  : `${staffToSignOff} staff members have onboarding documents waiting for your sign-off.`}
              </span>
              <Link
                href="/admin/verification"
                className="shrink-0 rounded-md bg-amber-900 px-2.5 py-1 text-xs font-medium text-white"
              >
                Complete staff sign-off
              </Link>
            </div>
          </div>
        )}
        {showPortalChrome ? (
          <main className="relative z-10 mx-auto max-w-3xl px-4 py-8">
            {children}
          </main>
        ) : (
          // Public pages (landing, sign-in, forgot-password, FAQ) own their
          // own layout, whether or not the visitor happens to be signed in.
          children
        )}
      </body>
    </html>
  );
}
