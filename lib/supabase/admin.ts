import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// Server-only admin client using the Supabase service_role key. This
// bypasses Row Level Security and can perform privileged operations like
// creating Auth users. NEVER import this file into a client component or
// otherwise expose SUPABASE_SERVICE_ROLE_KEY to the browser.
//
// Every request uses cache: "no-store". Next.js 14 otherwise keeps GET
// responses in its data cache, so a query whose URL never changes (e.g. the
// Google connection row read by the Engage pump) kept returning the old
// answer indefinitely.
export function createAdminClient() {
    return createSupabaseClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
              auth: {
                        autoRefreshToken: false,
                        persistSession: false,
              },
              global: {
                        fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }),
              },
      }
        );
}
