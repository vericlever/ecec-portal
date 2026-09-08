import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Runs on every request: refreshes the Supabase session cookie and gates
// access. Unauthenticated requests to anything other than /login are redirected
// to /login; an authenticated request to /login is sent on to /sops.

const PUBLIC_PATHS = new Set([
  "/",
  "/login",
  "/forgot-password",
  "/auth/confirm",
]);
// Endpoints that authenticate themselves (the cron job checks CRON_SECRET), so
// the session gate must not bounce them to /login.
const PUBLIC_PREFIXES = ["/api/cron/"];

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;

  if (PUBLIC_PREFIXES.some((p) => path.startsWith(p))) {
    return response;
  }

  if (!user && !PUBLIC_PATHS.has(path)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (user && path === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/sops";
    return NextResponse.redirect(url);
  }

  return response;
}
