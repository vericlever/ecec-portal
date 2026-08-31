import { createClient } from "@supabase/supabase-js";

// Service-role client. Bypasses row-level security and can manage auth users.
// Only for server code that has already checked the caller is allowed to do the
// thing (see src/app/admin/**). Server-only. Never import from a client
// component or a middleware.

export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY (Supabase dashboard -> Project Settings -> API).",
    );
  }
  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
