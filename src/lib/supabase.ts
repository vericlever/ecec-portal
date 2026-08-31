import { createClient } from "@supabase/supabase-js";

// Server-side Supabase client for step 3. Uses the service role key, so it
// bypasses row-level security. This module must never be imported from a client
// component. Step 4 replaces this with an auth-aware client whose queries run
// under the calling user's RLS.

export function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Copy .env.local.example to .env.local and fill it in.",
    );
  }

  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
