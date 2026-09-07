import { createAdminClient } from "@/lib/supabase/admin";

// Build a first-login link for a staff account: a Supabase recovery token
// wrapped in our own /auth/confirm URL, so the link the person clicks is on our
// domain, not Supabase's. /auth/confirm verifies it and drops them on the
// set-password page.
export async function generateFirstLoginLink(
  email: string,
): Promise<{ ok: true; link: string } | { ok: false; error: string }> {
  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.generateLink({
    type: "recovery",
    email,
  });
  if (error || !data?.properties?.hashed_token) {
    return { ok: false, error: error?.message ?? "Could not generate a login link." };
  }

  const site = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(
    /\/+$/,
    "",
  );
  const url = new URL("/auth/confirm", site);
  url.searchParams.set("token_hash", data.properties.hashed_token);
  url.searchParams.set("type", "recovery");
  url.searchParams.set("next", "/account/password?welcome=1");
  return { ok: true, link: url.toString() };
}

// Same mechanism as the first-login link, but lands on the plain "set a new
// password" page rather than the welcome variant. Used by both the self-service
// forgot-password flow and an admin-triggered reset.
export async function generatePasswordResetLink(
  email: string,
): Promise<{ ok: true; link: string } | { ok: false; error: string }> {
  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.generateLink({
    type: "recovery",
    email,
  });
  if (error || !data?.properties?.hashed_token) {
    return {
      ok: false,
      error: error?.message ?? "Could not generate a reset link.",
    };
  }

  const site = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(
    /\/+$/,
    "",
  );
  const url = new URL("/auth/confirm", site);
  url.searchParams.set("token_hash", data.properties.hashed_token);
  url.searchParams.set("type", "recovery");
  url.searchParams.set("next", "/account/password");
  return { ok: true, link: url.toString() };
}
