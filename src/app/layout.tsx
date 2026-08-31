import type { Metadata } from "next";
import "./globals.css";
import { DEV_USER_NAME, DEV_USER_ROLE, DEV_USER_SITE_NAME } from "@/lib/constants";

export const metadata: Metadata = {
  title: "The Portal",
  description: "Staff compliance and training for early childhood education and care",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en-AU">
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased">
        <header className="border-b border-slate-200 bg-white">
          <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
            <div>
              <span className="text-sm font-semibold tracking-tight">The Portal</span>
              <span className="ml-2 text-sm text-slate-500">Ready Set Go</span>
            </div>
            <div className="text-right text-xs text-slate-500">
              <div className="font-medium text-slate-700">{DEV_USER_NAME}</div>
              <div>
                {DEV_USER_ROLE} · {DEV_USER_SITE_NAME}
              </div>
            </div>
          </div>
        </header>
        <main className="mx-auto max-w-3xl px-4 py-8">{children}</main>
      </body>
    </html>
  );
}
