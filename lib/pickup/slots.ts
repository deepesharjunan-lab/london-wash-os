import { createAdminClient } from "@/lib/supabase/admin";
import type { PickupConfig, PickupWindow } from "@/lib/site/defs";

// Pickup time slots: the windows set in Website → Pickup booking settings,
// minus full ones (capacity per window) and ones too soon to reach.
// Used by the WhatsApp booking chat and the Club app. Server-only.

const IST = 330 * 60000;

export type Slot = { id: string; start: string; end: string; label: string; left: number; nearby: boolean };

const istDate = (ms: number) => new Date(ms + IST).toISOString().slice(0, 10); // yyyy-mm-dd in India
const at = (date: string, hhmm: string) => new Date(`${date}T${hhmm}:00+05:30`);
const hour = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  const h12 = ((h + 11) % 12) + 1;
  return `${h12}${m ? `:${String(m).padStart(2, "0")}` : ""}`;
};
const ampm = (hhmm: string) => (Number(hhmm.slice(0, 2)) < 12 ? "am" : "pm");

export function windowLabel(w: PickupWindow) {
  return ampm(w.start) === ampm(w.end) ? `${hour(w.start)}–${hour(w.end)} ${ampm(w.end)}` : `${hour(w.start)} ${ampm(w.start)}–${hour(w.end)} ${ampm(w.end)}`;
}

export function dayLabel(date: string, now = Date.now()) {
  if (date === istDate(now)) return "Today";
  if (date === istDate(now + 864e5)) return "Tomorrow";
  return new Date(`${date}T12:00:00+05:30`).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "Asia/Kolkata" });
}

/** Distance in km between two points (straight line). */
export function distanceKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const r = (d: number) => (d * Math.PI) / 180;
  const a = Math.sin(r(lat2 - lat1) / 2) ** 2 + Math.cos(r(lat1)) * Math.cos(r(lat2)) * Math.sin(r(lng2 - lng1) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(a));
}

/** Free slots from now, soonest first. `near` (customer location) marks slots where a pickup nearby is already booked. */
export async function availableSlots(cfg: PickupConfig, near?: { lat: number; lng: number } | null, now = Date.now()): Promise<Slot[]> {
  const candidates: { date: string; w: PickupWindow; start: Date; end: Date }[] = [];
  for (let d = 0; d < Math.max(1, cfg.days_ahead); d++) {
    const date = istDate(now + d * 864e5);
    const weekday = new Date(`${date}T12:00:00+05:30`).getUTCDay(); // 0 = Sunday
    for (const w of weekday === 0 ? cfg.sunday_windows : cfg.weekday_windows) {
      const start = at(date, w.start);
      if (start.getTime() < now + cfg.lead_minutes * 60000) continue;
      candidates.push({ date, w, start, end: at(date, w.end) });
    }
  }
  if (!candidates.length) return [];

  // Pickups already booked in that period (with their map pins, for the "nearby" hint).
  const { data } = await createAdminClient()
    .from("pickup")
    .select("scheduled_window_start, customer_address:customer_address_id(latitude, longitude)")
    .gte("scheduled_window_start", candidates[0].start.toISOString())
    .lte("scheduled_window_start", candidates[candidates.length - 1].start.toISOString())
    .neq("status", "cancelled");
  const booked = new Map<string, { lat: number | null; lng: number | null }[]>();
  for (const p of (data ?? []) as any[]) {
    const key = new Date(p.scheduled_window_start).toISOString();
    const a = Array.isArray(p.customer_address) ? p.customer_address[0] : p.customer_address;
    const list = booked.get(key) ?? [];
    list.push({ lat: a?.latitude != null ? Number(a.latitude) : null, lng: a?.longitude != null ? Number(a.longitude) : null });
    booked.set(key, list);
  }

  const slots: Slot[] = [];
  for (const c of candidates) {
    const there = booked.get(c.start.toISOString()) ?? [];
    const left = cfg.capacity - there.length;
    if (left <= 0) continue;
    const nearby = !!near && there.some((b) => b.lat != null && b.lng != null && distanceKm(near.lat, near.lng, b.lat, b.lng) <= 3);
    slots.push({ id: c.start.toISOString(), start: c.start.toISOString(), end: c.end.toISOString(), label: `${dayLabel(c.date, now)} ${windowLabel(c.w)}`, left, nearby });
  }
  return slots;
}

/** Is this slot (by start time) still bookable? Returns the slot or null. */
export async function findSlot(cfg: PickupConfig, startIso: string): Promise<Slot | null> {
  const slots = await availableSlots(cfg);
  return slots.find((s) => s.start === new Date(startIso).toISOString()) ?? null;
}
