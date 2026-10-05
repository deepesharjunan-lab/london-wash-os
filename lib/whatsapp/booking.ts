import { createAdminClient } from "@/lib/supabase/admin";
import { notify } from "@/lib/notify";
import { onCustomerCreated } from "@/lib/loyalty/ledger";
import { getSiteSettings } from "@/lib/site/settings";
import { availableSlots, distanceKm, findSlot } from "@/lib/pickup/slots";
import { sendButtons, sendList, sendText } from "./client";

// Book a pickup inside the WhatsApp chat (only while Website → Pickup & delivery is on):
//   location pin → area check → free time slots → (name, for new customers) → what to collect → booked.
// The customer's place in the chat is kept in whatsapp_contact.bot_flow for 30 minutes.
// Server-only. Each handler sends the next question and saves the new step.

type Step = "location" | "slot" | "name" | "service";
export type Flow = { step: Step; lat?: number; lng?: number; address?: string; slot?: string; slotEnd?: string; slotLabel?: string; name?: string; at: number };
type Customer = { id: string; full_name: string } | null;

const TTL = 30 * 60000;
const SERVICES = [
  { id: "svc_wash", title: "Wash & iron" },
  { id: "svc_dry", title: "Dry cleaning" },
  { id: "svc_mixed", title: "Mixed / not sure" },
];

export async function getFlow(waId: string): Promise<Flow | null> {
  const { data } = await createAdminClient().from("whatsapp_contact").select("bot_flow").eq("wa_id", waId).maybeSingle();
  const f = (data as { bot_flow: Flow | null } | null)?.bot_flow ?? null;
  return f && Date.now() - f.at < TTL ? f : null;
}

async function setFlow(waId: string, flow: Omit<Flow, "at"> | null) {
  await createAdminClient()
    .from("whatsapp_contact")
    .update({ bot_flow: flow ? { ...flow, at: Date.now() } : null })
    .eq("wa_id", waId);
}

export const clearFlow = (waId: string) => setFlow(waId, null);

/** "Book a pickup" from the menu. */
export async function startBooking(to: string) {
  await setFlow(to, { step: "location" });
  return sendText(
    to,
    "Let's book your pickup 🚚\n\n📍 Please share your pickup location: tap the 📎 (or +) button → *Location* → *Send your current location*.\n\nYou can also type your full address. Reply *cancel* to stop."
  );
}

/** Handles a message while the customer is in the booking chat. Returns true if it was part of the booking. */
export async function handleBooking(
  flow: Flow,
  m: { type: string; location?: { latitude: number; longitude: number; name?: string; address?: string } },
  input: { action: string | null; text: string },
  ctx: { from: string; customer: Customer; profileName?: string }
): Promise<boolean> {
  const { from } = ctx;
  const text = input.text.trim();
  if (!input.action && /^(cancel|stop booking|menu|exit)$/i.test(text)) {
    await clearFlow(from);
    if (/^menu$/i.test(text)) return false; // let the menu show
    await sendText(from, "Okay, the booking is cancelled. Type *menu* any time to start again.");
    return true;
  }
  const st = await getSiteSettings();
  if (!st.flags.pickup) {
    await clearFlow(from);
    return false;
  }

  // 1) Where to pick up.
  if (flow.step === "location") {
    if (m.type === "location" && m.location) {
      const { latitude: lat, longitude: lng, name, address } = m.location;
      const storeLat = Number(st.business.latitude), storeLng = Number(st.business.longitude);
      const km = Number.isFinite(storeLat) && Number.isFinite(storeLng) ? distanceKm(lat, lng, storeLat, storeLng) : 0;
      if (km > st.pickup.radius_km) {
        await clearFlow(from);
        await sendButtons(
          from,
          `Sorry, you're about ${Math.round(km)} km from our store, and we pick up within ${st.pickup.radius_km} km for now. You're very welcome to drop off at our Vettipuram store.`,
          [
            { id: "hours", title: "Store location" },
            { id: "staff", title: "Talk to our team" },
          ]
        );
        return true;
      }
      const place = [name, address].filter(Boolean).join(", ") || `Location pin (${lat.toFixed(5)}, ${lng.toFixed(5)})`;
      return offerSlots(from, { step: "slot", lat, lng, address: place }, `You're in our pickup area ✅ (about ${Math.max(1, Math.round(km))} km from our store).`);
    }
    if (m.type === "text" && text.length >= 12) {
      return offerSlots(from, { step: "slot", address: text.slice(0, 300) }, "Thanks! We've noted your address.");
    }
    await sendText(from, "Please share your location pin (📎 → Location), or type your full address with a landmark. Reply *cancel* to stop.");
    return true;
  }

  // 2) Which time.
  if (flow.step === "slot") {
    if (!input.action?.startsWith("slot_")) {
      return offerSlots(from, flow, "Please choose a time from the list.");
    }
    const slot = await findSlot(st.pickup, input.action.slice(5));
    if (!slot) return offerSlots(from, flow, "Sorry, that time was just taken. Here are the times still free:");
    const next: Omit<Flow, "at"> = { ...flow, slot: slot.start, slotEnd: slot.end, slotLabel: slot.label };
    if (!ctx.customer) {
      await setFlow(from, { ...next, step: "name" });
      await sendText(from, `${slot.label} it is. What name should we book it under?`);
      return true;
    }
    await setFlow(from, { ...next, step: "service" });
    await sendButtons(from, `${slot.label} it is. What are we picking up?`, SERVICES);
    return true;
  }

  // 3) Name (new customers).
  if (flow.step === "name") {
    if (text.length < 2 || input.action) {
      await sendText(from, "Please type your name.");
      return true;
    }
    await setFlow(from, { ...flow, step: "service", name: text.slice(0, 80) });
    await sendButtons(from, `Thanks, ${text.split(" ")[0]}! What are we picking up?`, SERVICES);
    return true;
  }

  // 4) What to collect → book.
  if (flow.step === "service") {
    const svc = SERVICES.find((s) => s.id === input.action);
    if (!svc) {
      await sendButtons(from, "Please tap one of these:", SERVICES);
      return true;
    }
    return book(from, flow, svc.title, ctx);
  }
  return false;
}

async function offerSlots(to: string, flow: Omit<Flow, "at">, intro: string) {
  const st = await getSiteSettings();
  const near = flow.lat != null && flow.lng != null ? { lat: flow.lat, lng: flow.lng } : null;
  const slots = (await availableSlots(st.pickup, near)).slice(0, 10);
  if (!slots.length) {
    await clearFlow(to);
    await sendButtons(to, `${intro}\n\nSorry, all pickup times for the next ${st.pickup.days_ahead} days are full. Tap below and our team will find a time with you.`, [
      { id: "staff", title: "Talk to our team" },
      { id: "menu", title: "Main menu" },
    ]);
    return true;
  }
  await setFlow(to, { ...flow, step: "slot" });
  await sendList(
    to,
    `${intro}\n\nWhen should we come? Choose a pickup time:`,
    "Pickup times",
    slots.map((s) => ({
      id: `slot_${s.start}`,
      title: s.label.slice(0, 24),
      description: s.nearby ? "🟢 We're already in your area" : s.left === 1 ? "Last spot" : `${s.left} spots left`,
    }))
  );
  return true;
}

async function book(to: string, flow: Flow, service: string, ctx: { from: string; customer: Customer; profileName?: string }) {
  const db = createAdminClient();
  const st = await getSiteSettings();
  const slot = flow.slot ? await findSlot(st.pickup, flow.slot) : null;
  if (!slot) return offerSlots(to, { ...flow, step: "slot" }, "Sorry, that time was just taken. Here are the times still free:");

  // Customer (new customers are added with their WhatsApp number).
  let customer = ctx.customer;
  if (!customer) {
    const { data: branch } = await db.from("branch").select("id").limit(1).maybeSingle();
    const { data: created, error } = await db
      .from("customer")
      .insert({ branch_id: (branch as { id: string } | null)?.id ?? null, full_name: flow.name || ctx.profileName || "WhatsApp customer", phone: "+" + to, tier: "Silver" })
      .select("id, full_name")
      .single();
    if (error || !created) {
      await clearFlow(to);
      await sendButtons(to, "Sorry, something went wrong saving your booking. Tap below and our team will book it for you.", [{ id: "staff", title: "Talk to our team" }]);
      return true;
    }
    customer = created as { id: string; full_name: string };
    await onCustomerCreated(db as any, customer.id); // Club wallet + welcome bonus; never throws
  }

  const { data: addr } = await db
    .from("customer_address")
    .insert({ customer_id: customer.id, label: "WhatsApp", address_line: flow.address ?? "Shared on WhatsApp", latitude: flow.lat ?? null, longitude: flow.lng ?? null, is_default: false })
    .select("id")
    .single();
  const { error } = await db.from("pickup").insert({
    customer_id: customer.id,
    customer_address_id: (addr as { id: string } | null)?.id ?? null,
    scheduled_window_start: slot.start,
    scheduled_window_end: slot.end,
    status: "scheduled",
    services: [service],
    notes: "Booked on WhatsApp",
    source: "whatsapp",
  });
  await clearFlow(to);
  if (error) {
    console.error("WhatsApp pickup booking failed", error.message);
    await sendButtons(to, "Sorry, something went wrong saving your booking. Tap below and our team will book it for you.", [{ id: "staff", title: "Talk to our team" }]);
    return true;
  }

  const map = flow.lat != null && flow.lng != null ? `\nhttps://maps.google.com/?q=${flow.lat},${flow.lng}` : "";
  await notify(
    { owners: true, roles: ["receptionist"] },
    {
      kind: "pickup_requested",
      title: "New pickup booked on WhatsApp",
      body: `${customer.full_name} · ${slot.label} · ${service}`,
      staffUrl: "/work",
      ownerUrl: "/delivery",
    }
  );
  // The confirmation is sent right here in the chat, so the "Pickup booked" automation isn't triggered (no double message).
  await sendText(
    to,
    `Booked ✅\n\n🚚 Pickup: *${slot.label}*\n📍 ${flow.address ?? "Your shared location"}${map}\n🧺 ${service}\n\nWe'll message you here before we arrive. Need to change something? Just reply here.`
  );
  return true;
}
