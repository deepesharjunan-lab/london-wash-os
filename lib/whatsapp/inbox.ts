import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Open WhatsApp chats the team is handling (bot paused, not closed): the
 * "With staff" tab, and the number on the console sidebar. Server-only. Never throws.
 */
export async function staffChatCount(): Promise<number> {
  try {
    const { count } = await createAdminClient()
      .from("whatsapp_contact")
      .select("wa_id", { count: "exact", head: true })
      .gt("handoff_until", new Date().toISOString())
      .is("closed_at", null);
    return count ?? 0;
  } catch {
    return 0;
  }
}
