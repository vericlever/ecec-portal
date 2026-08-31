import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { getProfile, isManager, TIER_LABELS } from "@/lib/auth";

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
                {isManager(profile.access_tier) && (
                  <Link
                    href="/admin/staff"
                    className="text-sm text-slate-500 hover:text-slate-900"
                  >
                    Staff
                  </Link>
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
        <main className="mx-auto max-w-3xl px-4 py-8">{children}</main>
      </body>
    </html>
  );
}
