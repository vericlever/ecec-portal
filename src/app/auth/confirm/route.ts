import { redirect } from "next/navigation";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Handles the link from an invite / password-reset email.
//
// GET only shows a "Continue" button. The one-time token is verified on POST,
// when the person presses it. Email security scanners and link previewers
// open links automatically with GET; if GET verified the token they would use
// it up before the person ever clicked, and the link would then fail.

const ALLOWED = ["recovery", "invite", "magiclink", "email", "signup"];

function esc(s: string) {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type");
  const next = searchParams.get("next") ?? "/account/password";

  if (!tokenHash || !type || !ALLOWED.includes(type)) {
    redirect("/login?error=link");
  }

  const html = `<!doctype html>
<html lang="en-AU"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Continue to VeriClever</title>
<style>
body{margin:0;font-family:system-ui,sans-serif;background:#faf8f3;color:#1a1a1a;display:flex;min-height:100vh;align-items:center;justify-content:center}
main{max-width:360px;padding:24px}
h1{font-size:24px;margin:0 0 8px}
p{color:#555;line-height:1.5}
button{width:100%;padding:16px;font-size:17px;font-weight:500;color:#fff;background:#1a1a1a;border:0;cursor:pointer}
</style></head><body><main>
<h1>Almost there</h1>
<p>Press continue to finish signing in and set your password.</p>
<form method="post">
<input type="hidden" name="token_hash" value="${esc(tokenHash)}">
<input type="hidden" name="type" value="${esc(type)}">
<input type="hidden" name="next" value="${esc(next)}">
<button type="submit">Continue</button>
</form></main></body></html>`;

  return new NextResponse(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

export async function POST(request: NextRequest) {
  const form = await request.formData();
  const tokenHash = String(form.get("token_hash") ?? "");
  const type = String(form.get("type") ?? "");
  const rawNext = String(form.get("next") ?? "");
  const next =
    rawNext.startsWith("/") && !rawNext.startsWith("//")
      ? rawNext
      : "/account/password";

  if (tokenHash && ALLOWED.includes(type)) {
    const supabase = createClient();
    const { error } = await supabase.auth.verifyOtp({
      type: type as "recovery" | "invite" | "magiclink" | "email" | "signup",
      token_hash: tokenHash,
    });
    // 303 so the browser follows with GET, not a repeat POST.
    if (!error) return NextResponse.redirect(new URL(next, request.url), 303);
  }

  return NextResponse.redirect(new URL("/login?error=link", request.url), 303);
}
