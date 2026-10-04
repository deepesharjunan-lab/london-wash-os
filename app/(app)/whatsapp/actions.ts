"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendText, waConfigured } from "@/lib/whatsapp/client";
import { HANDOFF_HOURS } from "@/lib/whatsapp/bot";

// WhatsApp inbox actions. The WhatsApp tables are service-role only, so each
// action first checks that a console user is signed in, then uses the admin client.

const WINDOW_MS = 24 * 3600000; // WhatsApp only allows free-text replies within 24 h of the customer's last message
const waId = (v: FormDataEntryValue | null) => String(v ?? "").replace(/\D/g, "").slice(0, 20);

async function consoleUserId(): Promise<string | null> {
  const supabase = createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return null;
  const { data: me } = await supabase.from("user").select("id").eq("auth_user_id", auth.user.id).maybeSingle();
  return (me as { id: string } | null)?.id ?? null;
}

export type ReplyState = { error?: string; sentAt?: number };

export async function sendReplyAction(_prev: ReplyState, form: FormData): Promise<ReplyState> {
  const userId = await consoleUserId();
  if (!userId) return { error: "Your session has ended. Sign in again." };
  const to = waId(form.get("wa_id"));
  const body = String(form.get("body") ?? "").trim();
  if (!to || !body) return { error: "Type a message first." };
  if (body.length > 4000) return { error: "That message is too long for WhatsApp (4,000 characters max)." };
  if (!waConfigured()) return { error: "WhatsApp isn't connected (check the Vercel settings)." };

  const db = createAdminClient();
  const { data: contact } = await db.from("whatsapp_contact").select("last_inbound_at").eq("wa_id", to).maybeSingle();
  const last = (contact as { last_inbound_at: string | null } | null)?.last_inbound_at;
  if (!last || Date.now() - new Date(last).getTime() > WINDOW_MS) {
    return { error: "It's been more than 24 hours since this customer last messaged, so WhatsApp won't deliver a normal reply. Call them, or wait until they message again." };
  }

  const res = await sendText(to, body, userId);
  if (!res.ok) return { error: `WhatsApp didn't accept the message: ${res.error}` };

  // A person is talking now: keep the bot quiet and mark the chat as read.
  await db
    .from("whatsapp_contact")
    .update({ handoff_until: new Date(Date.now() + HANDOFF_HOURS * 3600000).toISOString(), unread_count: 0, staff_read_at: new Date().toISOString() })
    .eq("wa_id", to);
  revalidatePath("/whatsapp");
  return { sentAt: Date.now() };
}

/** Pause the bot for this chat (staff will reply) or hand the chat back to the bot. */
export async function setBotAction(form: FormData) {
  if (!(await consoleUserId())) return;
  const to = waId(form.get("wa_id"));
  if (!to) return;
  const pause = form.get("mode") === "pause";
  await createAdminClient()
    .from("whatsapp_contact")
    .update({ handoff_until: pause ? new Date(Date.now() + HANDOFF_HOURS * 3600000).toISOString() : null })
    .eq("wa_id", to);
  revalidatePath("/whatsapp");
}

export async function markUnreadAction(form: FormData) {
  if (!(await consoleUserId())) return;
  const to = waId(form.get("wa_id"));
  if (!to) return;
  await createAdminClient().from("whatsapp_contact").update({ unread_count: 1 }).eq("wa_id", to);
  revalidatePath("/whatsapp");
}
