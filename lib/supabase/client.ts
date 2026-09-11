import { createBrowserClient } from "@supabase/ssr";

// Browser-side Supabase client. Uses the publishable (anon) key only, every
// query goes through RLS as the signed-in user, never a service role.
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
