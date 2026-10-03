import { createHmac, timingSafeEqual } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";

// WhatsApp Cloud API, used directly with Meta (no BSP). Server-only.
// Environment variables (Vercel → Settings → Environment Variables):
//   WHATSAPP_TOKEN            permanent system-user access token
//   WHATSAPP_PHONE_NUMBER_ID  the sending number's Phone Number ID
//   WHATSAPP_VERIFY_TOKEN     any secret phrase, also typed into the app's webhook settings
//   WHATSAPP_APP_SECRET       App settings → Basic → App secret (signs incoming webhooks)
//   WHATSAPP_GRAPH_VERSION    optional, defaults to v23.0

const GRAPH = () => `https://graph.facebook.com/${process.env.WHATSAPP_GRAPH_VERSION || "v23.0"}`;

export const waConfigured = () => !!(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID);

type SendResult = { ok: true; id?: string } | { ok: false; error: string };

async function post(payload: Record<string, unknown>, log?: { to: string; type: string; body: string }): Promise<SendResult> {
  if (!waConfigured()) return { ok: false, error: "WhatsApp is not configured" };
  try {
    const res = await fetch(`${GRAPH()}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", ...payload }),
    });
    const json = (await res.json().catch(() => ({}))) as any;
    if (!res.ok) {
      console.error("WhatsApp send failed", res.status, json?.error?.message);
      return { ok: false, error: json?.error?.message ?? `HTTP ${res.status}` };
    }
    const id = json?.messages?.[0]?.id as string | undefined;
    if (log) await logMessage({ wa_id: log.to, direction: "out", msg_type: log.type, body: log.body, wa_message_id: id ?? null, status: "sent" });
    return { ok: true, id };
  } catch (e: any) {
    console.error("WhatsApp send error", e);
    return { ok: false, error: e?.message ?? "Network error" };
  }
}

export const sendText = (to: string, body: string) =>
  post({ to, type: "text", text: { body: body.slice(0, 4096), preview_url: true } }, { to, type: "text", body });

export const sendButtons = (to: string, body: string, buttons: { id: string; title: string }[]) =>
  post(
    {
      to,
      type: "interactive",
      interactive: {
        type: "button",
        body: { text: body.slice(0, 1024) },
        action: { buttons: buttons.slice(0, 3).map((b) => ({ type: "reply", reply: { id: b.id, title: b.title.slice(0, 20) } })) },
      },
    },
    { to, type: "buttons", body }
  );

export const sendList = (to: string, body: string, button: string, rows: { id: string; title: string; description?: string }[]) =>
  post(
    {
      to,
      type: "interactive",
      interactive: {
        type: "list",
        body: { text: body.slice(0, 1024) },
        footer: { text: "the art of laundry." },
        action: {
          button: button.slice(0, 20),
          sections: [{ title: "Menu", rows: rows.slice(0, 10).map((r) => ({ id: r.id, title: r.title.slice(0, 24), description: r.description?.slice(0, 72) })) }],
        },
      },
    },
    { to, type: "list", body }
  );

/** A message with one link button (opens a website or the customer app). */
export const sendLink = (to: string, body: string, label: string, url: string) =>
  post(
    {
      to,
      type: "interactive",
      interactive: {
        type: "cta_url",
        body: { text: body.slice(0, 1024) },
        action: { name: "cta_url", parameters: { display_text: label.slice(0, 20), url } },
      },
    },
    { to, type: "link", body: `${body}\n${url}` }
  );

/** Approved template (needed to message someone first, or after 24 hours of silence). */
export const sendTemplate = (to: string, name: string, lang = "en", components: unknown[] = []) =>
  post({ to, type: "template", template: { name, language: { code: lang }, components } }, { to, type: "template", body: name });

export const markRead = (messageId: string) => post({ status: "read", message_id: messageId });

/** Checks Meta's X-Hub-Signature-256 header. Without an app secret configured, requests are accepted (setup only). */
export function verifySignature(raw: string, header: string | null) {
  const secret = process.env.WHATSAPP_APP_SECRET;
  if (!secret) return true;
  if (!header?.startsWith("sha256=")) return false;
  const expected = Buffer.from(createHmac("sha256", secret).update(raw).digest("hex"));
  const given = Buffer.from(header.slice(7));
  return expected.length === given.length && timingSafeEqual(expected, given);
}

type LogRow = { wa_id: string; direction: "in" | "out"; msg_type: string; body: string | null; wa_message_id: string | null; status?: string };

/** Stores a message in whatsapp_message. Returns false if it was already stored (Meta re-sends webhooks). Never throws. */
export async function logMessage(row: LogRow): Promise<boolean> {
  try {
    const { error } = await createAdminClient().from("whatsapp_message").insert({ ...row, body: row.body?.slice(0, 4000) ?? null });
    if (error) return error.code !== "23505";
    return true;
  } catch {
    return true;
  }
}

export async function recordStatus(s: { id?: string; status?: string }) {
  if (!s?.id || !s.status) return;
  try {
    await createAdminClient().from("whatsapp_message").update({ status: s.status }).eq("wa_message_id", s.id);
  } catch {
    // logging only
  }
}
