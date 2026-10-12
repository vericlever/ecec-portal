import { createBrowserClient } from "@supabase/ssr";

// Browser-side client, anon key only. Step 59, B5.1: the outcome upload form
// uploads straight to the outcome-quarantine bucket via a signed upload URL
// (obtained from a Server Action, which does the actual authorisation check)
// rather than through a Server Action's own body - outcome uploads run up to
// the spec's 20 MB cap (B4), well past a comfortable Server Action payload.
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
