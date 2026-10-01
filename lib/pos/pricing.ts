import type { SupabaseClient } from "@supabase/supabase-js";

// Coupon codes (Sales → Coupons & Promotions) and manual discounts for orders.
// Server-only.

type Supa = SupabaseClient<any, "public", any>;
const one = <T,>(x: T | T[] | null | undefined): T | null => (Array.isArray(x) ? x[0] ?? null : x ?? null);

export type CouponResult = { ok: true; couponId: string; code: string; label: string; discountMinor: number } | { ok: false; error: string };

/** Checks a coupon code against an order subtotal and works out its discount. */
export async function validateCoupon(supabase: Supa, rawCode: string, subtotalMinor: number): Promise<CouponResult> {
  const code = String(rawCode ?? "").replace(/[%_\s]/g, "").toUpperCase().slice(0, 40); // no wildcards in a code
  if (!code) return { ok: false, error: "Enter a coupon code." };
  const { data } = await supabase
    .from("coupon")
    .select("id, code, is_active, deleted_at, max_redemptions, redemptions_count, promotion:promotion_id(name, discount_percent, discount_amount_minor, starts_at, ends_at, is_active, deleted_at)")
    .ilike("code", code)
    .maybeSingle();
  const c = data as any;
  if (!c || c.deleted_at || !c.is_active) return { ok: false, error: `Coupon ${code} isn't valid.` };
  if (c.max_redemptions != null && Number(c.redemptions_count) >= Number(c.max_redemptions)) return { ok: false, error: `Coupon ${code} has been fully used.` };
  const p = one<any>(c.promotion);
  if (!p || p.deleted_at || !p.is_active) return { ok: false, error: `Coupon ${code} isn't linked to an active offer.` };
  const now = Date.now();
  if (p.starts_at && new Date(p.starts_at).getTime() > now) return { ok: false, error: `Coupon ${code} isn't active yet.` };
  if (p.ends_at && new Date(p.ends_at).getTime() < now) return { ok: false, error: `Coupon ${code} has expired.` };
  const pct = Number(p.discount_percent) || 0;
  const flat = Number(p.discount_amount_minor) || 0;
  const discountMinor = Math.min(subtotalMinor, pct > 0 ? Math.round((subtotalMinor * Math.min(pct, 100)) / 100) : flat);
  if (discountMinor <= 0) return { ok: false, error: `Coupon ${code} gives no discount on this order.` };
  return { ok: true, couponId: c.id, code: c.code, label: `${p.name} (${pct > 0 ? `${pct}%` : `₹${Math.round(flat / 100)}`})`, discountMinor };
}

export type ManualDiscount = { kind: "percent" | "amount"; value: number; note?: string | null };

/** A manual discount in paise, never more than what's left. */
export function manualDiscountMinor(d: ManualDiscount | null | undefined, baseMinor: number) {
  if (!d || !(Number(d.value) > 0)) return 0;
  const v = Number(d.value);
  const minor = d.kind === "percent" ? Math.round((baseMinor * Math.min(v, 100)) / 100) : Math.round(v * 100);
  return Math.max(0, Math.min(baseMinor, minor));
}

export type Charge = { label: string; amount_minor: number };

/** Cleans the additional charges sent from the POS (max 10, ₹0–₹1,00,000 each). */
export function cleanCharges(list: Charge[] | null | undefined): Charge[] {
  return (list ?? [])
    .map((c) => ({ label: String(c?.label ?? "").trim().slice(0, 60), amount_minor: Math.round(Number(c?.amount_minor) || 0) }))
    .filter((c) => c.label && c.amount_minor > 0 && c.amount_minor <= 10_000_000)
    .slice(0, 10);
}
