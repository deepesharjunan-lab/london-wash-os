import { createAdminClient } from "@/lib/supabase/admin";
import { customersByPhone } from "@/lib/customer/session";
import { loadMember } from "@/lib/customer/member";
import { loadStages } from "@/lib/staff/flow";
import { notify } from "@/lib/notify";
import { MEDIA_LABEL, logMessage, markRead, sendButtons, sendLink, sendList, sendText } from "./client";
import { captureFeedback, handleRating, ratingFrom } from "./rating";

// The London Wash WhatsApp assistant. Customers get a menu: track orders
// (live garment stages), book a pickup, prices, Club points, store hours, or
// a person. "Talk to staff" alerts reception and keeps the bot quiet for a
// few hours so staff can reply. Server-only; replies go to the sender only.

const APP = "https://club.thelondonwash.com/my";
const SITE = "https://www.thelondonwash.com";
const MAP = "https://maps.app.goo.gl/ao1QecaaEpGTqgj58";
export const HANDOFF_HOURS = 4;
const ACTIVE = ["confirmed", "in_production", "ready", "out_for_delivery"];
const STATUS_TEXT: Record<string, string> = {
  confirmed: "Received and tagged",
  in_production: "Being cleaned",
  ready: "Ready ✅",
  out_for_delivery: "Out for delivery 🚚",
  delivered: "Delivered",
};
const GREETINGS = /^(hi+|hello|hey|hai|helo|menu|start|help|0|good (morning|afternoon|evening)|namaskaram)\b/i;

const MENU_ROWS = [
  { id: "track", title: "Track my order", description: "Where your clothes are right now" },
  { id: "book", title: "Book a pickup", description: "Pickup within 15–30 km of our store" },
  { id: "prices", title: "Prices", description: "Starting prices for our services" },
  { id: "points", title: "My Club points", description: "Points, tier and rewards" },
  { id: "hours", title: "Store hours & location", description: "Vettipuram, Pathanamthitta" },
  { id: "staff", title: "Talk to our team", description: "A person will reply here" },
];

type IncomingMedia = { id: string; mime_type?: string; caption?: string; filename?: string };
type Incoming = {
  id: string;
  from: string;
  type: string;
  text?: { body?: string };
  interactive?: { list_reply?: { id: string; title: string }; button_reply?: { id: string; title: string } };
  button?: { payload?: string; text?: string };
  image?: IncomingMedia;
  video?: IncomingMedia;
  audio?: IncomingMedia;
  document?: IncomingMedia;
  sticker?: IncomingMedia;
  location?: { latitude: number; longitude: number; name?: string; address?: string };
  reaction?: { message_id?: string; emoji?: string };
};

const MEDIA_TYPES = ["image", "video", "audio", "document", "sticker"] as const;

/** The file attached to a message, if any, and a readable line for the inbox. */
function readMedia(m: Incoming): { media: IncomingMedia | null; label: string | null } {
  if (m.type === "reaction") return { media: null, label: m.reaction?.emoji ? `Reacted ${m.reaction.emoji}` : "Removed a reaction" };
  if (m.type === "location" && m.location) {
    const { latitude, longitude, name, address } = m.location;
    const place = [name, address].filter(Boolean).join(", ");
    return { media: null, label: `📍 Location${place ? `: ${place}` : ""}\nhttps://maps.google.com/?q=${latitude},${longitude}` };
  }
  if (!(MEDIA_TYPES as readonly string[]).includes(m.type)) return { media: null, label: null };
  const media = (m as any)[m.type] as IncomingMedia | undefined;
  if (!media?.id) return { media: null, label: null };
  const caption = media.caption?.trim();
  return { media, label: [MEDIA_LABEL[m.type] ?? m.type, media.filename, caption].filter(Boolean).join(" · ") };
}

function readInput(m: Incoming): { action: string | null; text: string } {
  const reply = m.interactive?.list_reply ?? m.interactive?.button_reply;
  if (reply) return { action: reply.id, text: reply.title };
  if (m.button) return { action: null, text: m.button.text ?? m.button.payload ?? "" };
  return { action: null, text: (m.text?.body ?? "").trim() };
}

function intentFromText(text: string): string | null {
  const t = text.toLowerCase();
  if (!t) return null;
  if (GREETINGS.test(t)) return "menu";
  if (/\b(track|status|where|ready|order)\b/.test(t)) return "track";
  if (/\b(book|pick ?up|collect)\b/.test(t)) return "book";
  if (/\b(price|rate|cost|charge|how much)\b/.test(t)) return "prices";
  if (/\b(point|club|reward|tier)\b/.test(t)) return "points";
  if (/\b(hour|open|time|timing|location|address|where are you|map)\b/.test(t)) return "hours";
  if (/\b(staff|human|person|agent|talk|call me)\b/.test(t)) return "staff";
  return null;
}

/** Handles one incoming WhatsApp message. Never throws. */
export async function handleIncoming(m: Incoming, profileName?: string) {
  try {
    const from = m.from;
    const { action, text } = readInput(m);
    const { media, label } = readMedia(m);
    // The chat as it was before this message (saving the message reopens a closed chat).
    const { data: before } = await createAdminClient()
      .from("whatsapp_contact")
      .select("closed_at, closed_by_user_id, rating_requested_at, feedback_until")
      .eq("wa_id", from)
      .maybeSingle();
    const prior = (before as { closed_at: string | null; closed_by_user_id: string | null; rating_requested_at: string | null; feedback_until: string | null } | null) ?? null;
    const fresh = await logMessage({
      wa_id: from,
      direction: "in",
      msg_type: m.type,
      body: label ?? (text || `[${m.type}]`),
      wa_message_id: m.id,
      media_id: media?.id ?? null,
      media_mime: media?.mime_type ?? null,
      media_name: media?.filename ?? null,
    });
    if (!fresh) return; // already handled (Meta retries webhooks)
    await markRead(m.id);

    const db = createAdminClient();
    const customers = await customersByPhone(from);
    const customer = customers[0] ?? null;
    const contact = await touchContact(from, profileName ?? null, customer?.id ?? null);
    const firstName = (customer?.full_name ?? profileName ?? "").split(" ")[0];

    // Rating after a closed chat (tapped, or a typed 1-5 soon after the request).
    const rating = ratingFrom(action, text, prior);
    if (rating) return handleRating(from, rating, prior, customer, profileName);
    // After a low rating, the next message is the customer's comment for the manager.
    if (!label && (await captureFeedback(from, text, prior))) return;

    // Staff are handling this chat (from the console WhatsApp inbox): stay quiet
    // unless the customer taps a menu button or types "menu".
    const staffHandling = !!contact.handoffUntil && contact.handoffUntil > Date.now();
    if (staffHandling && !action && text.toLowerCase() !== "menu") return;

    // Emoji reactions and system notices don't need an answer.
    if (["reaction", "system", "unsupported", "ephemeral"].includes(m.type)) return;

    // Photos, voice notes, documents and locations need a person: pass the chat to the team.
    if (label) {
      const what = m.type === "image" ? "photo" : m.type === "audio" ? "voice message" : m.type === "location" ? "location" : m.type === "sticker" ? "message" : "file";
      return handoff(db, from, customer, profileName, `Customer sent a ${what} on WhatsApp`, `Thanks, we've received your ${what}. A member of our team will reply here shortly (Mon–Sat 9–9, Sun 11–6).`);
    }

    const intent = action ?? intentFromText(text);
    if (!intent) return menu(from, firstName, true);

    switch (intent) {
      case "menu":
        return menu(from, firstName, false);
      case "track":
        return track(db, from, customers);
      case "book":
        return sendLink(from, "Book a pickup in our app: choose a time and we'll come to you (within 15–30 km of our store). Sign in with this mobile number.", "Book a pickup", `${APP}/book`).then(() =>
          sendButtons(from, "Prefer to book here on WhatsApp?", [
            { id: "book_chat", title: "Book via chat" },
            { id: "menu", title: "Main menu" },
          ])
        );
      case "book_chat":
        return handoff(db, from, customer, profileName, "Pickup request on WhatsApp", "Please send your address and a convenient pickup time. Our team will confirm here shortly.");
      case "prices":
        return sendLink(
          from,
          "*Starting prices*\n• Dry cleaning from ₹25 / piece\n• Wash & iron from ₹10 / piece\n• Wash & fold from ₹20 / piece\n• Express ironing from ₹25 / piece\n• Starch iron from ₹49 / piece\n• Wash & fold by kg from ₹60 / kg\n• Wash & iron by kg from ₹129 / kg\n• Blankets & quilts from ₹169\n• Shoe cleaning from ₹99 · Helmet ₹199 · Toys ₹119\n\nFinal price depends on the garment and fabric.",
          "All services",
          `${SITE}/#services`
        );
      case "points":
        return points(db, from, customer?.id ?? null);
      case "hours":
        return sendLink(
          from,
          "*The London Wash*\nNear Kerala PSC Office, Thazhe, Vettipuram, Pathanamthitta, Kerala 689645\n\n🕘 Mon–Sat 9 AM – 9 PM\n🕚 Sunday 11 AM – 6 PM\n📞 +91 85900 00868",
          "Open in Maps",
          MAP
        );
      case "staff":
        return handoff(db, from, customer, profileName, "Customer wants to talk on WhatsApp", "Thanks! A member of our team will reply here shortly (Mon–Sat 9–9, Sun 11–6). Type *menu* any time to see the options again.");
      default:
        return menu(from, firstName, true);
    }
  } catch (e) {
    console.error("WhatsApp bot failed", e);
  }
}

async function menu(to: string, firstName: string, didNotUnderstand: boolean) {
  const hello = firstName ? `Hi ${firstName}! 👋` : "Hi! 👋";
  const body = didNotUnderstand
    ? `Sorry, I didn't quite get that. Here's what I can help with:`
    : `${hello} Welcome to *The London Wash*, the art of laundry. How can we help you today?`;
  return sendList(to, body, "See options", MENU_ROWS);
}

async function track(db: ReturnType<typeof createAdminClient>, to: string, customers: { id: string }[]) {
  if (!customers.length) {
    return sendButtons(
      to,
      "We couldn't find an account for this WhatsApp number. If your orders are under a different number, tap *Talk to our team* and we'll help.",
      [
        { id: "staff", title: "Talk to our team" },
        { id: "menu", title: "Main menu" },
      ]
    );
  }
  const ids = customers.map((c) => c.id);
  const { data: active } = await db
    .from("order")
    .select("id, order_number, status, created_at")
    .in("customer_id", ids)
    .in("status", ACTIVE)
    .order("created_at", { ascending: false })
    .limit(5);
  const orders = (active ?? []) as { id: string; order_number: string; status: string; created_at: string }[];

  if (!orders.length) {
    const { data: last } = await db
      .from("order")
      .select("order_number, status, created_at")
      .in("customer_id", ids)
      .neq("status", "draft")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const l = last as { order_number: string; status: string; created_at: string } | null;
    const lastLine = l ? `\nYour last order *${l.order_number}* is ${STATUS_TEXT[l.status]?.toLowerCase() ?? l.status}.` : "";
    return sendButtons(to, `You have no orders in progress right now.${lastLine}`, [
      { id: "book", title: "Book a pickup" },
      { id: "menu", title: "Main menu" },
    ]);
  }

  // Garment stages per order.
  const stages = await loadStages(db as any);
  const { data: items } = await db.from("order_item").select("id, order_id").in("order_id", orders.map((o) => o.id));
  const itemOrder = new Map(((items ?? []) as { id: string; order_id: string }[]).map((i) => [i.id, i.order_id]));
  const { data: garments } = itemOrder.size
    ? await db.from("garment").select("order_item_id, current_stage_id").in("order_item_id", [...itemOrder.keys()])
    : { data: [] as any[] };
  const byOrder = new Map<string, Map<string, number>>();
  for (const g of (garments ?? []) as { order_item_id: string; current_stage_id: string | null }[]) {
    const oid = itemOrder.get(g.order_item_id);
    if (!oid) continue;
    const name = stages.find((s) => s.id === g.current_stage_id)?.name ?? "Received";
    const m = byOrder.get(oid) ?? new Map<string, number>();
    m.set(name, (m.get(name) ?? 0) + 1);
    byOrder.set(oid, m);
  }

  const lines = orders.map((o) => {
    const counts = byOrder.get(o.id);
    const total = counts ? [...counts.values()].reduce((a, b) => a + b, 0) : 0;
    const detail = counts && o.status !== "ready" && o.status !== "out_for_delivery"
      ? `\n   ${total} ${total === 1 ? "piece" : "pieces"}: ${[...counts.entries()].map(([n, c]) => `${c} ${n}`).join(" · ")}`
      : "";
    return `*${o.order_number}* · ${STATUS_TEXT[o.status] ?? o.status}${detail}`;
  });
  return sendLink(to, `Your orders in progress:\n\n${lines.join("\n\n")}`, "Track live", `${APP}/orders`);
}

async function points(db: ReturnType<typeof createAdminClient>, to: string, customerId: string | null) {
  if (!customerId) {
    return sendButtons(to, "We couldn't find a London Wash Club account for this number. Every customer becomes a member with their first order.", [
      { id: "book", title: "Book a pickup" },
      { id: "menu", title: "Main menu" },
    ]);
  }
  const m = await loadMember(db as any, customerId);
  if (!m) return sendText(to, "Sorry, we couldn't load your Club details right now. Please try again in a little while.");
  return sendLink(
    to,
    `*London Wash Club*\n${m.tier.name} member\n⭐ ${Math.floor(Number(m.points) || 0).toLocaleString("en-IN")} points available\n${m.gapText}`,
    "My Club",
    `${APP}/points`
  );
}

async function handoff(
  db: ReturnType<typeof createAdminClient>,
  to: string,
  customer: { id: string; full_name: string } | null,
  profileName: string | undefined,
  title: string,
  reply: string
) {
  try {
    await db.from("whatsapp_contact").update({ handoff_until: new Date(Date.now() + HANDOFF_HOURS * 3600000).toISOString() }).eq("wa_id", to);
  } catch {
    // state only
  }
  let branchId: string | null = null;
  if (customer) {
    const { data } = await db.from("customer").select("branch_id").eq("id", customer.id).maybeSingle();
    branchId = (data as { branch_id: string } | null)?.branch_id ?? null;
  }
  await notify(
    { roles: ["receptionist"], owners: true, branchId },
    {
      kind: "whatsapp_handoff",
      title,
      body: `${customer?.full_name ?? profileName ?? "Customer"} · +${to}`,
      staffUrl: "/work",
      ownerUrl: `/whatsapp?c=${to}`,
    }
  );
  return sendText(to, reply);
}

/** Remembers the contact; returns when staff took over (ms) if any. */
async function touchContact(waId: string, name: string | null, customerId: string | null): Promise<{ handoffUntil: number | null }> {
  try {
    const db = createAdminClient();
    const now = new Date().toISOString();
    const { data } = await db
      .from("whatsapp_contact")
      .upsert({ wa_id: waId, profile_name: name, customer_id: customerId, last_inbound_at: now, updated_at: now }, { onConflict: "wa_id" })
      .select("handoff_until")
      .maybeSingle();
    const h = (data as { handoff_until: string | null } | null)?.handoff_until;
    return { handoffUntil: h ? new Date(h).getTime() : null };
  } catch {
    return { handoffUntil: null };
  }
}
