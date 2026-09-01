import { redirect } from "next/navigation";
import { type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Handles the link from an invite / password-reset email. Verifies the token,
// which sets the session cookie, then forwards to the set-password page.
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type");
  const next = searchParams.get("next") ?? "/account/password";

  const allowed = ["recovery", "invite", "magiclink", "email", "signup"];
  if (tokenHash && type && allowed.includes(type)) {
    const supabase = createClient();
    const { error } = await supabase.auth.verifyOtp({
      type: type as "recovery" | "invite" | "magiclink" | "email" | "signup",
      token_hash: tokenHash,
    });
    if (!error) redirect(next.startsWith("/") ? next : "/account/password");
  }

  redirect("/login?error=link");
}
