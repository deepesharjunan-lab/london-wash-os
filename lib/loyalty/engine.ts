// London Wash Club rules engine. Pure functions: every threshold, rate,
// multiplier, cap and stacking rule comes from the config, tier and campaign
// rows the admin edits in /club, never from constants in code.

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
  points_display_decimals: number;
  min_redeem_balance: number;
  redemption_denominations: number[];
  max_points_per_order: number | null;
  max_promo_points_per_order: number | null;
  bonus_referral_points: number;
  bonus_referral_friend_points: number;
  bonus_tier_upgrade_points: number;
  expiry_warning_days: number;
  expiry_reminder_days: number[];
  app_order_channels: string[];
  eligible_service_ids: string[];
  excluded_item_ids: string[];
  campaigns_stack: boolean;
  birthday_stacks_with_campaigns: boolean;
  reverse_on_cancel: boolean;
  reverse_on_refund: boolean;
  allow_negative_balance: boolean;
  earning_starts_on: string;
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

export type ClubCampaign = {
  id: string;
  name: string;
  occasion: string | null;
  campaign_type: "multiplier" | "bonus";
  multiplier: number;
  bonus_points: number;
  min_order_minor: number;
  service_ids: string[] | null;
  min_tier_id: string | null;
  starts_on: string;
  ends_on: string;
  is_enabled: boolean;
  max_bonus_points: number | null;
  stackable: boolean;
};

export type Qualifying = { spend: number; orders: number };

export const TIER_COLORS: Record<string, string> = {
  prestige: "#cdbfa5",
  elite: "#7f8fa0",
  signature: "#2e4470",
  sovereign: "#a48a5b",
};
export const tierColor = (t: ClubTier) => TIER_COLORS[t.card_style || ""] || "#9a8358";

/** Round to 2 decimals, the precision the ledger stores. */
export const r2 = (n: number) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

export function inr(minor: number) {
  const neg = minor < 0;
  const v = Math.round(Math.abs(minor) / 100).toLocaleString("en-IN");
  return `${neg ? "−" : ""}₹${v}`;
}
export const num = (n: number) => Math.round(n).toLocaleString("en-IN");
export const mult = (m: number) => `${Math.round(Number(m) * 100) / 100}×`;
/** Points shown with the admin's display rule (0 to 2 decimals). */
export function pts(cfg: Pick<ClubConfig, "points_display_decimals"> | null, n: number) {
  const d = cfg?.points_display_decimals ?? 1;
  return Number(n).toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: d });
}
/** Rupee value (in paise) of a number of points. */
export const pointsValueMinor = (cfg: ClubConfig, points: number) => Math.round(points * cfg.point_value_minor);

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

export function campaignStatus(c: { is_enabled: boolean; starts_on: string; ends_on: string }, today = new Date()) {
  const d = today.toISOString().slice(0, 10);
  if (!c.is_enabled) return "off";
  if (c.starts_on > d) return "scheduled";
  if (c.ends_on < d) return "ended";
  return "live";
}

export type EarningLine = { label: string; points: number };
export type Earning = {
  eligibleMinor: number;
  basePoints: number;          // eligible / spend-per-point
  tierMultiplier: number;
  tierPoints: number;          // base x tier multiplier
  campaignMultiplier: number;  // combined multiplier from campaigns (1 = none)
  campaignNames: string[];
  campaignExtra: number;       // extra points from multiplier campaigns, after caps
  campaignBonus: number;       // flat bonus-campaign points, after caps
  total: number;
  lines: EarningLine[];
};

/**
 * Points for an order's eligible spend.
 * base = eligible / spend-per-point; tier points = base x tier multiplier;
 * a multiplier campaign multiplies the tier points on the services it covers
 * (Signature 1.5x during a 2x campaign = 3 points per Rs 100). Bonus campaigns
 * add flat points. Caps: campaign max bonus, max promo points per order, max
 * points per order. Stacking: with campaigns_stack off, only the best
 * non-stackable campaign applies, plus any marked stackable.
 */
export function computeEarning(
  cfg: ClubConfig,
  tiers: ClubTier[],
  tier: ClubTier,
  campaigns: ClubCampaign[],
  ctx: { eligibleMinor: number; eligibleByService: Record<string, number>; orderDate: string; skipBirthdayCampaigns?: boolean }
): Earning {
  const lines: EarningLine[] = [];
  const unit = cfg.spend_per_point_minor;
  const basePoints = r2(ctx.eligibleMinor / unit);
  const tierMult = Number(tier.points_multiplier) || 1;
  const tierPoints = r2(basePoints * tierMult);
  lines.push({ label: `${inr(ctx.eligibleMinor)} eligible spend ÷ ${inr(unit)} = ${basePoints} base points`, points: basePoints });
  if (tierMult !== 1) lines.push({ label: `${tier.name} multiplier ${mult(tierMult)}`, points: r2(tierPoints - basePoints) });

  const tierIdx = tiers.findIndex((t) => t.id === tier.id);
  const day = ctx.orderDate.slice(0, 10);
  const eligible = campaigns.filter((c) => {
    if (!c.is_enabled || c.starts_on > day || c.ends_on < day) return false;
    if (c.min_tier_id) {
      const need = tiers.findIndex((t) => t.id === c.min_tier_id);
      if (need > tierIdx) return false;
    }
    if (ctx.eligibleMinor < (Number(c.min_order_minor) || 0)) return false;
    if (ctx.skipBirthdayCampaigns && /birthday/i.test(`${c.occasion ?? ""} ${c.name}`)) return false;
    const svc = c.service_ids ?? [];
    if (svc.length && !svc.some((s) => (ctx.eligibleByService[s] ?? 0) > 0)) return false;
    return true;
  });

  // Extra points a campaign would add on its own, before caps.
  const effect = (c: ClubCampaign) => {
    if (c.campaign_type === "bonus") return Number(c.bonus_points) || 0;
    const svc = c.service_ids ?? [];
    const scope = svc.length ? svc.reduce((a, s) => a + (ctx.eligibleByService[s] ?? 0), 0) : ctx.eligibleMinor;
    return r2((scope / unit) * tierMult * ((Number(c.multiplier) || 1) - 1));
  };
  let applied: ClubCampaign[] = eligible;
  if (!cfg.campaigns_stack) {
    const stackable = eligible.filter((c) => c.stackable);
    const others = eligible.filter((c) => !c.stackable).sort((a, b) => effect(b) - effect(a));
    applied = [...stackable, ...others.slice(0, 1)];
  }

  let campaignExtra = 0;
  let campaignBonus = 0;
  let campaignMultiplier = 1;
  const campaignNames: string[] = [];
  for (const c of applied) {
    let extra = effect(c);
    if (c.max_bonus_points !== null && c.max_bonus_points !== undefined) extra = Math.min(extra, Number(c.max_bonus_points));
    extra = r2(extra);
    if (extra <= 0) continue;
    campaignNames.push(c.name);
    if (c.campaign_type === "multiplier") {
      campaignMultiplier = r2(campaignMultiplier * (Number(c.multiplier) || 1));
      campaignExtra = r2(campaignExtra + extra);
      lines.push({ label: `${c.name} ${mult(Number(c.multiplier))} on top of your tier rate`, points: extra });
    } else {
      campaignBonus = r2(campaignBonus + extra);
      lines.push({ label: `${c.name} bonus`, points: extra });
    }
  }

  if (cfg.max_promo_points_per_order !== null && cfg.max_promo_points_per_order !== undefined) {
    const promo = campaignExtra + campaignBonus;
    const cap = Number(cfg.max_promo_points_per_order);
    if (promo > cap) {
      const scale = cap / promo;
      campaignExtra = r2(campaignExtra * scale);
      campaignBonus = r2(campaignBonus * scale);
      lines.push({ label: `Promotional points capped at ${cap} per order`, points: r2(cap - promo) });
    }
  }

  let total = r2(tierPoints + campaignExtra + campaignBonus);
  if (cfg.max_points_per_order !== null && cfg.max_points_per_order !== undefined && total > Number(cfg.max_points_per_order)) {
    const cap = Number(cfg.max_points_per_order);
    lines.push({ label: `Capped at ${cap} points per order`, points: r2(cap - total) });
    total = cap;
  }
  return {
    eligibleMinor: ctx.eligibleMinor,
    basePoints,
    tierMultiplier: tierMult,
    tierPoints,
    campaignMultiplier,
    campaignNames,
    campaignExtra,
    campaignBonus,
    total: Math.max(0, total),
    lines,
  };
}

/** Quick estimate used for the preview sentences in the admin. */
export function orderPoints(cfg: ClubConfig, tier: ClubTier, totalMinor: number) {
  return r2((totalMinor / cfg.spend_per_point_minor) * Number(tier.points_multiplier));
}

export const TEMPLATE_VARS = [
  "{first_name}", "{tier}", "{next_tier}", "{gap}", "{points}",
  "{expiring_points}", "{expiry_date}", "{order_no}", "{slot}", "{review_points}",
];
export function fillTemplate(t: string, vars: Record<string, string>) {
  return t.replace(/\{(\w+)\}/g, (m, k) => (vars[k] !== undefined ? vars[k] : m));
}
