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

async function post(payload: Record<string, unknown>, log?: { to: string; type: string; body: string; sentBy?: string | null }): Promise<SendResult> {
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
    if (log)
      await logMessage({ wa_id: log.to, direction: "out", msg_type: log.type, body: log.body, wa_message_id: id ?? null, status: "sent", sent_by_user_id: log.sentBy ?? null });
    return { ok: true, id };
  } catch (e: any) {
    console.error("WhatsApp send error", e);
    return { ok: false, error: e?.message ?? "Network error" };
  }
}

/** Plain text. `sentBy` is the console user's id when a person (not the bot) is replying. */
export const sendText = (to: string, body: string, sentBy?: string | null) =>
  post({ to, type: "text", text: { body: body.slice(0, 4096), preview_url: true } }, { to, type: "text", body, sentBy });

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

export const sendList = (
  to: string,
  body: string,
  button: string,
  rows: { id: string; title: string; description?: string }[],
  opts: { section?: string; footer?: string } = {}
) =>
  post(
    {
      to,
      type: "interactive",
      interactive: {
        type: "list",
        body: { text: body.slice(0, 1024) },
        footer: { text: (opts.footer ?? "the art of laundry.").slice(0, 60) },
        action: {
          button: button.slice(0, 20),
          sections: [
            {
              title: (opts.section ?? "Menu").slice(0, 24),
              rows: rows.slice(0, 10).map((r) => ({ id: r.id, title: r.title.slice(0, 24), description: r.description?.slice(0, 72) })),
            },
          ],
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
/** `logText` is what the WhatsApp inbox shows for this message (defaults to the template name). */
export const sendTemplate = (to: string, name: string, lang = "en", components: unknown[] = [], logText?: string) =>
  post({ to, type: "template", template: { name, language: { code: lang }, components } }, { to, type: "template", body: logText || name });

export const markRead = (messageId: string) => post({ status: "read", message_id: messageId });

/* ------------------------------------------------------------------ */
/* Media: photos, videos, voice notes, documents                        */
/* ------------------------------------------------------------------ */

export type MediaKind = "image" | "video" | "audio" | "document";

/** File types WhatsApp accepts for each kind (anything else is sent as a document). */
const IMAGE_TYPES = ["image/jpeg", "image/png"];
const VIDEO_TYPES = ["video/mp4", "video/3gpp"];
const AUDIO_TYPES = ["audio/ogg", "audio/mpeg", "audio/mp4", "audio/aac", "audio/amr"];
const baseType = (mime: string) => mime.split(";")[0].trim().toLowerCase();

export function mediaKindFor(mime: string): MediaKind {
  const t = baseType(mime);
  if (IMAGE_TYPES.includes(t)) return "image";
  if (VIDEO_TYPES.includes(t)) return "video";
  if (AUDIO_TYPES.includes(t)) return "audio";
  return "document";
}

export const MEDIA_LABEL: Record<string, string> = {
  image: "📷 Photo",
  video: "🎬 Video",
  audio: "🎤 Voice message",
  document: "📄 Document",
  sticker: "Sticker",
};

/** Uploads a file to Meta for sending. Returns the media id. */
export async function uploadMedia(file: Blob, mime: string, filename: string): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  if (!waConfigured()) return { ok: false, error: "WhatsApp is not configured" };
  try {
    const form = new FormData();
    form.append("messaging_product", "whatsapp");
    form.append("type", baseType(mime));
    form.append("file", new Blob([await file.arrayBuffer()], { type: baseType(mime) }), filename);
    const res = await fetch(`${GRAPH()}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/media`, {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}` },
      body: form,
    });
    const json = (await res.json().catch(() => ({}))) as any;
    if (!res.ok || !json?.id) return { ok: false, error: json?.error?.message ?? `HTTP ${res.status}` };
    return { ok: true, id: String(json.id) };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "Upload failed" };
  }
}

/** Sends an uploaded file. Audio can't carry a caption; documents keep their file name. */
export async function sendMedia(
  to: string,
  kind: MediaKind,
  media: { id: string; mime: string; filename?: string; caption?: string },
  sentBy?: string | null
): Promise<SendResult> {
  const caption = kind === "audio" ? undefined : media.caption?.slice(0, 1024) || undefined;
  const object: Record<string, unknown> = { id: media.id };
  if (caption) object.caption = caption;
  if (kind === "document" && media.filename) object.filename = media.filename.slice(0, 240);
  const res = await post({ to, type: kind, [kind]: object });
  if (res.ok) {
    await logMessage({
      wa_id: to,
      direction: "out",
      msg_type: kind,
      body: [MEDIA_LABEL[kind], caption].filter(Boolean).join(" · "),
      wa_message_id: res.id ?? null,
      status: "sent",
      sent_by_user_id: sentBy ?? null,
      media_id: media.id,
      media_mime: media.mime,
      media_name: media.filename ?? null,
    });
  }
  return res;
}

/** Downloads a file from Meta (incoming or one we uploaded). Meta keeps files for about 30 days. */
export async function fetchMedia(mediaId: string): Promise<{ ok: true; body: ArrayBuffer; mime: string } | { ok: false; status: number }> {
  if (!waConfigured()) return { ok: false, status: 503 };
  try {
    const auth = { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}` };
    const meta = await fetch(`${GRAPH()}/${encodeURIComponent(mediaId)}`, { headers: auth, cache: "no-store" });
    const info = (await meta.json().catch(() => ({}))) as any;
    if (!meta.ok || !info?.url) return { ok: false, status: meta.status === 400 || meta.status === 404 ? 404 : 502 };
    // Meta's file host rejects requests without a normal user agent.
    const file = await fetch(info.url, { headers: { ...auth, "User-Agent": "Mozilla/5.0 (LondonWashOS)" }, cache: "no-store" });
    if (!file.ok) return { ok: false, status: file.status === 404 ? 404 : 502 };
    return { ok: true, body: await file.arrayBuffer(), mime: String(info.mime_type || file.headers.get("content-type") || "application/octet-stream") };
  } catch {
    return { ok: false, status: 502 };
  }
}

/** Checks Meta's X-Hub-Signature-256 header. Without an app secret configured, requests are accepted (setup only). */
export function verifySignature(raw: string, header: string | null) {
  const secret = process.env.WHATSAPP_APP_SECRET;
  if (!secret) return true;
  if (!header?.startsWith("sha256=")) return false;
  const expected = Buffer.from(createHmac("sha256", secret).update(raw).digest("hex"));
  const given = Buffer.from(header.slice(7));
  return expected.length === given.length && timingSafeEqual(expected, given);
}

type LogRow = {
  wa_id: string;
  direction: "in" | "out";
  msg_type: string;
  body: string | null;
  wa_message_id: string | null;
  status?: string;
  sent_by_user_id?: string | null;
  media_id?: string | null;
  media_mime?: string | null;
  media_name?: string | null;
};

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

export async function recordStatus(s: { id?: string; status?: string; recipient_id?: string }) {
  if (!s?.id || !s.status) return;
  try {
    const db = createAdminClient();
    await db.from("whatsapp_message").update({ status: s.status }).eq("wa_message_id", s.id);
    // Touch the chat so open inboxes show the new tick straight away (live pulse).
    if (s.recipient_id) await db.from("whatsapp_contact").update({ updated_at: new Date().toISOString() }).eq("wa_id", s.recipient_id);
    // Campaign delivery tracking (Engage → Campaigns).
    const { recordCampaignStatus } = await import("@/lib/engage/campaigns");
    await recordCampaignStatus(s.id, s.status);
  } catch {
    // logging only
  }
}
