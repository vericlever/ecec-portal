import type { Metadata, Viewport } from "next";
import Link from "next/link";
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
import { getProfile, isManager, canEditContent, TIER_LABELS } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { pendingSightingsByProfile } from "@/lib/verification";
import { SiteNav } from "./site-nav";
import { RegisterServiceWorker } from "./register-sw";

export const metadata: Metadata = {
  title: "VeriClever",
  description:
    "Staff compliance and training for early childhood education and care",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "VeriClever", statusBarStyle: "default" },
  icons: { icon: "/icon.svg", apple: "/icon.svg" },
};

export const viewport: Viewport = {
  themeColor: "#0f172a",
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

  // Anyone with a job role is a worker who needs a Worker Register entry.
  let showOnboardingPrompt = false;
  if (profile && profile.job_role_id) {
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
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased">
        <RegisterServiceWorker />
        {profile && (
          <header className="relative border-b border-slate-200 bg-white">
            <SiteNav
              fullName={profile.full_name}
              tierLabel={TIER_LABELS[profile.access_tier]}
              isLeader={leader}
              isWorker={Boolean(profile.job_role_id)}
              canManageStaff={
                isManager(profile.access_tier) || profile.hr_manager
              }
              canCountersign={isManager(profile.access_tier)}
              canEditContent={canEditContent(profile.access_tier)}
            />
          </header>
        )}
        {showOnboardingPrompt && (
          <div className="border-b border-amber-200 bg-amber-50">
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
        {staffToSignOff > 0 && (
          <div className="border-b border-amber-200 bg-amber-50">
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
        {profile ? (
          <main className="mx-auto max-w-3xl px-4 py-8">{children}</main>
        ) : (
          // Public pages (landing, sign-in, forgot-password) own their layout.
          children
        )}
      </body>
    </html>
  );
}
