import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { getProfile, isManager, TIER_LABELS } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { pendingSightingsByProfile } from "@/lib/verification";

export const metadata: Metadata = {
  title: "VeriClever",
  description:
    "Staff compliance and training for early childhood education and care",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await getProfile();

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
  if (profile && (isManager(profile.access_tier) || profile.hr_verifier)) {
    const counts = await pendingSightingsByProfile(createClient(), profile.id);
    staffToSignOff = counts.size;
  }

  return (
    <html lang="en-AU">
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased">
        {profile && (
          <header className="border-b border-slate-200 bg-white">
            <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-3">
              <div className="flex items-center gap-4">
                <Link href="/sops" className="text-sm font-semibold tracking-tight">
                  VeriClever
                </Link>
                {profile.job_role_id && (
                  <Link
                    href="/onboarding"
                    className="text-sm text-slate-500 hover:text-slate-900"
                  >
                    My details
                  </Link>
                )}
                {(isManager(profile.access_tier) || profile.hr_verifier) && (
                  <>
                    <Link
                      href="/admin/staff"
                      className="text-sm text-slate-500 hover:text-slate-900"
                    >
                      Staff
                    </Link>
                    <Link
                      href="/admin/verification"
                      className="text-sm text-slate-500 hover:text-slate-900"
                    >
                      Verification
                    </Link>
                  </>
                )}
              </div>
              <div className="flex items-center gap-3 text-right text-xs text-slate-500">
                <div>
                  <div className="font-medium text-slate-700">
                    {profile.full_name}
                  </div>
                  <div>{TIER_LABELS[profile.access_tier]}</div>
                </div>
                <form action="/logout" method="post">
                  <button
                    type="submit"
                    className="rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
                  >
                    Sign out
                  </button>
                </form>
              </div>
            </div>
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
        <main className="mx-auto max-w-3xl px-4 py-8">{children}</main>
      </body>
    </html>
  );
}
