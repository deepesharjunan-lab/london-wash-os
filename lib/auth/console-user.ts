import { createClient } from "@/lib/supabase/server";

/** The signed-in console user's id (public."user".id), or null. For server actions that then use the admin client. */
export async function consoleUserId(): Promise<string | null> {
  const supabase = createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return null;
  const { data: me } = await supabase.from("user").select("id").eq("auth_user_id", auth.user.id).maybeSingle();
  return (me as { id: string } | null)?.id ?? null;
}
