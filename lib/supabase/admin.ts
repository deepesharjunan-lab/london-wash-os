import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// Server-only admin client using the Supabase service_role key. This
// bypasses Row Level Security and can perform privileged operations like
// creating Auth users. NEVER import this file into a client component or
// otherwise expose SUPABASE_SERVICE_ROLE_KEY to the browser.
export function createAdminClient() {
    return createSupabaseClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
              auth: {
                        autoRefreshToken: false,
                        persistSession: false,
              },
      }
        );
}
