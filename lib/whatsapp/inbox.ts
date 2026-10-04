import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Open WhatsApp chats with the team that have unread customer messages: the
 * number on the console sidebar. It drops as soon as someone opens the chat.
 * The browser then keeps it live from public.whatsapp_pulse. Server-only. Never throws.
 */
export async function waitingChatCount(): Promise<number> {
  try {
    const { count } = await createAdminClient()
      .from("whatsapp_contact")
      .select("wa_id", { count: "exact", head: true })
      .gt("handoff_until", new Date().toISOString())
      .is("closed_at", null)
      .gt("unread_count", 0);
    return count ?? 0;
  } catch {
    return 0;
  }
}
