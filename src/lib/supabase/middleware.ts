import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Runs on every request: refreshes the Supabase session cookie and gates
// access. Unauthenticated requests to anything other than /login are redirected
// to /login; an authenticated request to /login is sent on to the same
// leader/staff landing split as the root page and the login action.

const PUBLIC_PATHS = new Set([
  "/",
  "/login",
  "/forgot-password",
  "/auth/confirm",
  "/faq",
  // The service worker script must be fetchable with no session at all - a
  // browser checks for updates to it in the background, logged in or not,
  // and the self-destructing version (Step 12, PWA removed 15 September
  // 2026) has to reach every browser that registered the old one, not just
  // ones with a current session.
  "/sw.js",
]);
// Endpoints that authenticate themselves (the cron job checks CRON_SECRET), so
// the session gate must not bounce them to /login.
const PUBLIC_PREFIXES = ["/api/cron/"];

// Step 51. Every authenticated user must accept the current Vericlever
// Platform Terms of Use and Privacy Notice before reaching anywhere else -
// "at first login before the onboarding wizard" means before literally
// everything, since onboarding is the first thing a new account normally
// does. Exempt the gate page itself, logout (so a stuck session can still
// leave), and every /api/ route (nothing under the gate should ever need to
// call one before accepting).
const NOTICE_GATE_PATH = "/accept-terms";
const NOTICE_GATE_EXEMPT = new Set([...PUBLIC_PATHS, NOTICE_GATE_PATH, "/logout"]);

export async function updateSession(request: NextRequest) {
  // Forwarded as a request header (not a response header) so that
  // next/headers' headers() can read it during server-side rendering - the
  // root layout uses it to tell a fully public page like /faq apart from the
  // portal routes, since usePathname() isn't available in a server component.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-pathname", request.nextUrl.pathname);

  let response = NextResponse.next({ request: { headers: requestHeaders } });

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
          response = NextResponse.next({ request: { headers: requestHeaders } });
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
    const { data: profile } = await supabase
      .from("profiles")
      .select("access_tier, hr_manager")
      .eq("id", user.id)
      .maybeSingle();
    const leader =
      profile != null &&
      (["manager_staff", "manager_policy", "admin"].includes(
        profile.access_tier,
      ) ||
        profile.hr_manager);
    const url = request.nextUrl.clone();
    url.pathname = leader ? "/admin" : "/home";
    return NextResponse.redirect(url);
  }

  if (
    user &&
    !NOTICE_GATE_EXEMPT.has(path) &&
    !path.startsWith("/api/")
  ) {
    const { data: latest } = await supabase
      .from("platform_notices")
      .select("version")
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (latest) {
      const { data: accepted } = await supabase
        .from("platform_notice_acceptances")
        .select("id")
        .eq("profile_id", user.id)
        .eq("notice_version", latest.version)
        .maybeSingle();
      if (!accepted) {
        const url = request.nextUrl.clone();
        url.pathname = NOTICE_GATE_PATH;
        url.search = `?next=${encodeURIComponent(path)}`;
        return NextResponse.redirect(url);
      }
    }
  }

  return response;
}
