import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// Supabase client for React Server Components, server actions and route
// handlers. Carries the signed-in user's session, so every query runs under
// that user's row-level security. Server-only.

export function createClient() {
  const cookieStore = cookies();

  return createServerClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Called from a Server Component where cookies are read-only. The
            // middleware refreshes the session cookie, so this is safe to skip.
          }
        },
      },
    },
  );
}

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) {
    throw new Error(
      `Missing ${name}. Copy .env.local.example to .env.local and fill it in from the Supabase dashboard (Project Settings -> API).`,
    );
  }
  return v;
}
