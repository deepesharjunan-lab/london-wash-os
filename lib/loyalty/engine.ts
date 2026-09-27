// London Wash Club rules engine. Pure functions: every threshold, rate and
// multiplier comes from the config and tier rows the admin edits in
// /club, never from constants in code.

export type ClubConfig = {
  id: string;
  qualification_mode: "spend" | "orders" | "combo";
  qualification_period_months: number;
  renewal_period_months: number;
  downgrade_grace_days: number;
  family_orders_count: boolean;
  spend_per_point_minor: number;
  point_value_minor: number;
  points_expiry_months: number;
  max_redeem_pct: number;
  redeem_step_points: number;
  points_available_on: "delivered" | "paid";
  bonus_welcome_points: number;
  bonus_review_points: number;
  review_window_days: number;
  bonus_app_order_points: number;
  bonus_pickup_points: number;
  bonus_festival_points: number;
  referral_give_minor: number;
  referral_get_minor: number;
  referral_min_first_order_minor: number;
  referral_validity_days: number;
  referral_block_same_household: boolean;
  referral_block_same_device: boolean;
  birthday_perk: string;
  delivery_fee_minor: number;
  free_delivery_above_minor: number;
};

export type ClubTier = {
  id: string;
  name: string;
  min_spend_minor: number;
  min_orders: number;
  points_multiplier: number;
  birthday_points: number;
  free_delivery_above_minor: number | null;
  priority_processing: boolean;
  turnaround_hours: number | null;
  sort_order: number;
  card_style: string | null;
  perk_description: string | null;
};

export type Qualifying = { spend: number; orders: number };

export const TIER_COLORS: Record<string, string> = {
  prestige: "#cdbfa5",
  elite: "#7f8fa0",
  signature: "#2e4470",
  sovereign: "#a48a5b",
};
export const tierColor = (t: ClubTier) => TIER_COLORS[t.card_style || ""] || "#9a8358";

export function inr(minor: number) {
  const neg = minor < 0;
  const v = Math.round(Math.abs(minor) / 100).toLocaleString("en-IN");
  return `${neg ? "−" : ""}₹${v}`;
}
export const num = (n: number) => Math.round(n).toLocaleString("en-IN");
export const mult = (m: number) => `${Math.round(Number(m) * 100) / 100}×`;

export function meets(cfg: ClubConfig, q: Qualifying, t: ClubTier) {
  if (cfg.qualification_mode === "spend") return q.spend >= t.min_spend_minor;
  if (cfg.qualification_mode === "orders") return q.orders >= t.min_orders;
  return q.spend >= t.min_spend_minor && q.orders >= t.min_orders;
}

/** Index into tiers (sorted by sort_order) of the highest tier the member meets. */
export function tierIndex(cfg: ClubConfig, tiers: ClubTier[], q: Qualifying) {
  let idx = 0;
  tiers.forEach((t, i) => {
    if (meets(cfg, q, t)) idx = i;
  });
  return idx;
}

export function gapToNext(cfg: ClubConfig, tiers: ClubTier[], q: Qualifying) {
  const idx = tierIndex(cfg, tiers, q);
  const next = tiers[idx + 1];
  if (!next) return { idx, next: null, spend: 0, orders: 0, pct: 1, text: "Top tier" };
  const spend = Math.max(0, next.min_spend_minor - q.spend);
  const orders = Math.max(0, next.min_orders - q.orders);
  const ps = next.min_spend_minor ? Math.min(1, q.spend / next.min_spend_minor) : 1;
  const po = next.min_orders ? Math.min(1, q.orders / next.min_orders) : 1;
  const pct = cfg.qualification_mode === "spend" ? ps : cfg.qualification_mode === "orders" ? po : Math.min(ps, po);
  const parts: string[] = [];
  if (cfg.qualification_mode !== "orders" && spend > 0) parts.push(inr(spend));
  if (cfg.qualification_mode !== "spend" && orders > 0) parts.push(`${orders} order${orders === 1 ? "" : "s"}`);
  return { idx, next, spend, orders, pct, text: parts.length ? `${parts.join(" + ")} to ${next.name}` : `Qualifies for ${next.name}` };
}

/** Points for an order total, before campaigns: base x tier multiplier + app/pickup bonuses. */
export function orderPoints(cfg: ClubConfig, tier: ClubTier, totalMinor: number, opts?: { app?: boolean; pickup?: boolean }) {
  const base = Math.floor(totalMinor / cfg.spend_per_point_minor);
  let pts = Math.floor(base * Number(tier.points_multiplier));
  if (opts?.app) pts += cfg.bonus_app_order_points;
  if (opts?.pickup) pts += cfg.bonus_pickup_points;
  pts += cfg.bonus_festival_points;
  return pts;
}

export function campaignStatus(c: { is_enabled: boolean; starts_on: string; ends_on: string }, today = new Date()) {
  const d = today.toISOString().slice(0, 10);
  if (!c.is_enabled) return "off";
  if (c.starts_on > d) return "scheduled";
  if (c.ends_on < d) return "ended";
  return "live";
}

export const TEMPLATE_VARS = [
  "{first_name}", "{tier}", "{next_tier}", "{gap}", "{points}",
  "{expiring_points}", "{expiry_date}", "{order_no}", "{slot}", "{review_points}",
];
export function fillTemplate(t: string, vars: Record<string, string>) {
  return t.replace(/\{(\w+)\}/g, (m, k) => (vars[k] !== undefined ? vars[k] : m));
}
