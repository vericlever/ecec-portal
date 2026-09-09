"use client";

import Link from "next/link";
import { useFormState, useFormStatus } from "react-dom";
import { ChainRing, Wordmark } from "@/components/bauhaus";
import { PasswordInput } from "@/components/password-input";
import { login, type LoginState } from "./actions";

const initialState: LoginState = { error: null };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full bg-outcomes px-[26px] py-[17px] text-center text-[17px] font-medium text-paper hover:bg-outcomes-hover disabled:opacity-50"
    >
      {pending ? "Signing in…" : "Sign in"}
    </button>
  );
}

export default function LoginPage() {
  const [state, formAction] = useFormState(login, initialState);

  return (
    <div className="font-jost flex min-h-screen flex-col overflow-x-hidden bg-paper text-ink">
      {/* Header */}
      <div className="border-b-[10px] border-ink">
        <div className="mx-auto flex max-w-[1240px] flex-wrap items-center justify-between gap-6 px-5 sm:px-10 py-5">
          <Link href="/" className="text-ink hover:text-ink">
            <Wordmark />
          </Link>
          <div className="flex flex-none items-center gap-6 whitespace-nowrap">
            <span className="text-[15px] text-ink-muted">Not set up yet?</span>
            <Link
              href="/"
              className="border border-ink px-[18px] py-2.5 text-[15px] text-ink hover:bg-ink hover:text-paper"
            >
              Book a walkthrough
            </Link>
          </div>
        </div>
      </div>

      <div className="grid flex-1 items-stretch [grid-template-columns:repeat(auto-fit,minmax(min(100%,420px),1fr))]">
        {/* Form */}
        <div className="mx-auto flex w-full max-w-[620px] flex-col justify-center gap-7 px-[clamp(28px,5vw,72px)] py-[clamp(48px,7vw,96px)]">
          <div className="flex flex-col gap-3.5">
            <p className="text-[13px] font-semibold uppercase tracking-[0.24em] text-outcomes">
              Sign in
            </p>
            <h1 className="text-[clamp(34px,4.4vw,48px)] font-semibold leading-[1.05] tracking-[-0.025em] text-pretty">
              Are you already VeriClever?
            </h1>
            <p className="text-[17px] leading-[1.5] text-ink-muted">
              Sign in to your service&apos;s portal.
            </p>
          </div>

          <form action={formAction} className="flex flex-col gap-5">
            <label className="flex flex-col gap-2">
              <span className="font-plex-mono text-[12px] uppercase tracking-[0.12em] text-ink-faint">
                Work email
              </span>
              <input
                name="email"
                type="email"
                autoComplete="email"
                required
                placeholder="you@yourservice.com.au"
                className="w-full border-2 border-ink bg-paper px-4 py-[15px] font-jost text-[17px] text-ink placeholder:text-[#9A9488] focus:outline focus:outline-2 focus:outline-offset-1 focus:outline-outcomes"
              />
            </label>
            <label className="flex flex-col gap-2">
              <span className="font-plex-mono text-[12px] uppercase tracking-[0.12em] text-ink-faint">
                Password
              </span>
              <PasswordInput
                name="password"
                autoComplete="current-password"
                required
                placeholder="••••••••"
                className="w-full border-2 border-ink bg-paper px-4 py-[15px] font-jost text-[17px] text-ink placeholder:text-[#9A9488] focus:outline focus:outline-2 focus:outline-offset-1 focus:outline-outcomes"
              />
            </label>

            <div className="flex flex-wrap items-center justify-end gap-5">
              <Link
                href="/forgot-password"
                className="text-[15px] text-outcomes hover:text-ink"
              >
                Forgot password
              </Link>
            </div>

            {state.error && (
              <p className="border-l-2 border-training py-1 pl-3 text-[15px] text-ink">
                {state.error}
              </p>
            )}

            <SubmitButton />
          </form>

          <div className="border-t-4 border-ink pt-5 text-[15px] leading-[1.5] text-ink-muted">
            Trouble getting in? Your Centre Director or Approved Provider can
            reissue access, or{" "}
            <a href="mailto:hello@vericlever.com.au" className="text-outcomes hover:text-ink">
              ask us
            </a>
            .
          </div>
        </div>

        {/* Context panel */}
        <div className="flex min-h-[520px] flex-col justify-between gap-10 border-t-[10px] border-ink bg-paper sm:border-l-[10px] sm:border-t-0 px-[clamp(28px,5vw,72px)] py-[clamp(48px,6vw,80px)]">
          <div className="flex max-w-[460px] flex-col gap-[18px]">
            <p className="text-[13px] font-semibold uppercase tracking-[0.24em] text-outcomes">
              Inside the portal
            </p>
            <p className="text-[clamp(24px,2.6vw,30px)] font-medium leading-[1.2] text-pretty">
              Every procedure your team signs closes a ring &mdash; and stays
              closed until something changes.
            </p>
          </div>

          <div className="flex flex-1 items-center justify-center">
            <ChainRing size={380} className="h-auto w-full max-w-[380px]" />
          </div>

          <div className="grid gap-[18px] border-t-4 border-ink pt-[22px] [grid-template-columns:repeat(auto-fit,minmax(120px,1fr))]">
            <LegendItem label="POLICY" desc="The obligation" color="text-policy" />
            <LegendItem
              label="PROCEDURE"
              desc="The practice"
              color="text-procedure-text"
            />
            <LegendItem
              label="TRAINING"
              desc="The knowledge"
              color="text-training"
            />
            <LegendItem
              label="OUTCOMES"
              desc="The evidence"
              color="text-outcomes"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function LegendItem({
  label,
  desc,
  color,
}: {
  label: string;
  desc: string;
  color: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className={`text-[12px] font-semibold tracking-[0.16em] ${color}`}>
        {label}
      </div>
      <div className="text-[14px] text-ink-muted">{desc}</div>
    </div>
  );
}
