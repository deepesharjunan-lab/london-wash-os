import type { SupabaseClient } from "@supabase/supabase-js";
import { computeEarning, pointsValueMinor, r2, tierIndex } from "./engine";
import type { ClubCampaign, ClubConfig, ClubTier, Earning } from "./engine";
import { loadConfig, loadTiers } from "./data";

// Points ledger service. loyalty_transaction is insert-only: every change of
// status (pending -> earned, cancelled, reversed, expired) is a NEW row linked
// to the original through related_transaction_id, so the full history can be
// audited. Once-only awards are guarded by a unique bonus_key per account.

// Works with the staff session client and with the service-role client
// (used by the nightly job and the customer app).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Supa = SupabaseClient<any, "public", any>;
type Status = "pending" | "earned" | "redeemed" | "expired" | "reversed" | "cancelled";
type Source =
  | "order" | "welcome" | "review" | "birthday" | "referral" | "campaign" | "reward" | "checkout"
  | "expiry" | "adjustment" | "tier_upgrade" | "app_order" | "pickup" | "reversal" | "cancel" | "release";

export type Account = {
  id: string;
  customer_id: string;
  loyalty_tier_id: string | null;
  points_balance: number;
  pending_balance: number;
  lifetime_points: number;
  redeemed_points: number;
  expired_points: number;
  reversed_points: number;
  member_no: string | null;
};

export type LedgerRow = {
  id: string;
  created_at: string;
  type: string;
  status: Status;
  source: Source | null;
  points: number;
  pending_points: number;
  balance_after: number;
  order_id: string | null;
  base_eligible_minor: number | null;
  tier_name: string | null;
  tier_multiplier: number | null;
  campaign_name: string | null;
  campaign_multiplier: number;
  bonus_points: number;
  points_redeemed: number;
  points_reversed: number;
  related_transaction_id: string | null;
  bonus_key: string | null;
  description: string | null;
  expires_at: string | null;
  breakdown: { label: string; points: number }[] | null;
};

const ACCOUNT_COLS = "id, customer_id, loyalty_tier_id, points_balance, pending_balance, lifetime_points, redeemed_points, expired_points, reversed_points, member_no";
const ACTIVE = ["confirmed", "in_production", "ready", "out_for_delivery"];
const TYPE_FOR: Record<Status, string> = { pending: "earn", earned: "earn", redeemed: "redeem", expired: "expire", reversed: "adjustment", cancelled: "adjustment" };

export type Ctx = { supabase: Supa; cfg: ClubConfig; tiers: ClubTier[]; userId?: string | null };

export async function loadCtx(supabase: Supa): Promise<Ctx | null> {
  const [cfg, tiers] = await Promise.all([loadConfig(supabase), loadTiers(supabase)]);
  if (!cfg || tiers.length === 0) return null;
  const { data: auth } = await supabase.auth.getUser();
  let userId: string | null = null;
  if (auth?.user) {
    const { data: me } = await supabase.from("user").select("id").eq("auth_user_id", auth.user.id).maybeSingle();
    userId = (me as { id: string } | null)?.id ?? null;
  }
  return { supabase, cfg: normalise(cfg), tiers, userId };
}

function normalise(cfg: ClubConfig): ClubConfig {
  return {
    ...cfg,
    redemption_denominations: cfg.redemption_denominations ?? [],
    expiry_reminder_days: cfg.expiry_reminder_days ?? [],
    app_order_channels: cfg.app_order_channels ?? [],
    eligible_service_ids: cfg.eligible_service_ids ?? [],
    excluded_item_ids: cfg.excluded_item_ids ?? [],
    max_points_per_order: cfg.max_points_per_order === null ? null : Number(cfg.max_points_per_order),
    max_promo_points_per_order: cfg.max_promo_points_per_order === null ? null : Number(cfg.max_promo_points_per_order),
  };
}

const addMonths = (d: Date, m: number) => {
  const x = new Date(d);
  x.setMonth(x.getMonth() + m);
  return x;
};

/* ------------------------------------------------------------------ */
/* Accounts                                                            */
/* ------------------------------------------------------------------ */

/** Qualifying spend/orders for one customer over the qualification period. */
export async function customerQualifying(ctx: Ctx, customerId: string) {
  const since = addMonths(new Date(), -ctx.cfg.qualification_period_months).toISOString();
  const { data } = await ctx.supabase
    .from("order")
    .select("total_minor")
    .eq("customer_id", customerId)
    .gte("created_at", since)
    .not("status", "in", "(draft,cancelled)");
  const rows = (data ?? []) as { total_minor: number }[];
  return { spend: rows.reduce((a, r) => a + (Number(r.total_minor) || 0), 0), orders: rows.length };
}

export async function getAccount(ctx: Ctx, customerId: string): Promise<Account | null> {
  const { data } = await ctx.supabase.from("loyalty_account").select(ACCOUNT_COLS).eq("customer_id", customerId).maybeSingle();
  return (data as Account | null) ?? null;
}

/**
 * Returns the customer's account, creating it if needed. New customers who
 * joined on or after the launch date get the welcome bonus once.
 */
export async function ensureAccount(ctx: Ctx, customerId: string): Promise<Account | null> {
  const existing = await getAccount(ctx, customerId);
  if (existing) return existing;
  const [{ data: cust }, q] = await Promise.all([
    ctx.supabase.from("customer").select("id, created_at").eq("id", customerId).maybeSingle(),
    customerQualifying(ctx, customerId),
  ]);
  if (!cust) return null;
  const tier = ctx.tiers[tierIndex(ctx.cfg, ctx.tiers, q)];
  const memberNo = `LWC ${customerId.replace(/-/g, "").slice(0, 4).toUpperCase()} ${customerId.replace(/-/g, "").slice(-4).toUpperCase()}`;
  const { data, error } = await ctx.supabase
    .from("loyalty_account")
    .insert({ customer_id: customerId, loyalty_tier_id: tier.id, points_balance: 0, member_no: memberNo, tier_since: new Date().toISOString().slice(0, 10) })
    .select(ACCOUNT_COLS)
    .single();
  if (error || !data) {
    // Another request may have created it first.
    return getAccount(ctx, customerId);
  }
  const acct = data as Account;
  const joined = String((cust as { created_at: string }).created_at).slice(0, 10);
  if (ctx.cfg.bonus_welcome_points > 0 && joined >= ctx.cfg.earning_starts_on) {
    await post(ctx, acct, {
      status: "earned", source: "welcome", points: ctx.cfg.bonus_welcome_points, bonus_points: ctx.cfg.bonus_welcome_points,
      bonus_key: "welcome", description: "New Member Bonus: welcome to The London Wash Club",
    });
  }
  return acct;
}

/** Call after a customer is created: opens their wallet and awards the New Member Bonus. Never throws. */
export async function onCustomerCreated(supabase: Supa, customerId: string) {
  try {
    const ctx = await loadCtx(supabase);
    if (ctx) await ensureAccount(ctx, customerId);
  } catch (e) {
    console.error("loyalty onCustomerCreated failed", e);
  }
}

/* ------------------------------------------------------------------ */
/* Posting                                                             */
/* ------------------------------------------------------------------ */

type PostInput = {
  status: Status;
  source: Source;
  points?: number;          // effect on available balance
  pending_points?: number;  // effect on pending balance
  order_id?: string | null;
  base_eligible_minor?: number | null;
  tier?: ClubTier | null;
  campaign_name?: string | null;
  campaign_multiplier?: number;
  bonus_points?: number;
  points_redeemed?: number;
  points_reversed?: number;
  related_transaction_id?: string | null;
  bonus_key?: string | null;
  description: string;
  breakdown?: { label: string; points: number }[] | null;
};

/** Insert one ledger row and update the account's running totals. Returns null if the once-only key already exists. */
export async function post(ctx: Ctx, acct: Account, p: PostInput): Promise<LedgerRow | null> {
  const points = r2(p.points ?? 0);
  const pending = r2(p.pending_points ?? 0);
  const balance = r2(Number(acct.points_balance) + points);
  const earnedExpiry = p.status === "earned" && points > 0 ? addMonths(new Date(), ctx.cfg.points_expiry_months).toISOString() : null;
  const { data, error } = await ctx.supabase
    .from("loyalty_transaction")
    .insert({
      loyalty_account_id: acct.id,
      customer_id: acct.customer_id,
      order_id: p.order_id ?? null,
      type: TYPE_FOR[p.status],
      status: p.status,
      source: p.source,
      points,
      pending_points: pending,
      balance_after: balance,
      base_eligible_minor: p.base_eligible_minor ?? null,
      tier_id: p.tier?.id ?? null,
      tier_name: p.tier?.name ?? null,
      tier_multiplier: p.tier ? Number(p.tier.points_multiplier) : null,
      campaign_name: p.campaign_name ?? null,
      campaign_multiplier: p.campaign_multiplier ?? 1,
      bonus_points: r2(p.bonus_points ?? 0),
      points_redeemed: r2(p.points_redeemed ?? 0),
      points_reversed: r2(p.points_reversed ?? 0),
      related_transaction_id: p.related_transaction_id ?? null,
      bonus_key: p.bonus_key ?? null,
      description: p.description,
      note: p.description,
      breakdown: p.breakdown ?? null,
      expires_at: earnedExpiry,
      created_by_user_id: ctx.userId ?? null,
    })
    .select("*")
    .single();
  if (error) {
    if (error.code !== "23505") console.error("loyalty post failed", error);
    return null;
  }
  // Points given back after a cancelled checkout undo a redemption; they aren't new lifetime points.
  const isReturn = p.status === "earned" && p.source === "checkout";
  const upd = {
    points_balance: balance,
    pending_balance: r2(Number(acct.pending_balance) + pending),
    lifetime_points: r2(Number(acct.lifetime_points) + (p.status === "earned" && points > 0 && !isReturn ? points : 0)),
    redeemed_points: r2(Number(acct.redeemed_points) + (p.status === "redeemed" ? -points : 0) - (isReturn ? points : 0)),
    expired_points: r2(Number(acct.expired_points) + (p.status === "expired" ? -points : 0)),
    reversed_points: r2(Number(acct.reversed_points) + (p.status === "reversed" ? -points : 0)),
  };
  await ctx.supabase.from("loyalty_account").update(upd).eq("id", acct.id);
  Object.assign(acct, upd);
  return data as LedgerRow;
}

/* ------------------------------------------------------------------ */
/* Orders                                                              */
/* ------------------------------------------------------------------ */

type OrderRow = {
  id: string;
  order_number: string;
  customer_id: string;
  status: string;
  channel: string;
  subtotal_minor: number;
  discount_minor: number;
  tax_minor: number;
  total_minor: number;
  loyalty_redeemed_minor: number;
  created_at: string;
};

/** Eligible spend: eligible services only, minus the proportional discount and points redeemed. GST/tax and fees are never included. */
export async function eligibleForOrder(ctx: Ctx, order: OrderRow) {
  const { data } = await ctx.supabase.from("order_item").select("service_id, item_id, line_total_minor").eq("order_id", order.id);
  const items = (data ?? []) as { service_id: string; item_id: string | null; line_total_minor: number }[];
  const allowed = ctx.cfg.eligible_service_ids;
  const excluded = new Set(ctx.cfg.excluded_item_ids);
  const itemsTotal = items.reduce((a, i) => a + (Number(i.line_total_minor) || 0), 0);
  const byService: Record<string, number> = {};
  let eligibleGross = 0;
  for (const i of items) {
    const v = Number(i.line_total_minor) || 0;
    if (v <= 0) continue; // complimentary lines earn nothing
    if (allowed.length && !allowed.includes(i.service_id)) continue;
    if (i.item_id && excluded.has(i.item_id)) continue;
    eligibleGross += v;
    byService[i.service_id] = (byService[i.service_id] ?? 0) + v;
  }
  const base = Math.max(itemsTotal, Number(order.subtotal_minor) || 0) || 1;
  // discount_minor already includes vouchers and points redeemed at checkout
  // (loyalty_redeemed_minor records the points part), so it's counted once.
  const deductions = Number(order.discount_minor) || 0;
  const factor = Math.max(0, 1 - deductions / base);
  const eligibleMinor = Math.round(eligibleGross * factor);
  for (const k of Object.keys(byService)) byService[k] = Math.round(byService[k] * factor);
  return { eligibleMinor, byService };
}

async function loadCampaigns(ctx: Ctx): Promise<ClubCampaign[]> {
  const { data } = await ctx.supabase
    .from("loyalty_campaign")
    .select("id, name, occasion, campaign_type, multiplier, bonus_points, min_order_minor, service_ids, min_tier_id, starts_on, ends_on, is_enabled, max_bonus_points, stackable")
    .is("deleted_at", null)
    .eq("is_enabled", true);
  return (data ?? []) as ClubCampaign[];
}

async function tierForAccount(ctx: Ctx, acct: Account) {
  const t = ctx.tiers.find((x) => x.id === acct.loyalty_tier_id);
  if (t) return t;
  const q = await customerQualifying(ctx, acct.customer_id);
  return ctx.tiers[tierIndex(ctx.cfg, ctx.tiers, q)];
}

async function orderRows(ctx: Ctx, orderId: string) {
  const { data } = await ctx.supabase
    .from("loyalty_transaction")
    .select("id, status, source, points, pending_points, bonus_key, points_reversed")
    .eq("order_id", orderId);
  return (data ?? []) as { id: string; status: Status; source: Source; points: number; pending_points: number; bonus_key: string | null; points_reversed: number }[];
}

export async function calculateOrder(ctx: Ctx, order: OrderRow, acct: Account): Promise<{ earning: Earning; tier: ClubTier }> {
  const [tier, elig, campaigns] = await Promise.all([tierForAccount(ctx, acct), eligibleForOrder(ctx, order), loadCampaigns(ctx)]);
  let skipBirthday = false;
  if (!ctx.cfg.birthday_stacks_with_campaigns) {
    const { data } = await ctx.supabase
      .from("loyalty_transaction")
      .select("id")
      .eq("loyalty_account_id", acct.id)
      .eq("bonus_key", `birthday:${new Date().getFullYear()}`)
      .maybeSingle();
    skipBirthday = !!data;
  }
  const earning = computeEarning(ctx.cfg, ctx.tiers, tier, campaigns, {
    eligibleMinor: elig.eligibleMinor,
    eligibleByService: elig.byService,
    orderDate: order.created_at,
    skipBirthdayCampaigns: skipBirthday,
  });
  return { earning, tier };
}

const ORDER_COLS = "id, order_number, customer_id, status, channel, subtotal_minor, discount_minor, tax_minor, total_minor, loyalty_redeemed_minor, created_at";

/**
 * Call after an order's status changes. Never throws: loyalty problems must
 * not block the order workflow.
 *  - confirmed / in production / ready / out for delivery -> Pending points
 *  - delivered -> Pending becomes Earned (+ app, pickup, referral, upgrade, birthday)
 *  - cancelled -> Pending is cancelled, or Earned points are reversed
 */
export async function onOrderStatus(supabase: Supa, orderId: string, status: string) {
  try {
    const ctx = await loadCtx(supabase);
    if (!ctx) return;
    const { data } = await supabase.from("order").select(ORDER_COLS).eq("id", orderId).maybeSingle();
    if (!data) return;
    const order = data as OrderRow;
    const today = new Date().toISOString().slice(0, 10);
    const rows = await orderRows(ctx, orderId);
    const find = (key: string) => rows.find((r) => r.bonus_key === key);
    const pending = find(`order:${orderId}:pending`);
    const earned = find(`order:${orderId}:earned`);
    const closed = find(`order:${orderId}:cancelled`);

    if (ACTIVE.includes(status) && !pending && !earned && today >= ctx.cfg.earning_starts_on) {
      const acct = await ensureAccount(ctx, order.customer_id);
      if (!acct) return;
      const { earning, tier } = await calculateOrder(ctx, order, acct);
      if (earning.total <= 0) return;
      await post(ctx, acct, {
        status: "pending", source: "order", pending_points: earning.total, order_id: orderId,
        base_eligible_minor: earning.eligibleMinor, tier, campaign_name: earning.campaignNames.join(", ") || null,
        campaign_multiplier: earning.campaignMultiplier, bonus_points: r2(earning.campaignExtra + earning.campaignBonus),
        bonus_key: `order:${orderId}:pending`, breakdown: earning.lines,
        description: `Order ${order.order_number}: points pending until delivery`,
      });
      return;
    }

    if (status === "delivered" && !earned && today >= ctx.cfg.earning_starts_on) {
      const acct = await ensureAccount(ctx, order.customer_id);
      if (!acct) return;
      const { earning, tier } = await calculateOrder(ctx, order, acct);
      const pendingAmt = pending && !closed ? Number(pending.pending_points) : 0;
      if (earning.total > 0 || pendingAmt > 0) {
        await post(ctx, acct, {
          status: "earned", source: "order", points: earning.total, pending_points: -pendingAmt, order_id: orderId,
          base_eligible_minor: earning.eligibleMinor, tier, campaign_name: earning.campaignNames.join(", ") || null,
          campaign_multiplier: earning.campaignMultiplier, bonus_points: r2(earning.campaignExtra + earning.campaignBonus),
          related_transaction_id: pending?.id ?? null, bonus_key: `order:${orderId}:earned`, breakdown: earning.lines,
          description: `Order ${order.order_number}: ${earning.eligibleMinor ? `₹${Math.round(earning.eligibleMinor / 100).toLocaleString("en-IN")} eligible spend` : "completed"}`,
        });
      }
      // Channel and service bonuses tied to this order.
      if (ctx.cfg.bonus_app_order_points > 0 && ctx.cfg.app_order_channels.includes(order.channel)) {
        await post(ctx, acct, {
          status: "earned", source: "app_order", points: ctx.cfg.bonus_app_order_points, bonus_points: ctx.cfg.bonus_app_order_points,
          order_id: orderId, bonus_key: `app:${orderId}`, description: `App Order Bonus: ${order.order_number}`,
        });
      }
      if (ctx.cfg.bonus_pickup_points > 0) {
        const [{ data: pu }, { data: dl }] = await Promise.all([
          supabase.from("pickup").select("id").eq("order_id", orderId).eq("status", "completed").limit(1),
          supabase.from("delivery").select("id").eq("order_id", orderId).eq("status", "completed").limit(1),
        ]);
        if ((pu ?? []).length && (dl ?? []).length) {
          await post(ctx, acct, {
            status: "earned", source: "pickup", points: ctx.cfg.bonus_pickup_points, bonus_points: ctx.cfg.bonus_pickup_points,
            order_id: orderId, bonus_key: `pickup:${orderId}`, description: `Pickup & Delivery Bonus: ${order.order_number}`,
          });
        }
      }
      await checkTierUpgrade(ctx, acct);
      await checkReferral(ctx, order);
      await settleAccount(ctx, acct);
      return;
    }

    if (status === "cancelled") {
      const acct = await getAccount(ctx, order.customer_id);
      if (!acct) return;
      if (pending && !earned && !closed) {
        await post(ctx, acct, {
          status: "cancelled", source: "cancel", pending_points: -Number(pending.pending_points), order_id: orderId,
          related_transaction_id: pending.id, bonus_key: `order:${orderId}:cancelled`,
          description: `Order ${order.order_number} cancelled: pending points removed`,
        });
      }
      if (earned && ctx.cfg.reverse_on_cancel) {
        await reverseOrder(ctx, acct, order, 1, `order:${orderId}:reversed`, `Order ${order.order_number} cancelled: points reversed`);
      }
      // Give back points spent on this order at checkout, and reopen any voucher used.
      const spent = find(`checkout:${orderId}`);
      if (spent) {
        await post(ctx, acct, {
          status: "earned", source: "checkout", points: -Number(spent.points), related_transaction_id: spent.id,
          order_id: orderId, bonus_key: `checkout_return:${orderId}`,
          description: `Order ${order.order_number} cancelled: redeemed points returned`,
        });
      }
      await supabase.from("reward_voucher").update({ status: "active", used_order_id: null, used_at: null }).eq("used_order_id", orderId);
    }
  } catch (e) {
    console.error("loyalty onOrderStatus failed", e);
  }
}

/** Reverse a share (0..1) of what an order earned, including its order-linked bonuses. */
async function reverseOrder(ctx: Ctx, acct: Account, order: OrderRow, share: number, key: string, description: string) {
  const rows = await orderRows(ctx, order.id);
  const earnedTotal = rows.filter((r) => r.status === "earned").reduce((a, r) => a + Number(r.points), 0);
  const alreadyReversed = rows.filter((r) => r.status === "reversed").reduce((a, r) => a - Number(r.points), 0);
  let amount = r2(Math.min(earnedTotal * share, earnedTotal - alreadyReversed));
  if (amount <= 0) return;
  if (!ctx.cfg.allow_negative_balance) amount = Math.min(amount, Math.max(0, Number(acct.points_balance)));
  if (amount <= 0) return;
  const earnedRow = rows.find((r) => r.bonus_key === `order:${order.id}:earned`);
  await post(ctx, acct, {
    status: "reversed", source: "reversal", points: -amount, points_reversed: amount, order_id: order.id,
    related_transaction_id: earnedRow?.id ?? null, bonus_key: key, description,
  });
}

/** Call after a refund is recorded. Reverses points in proportion to the refunded share of the order. */
export async function onRefund(supabase: Supa, refundId: string, paymentId: string, refundMinor: number) {
  try {
    const ctx = await loadCtx(supabase);
    if (!ctx || !ctx.cfg.reverse_on_refund) return;
    const { data: pay } = await supabase.from("payment").select("order_id").eq("id", paymentId).maybeSingle();
    const orderId = (pay as { order_id: string } | null)?.order_id;
    if (!orderId) return;
    const { data } = await supabase.from("order").select(ORDER_COLS).eq("id", orderId).maybeSingle();
    if (!data) return;
    const order = data as OrderRow;
    const acct = await getAccount(ctx, order.customer_id);
    if (!acct) return;
    const total = Number(order.total_minor) || 0;
    const share = total > 0 ? Math.min(1, refundMinor / total) : 1;
    await reverseOrder(ctx, acct, order, share, `refund:${refundId}`, `Refund on order ${order.order_number}: points reversed`);
  } catch (e) {
    console.error("loyalty onRefund failed", e);
  }
}

/** Call after a payment. Pays out the referral bonus once a referred customer's first order is delivered and paid. */
export async function onPayment(supabase: Supa, orderId: string) {
  try {
    const ctx = await loadCtx(supabase);
    if (!ctx) return;
    const { data } = await supabase.from("order").select(ORDER_COLS).eq("id", orderId).maybeSingle();
    if (data && (data as OrderRow).status === "delivered") await checkReferral(ctx, data as OrderRow);
  } catch (e) {
    console.error("loyalty onPayment failed", e);
  }
}

async function checkReferral(ctx: Ctx, order: OrderRow) {
  const { data: refs } = await ctx.supabase
    .from("referral")
    .select("id, referrer_customer_id, referred_customer_id, status, stage")
    .eq("referred_customer_id", order.customer_id);
  const ref = ((refs ?? []) as { id: string; referrer_customer_id: string; status: string; stage: string }[]).find((r) => r.status !== "rewarded" && r.stage !== "rewarded");
  if (!ref) return;
  const { data: pays } = await ctx.supabase.from("payment").select("amount_minor, status").eq("order_id", order.id);
  const paid = ((pays ?? []) as { amount_minor: number; status: string }[])
    .filter((p) => p.status === "captured")
    .reduce((a, p) => a + (Number(p.amount_minor) || 0), 0);
  if (paid < (Number(order.total_minor) || 0) || paid <= 0) return; // not fully paid yet
  const referrer = await ensureAccount(ctx, ref.referrer_customer_id);
  if (referrer && ctx.cfg.bonus_referral_points > 0) {
    await post(ctx, referrer, {
      status: "earned", source: "referral", points: ctx.cfg.bonus_referral_points, bonus_points: ctx.cfg.bonus_referral_points,
      order_id: order.id, bonus_key: `referral:${ref.id}`, description: "Referral Bonus: your friend completed their first paid order",
    });
  }
  if (ctx.cfg.bonus_referral_friend_points > 0) {
    const friend = await ensureAccount(ctx, order.customer_id);
    if (friend) {
      await post(ctx, friend, {
        status: "earned", source: "referral", points: ctx.cfg.bonus_referral_friend_points, bonus_points: ctx.cfg.bonus_referral_friend_points,
        order_id: order.id, bonus_key: `referral_friend:${ref.id}`, description: "Referral welcome bonus",
      });
    }
  }
  await ctx.supabase
    .from("referral")
    .update({ status: "rewarded", stage: "rewarded", rewarded_at: new Date().toISOString(), first_order_id: order.id })
    .eq("id", ref.id);
}

/** Moves the account up when qualifying spend reaches a higher tier, and awards the upgrade bonus once per tier per year. */
async function checkTierUpgrade(ctx: Ctx, acct: Account) {
  const q = await customerQualifying(ctx, acct.customer_id);
  const idx = tierIndex(ctx.cfg, ctx.tiers, q);
  const current = ctx.tiers.findIndex((t) => t.id === acct.loyalty_tier_id);
  if (current >= 0 && idx <= current) return;
  const tier = ctx.tiers[idx];
  await ctx.supabase.from("loyalty_account").update({ loyalty_tier_id: tier.id, tier_since: new Date().toISOString().slice(0, 10) }).eq("id", acct.id);
  await ctx.supabase.from("customer").update({ tier: tier.name }).eq("id", acct.customer_id);
  acct.loyalty_tier_id = tier.id;
  if (current >= 0 && idx > current && ctx.cfg.bonus_tier_upgrade_points > 0) {
    await post(ctx, acct, {
      status: "earned", source: "tier_upgrade", points: ctx.cfg.bonus_tier_upgrade_points, bonus_points: ctx.cfg.bonus_tier_upgrade_points,
      tier, bonus_key: `upgrade:${tier.id}:${new Date().getFullYear()}`, description: `Tier Upgrade Bonus: welcome to ${tier.name}`,
    });
  }
}

/* ------------------------------------------------------------------ */
/* Expiry, birthday, wallet                                            */
/* ------------------------------------------------------------------ */

export async function loadLedger(ctx: Ctx, accountId: string): Promise<LedgerRow[]> {
  const out: LedgerRow[] = [];
  for (let from = 0; from < 20000; from += 1000) {
    const { data } = await ctx.supabase
      .from("loyalty_transaction")
      .select("*")
      .eq("loyalty_account_id", accountId)
      .order("created_at", { ascending: true })
      .range(from, from + 999);
    const rows = (data ?? []) as LedgerRow[];
    out.push(...rows);
    if (rows.length < 1000) break;
  }
  return out;
}

/** FIFO lots: each earned credit is a lot; redemptions, expiries and reversals consume the oldest lots first. */
export function lotsFor(rows: LedgerRow[]) {
  const lots: { id: string; created_at: string; expires_at: string | null; left: number; description: string | null }[] = [];
  for (const r of rows) {
    const p = Number(r.points);
    if (r.status === "earned" && p > 0) lots.push({ id: r.id, created_at: r.created_at, expires_at: r.expires_at, left: p, description: r.description });
    else if (p < 0) {
      let need = -p;
      for (const l of lots) {
        if (need <= 0) break;
        const t = Math.min(l.left, need);
        l.left = r2(l.left - t);
        need = r2(need - t);
      }
    }
  }
  return lots.filter((l) => l.left > 0);
}

/** Expires due points and awards the birthday bonus in the birthday month. Safe to call any time. */
export async function settleAccount(ctx: Ctx, acct: Account) {
  const now = new Date();
  const rows = await loadLedger(ctx, acct.id);
  for (const lot of lotsFor(rows)) {
    if (lot.expires_at && new Date(lot.expires_at) <= now) {
      await post(ctx, acct, {
        status: "expired", source: "expiry", points: -lot.left, related_transaction_id: lot.id,
        bonus_key: `expire:${lot.id}`, description: `Points expired (earned ${lot.created_at.slice(0, 10)})`,
      });
    }
  }
  const { data: cust } = await ctx.supabase.from("customer").select("birth_date").eq("id", acct.customer_id).maybeSingle();
  const bd = (cust as { birth_date: string | null } | null)?.birth_date;
  if (bd && Number(bd.slice(5, 7)) === now.getMonth() + 1) {
    const tier = await tierForAccount(ctx, acct);
    const amount = Number(tier.birthday_points) || 0;
    if (amount > 0) {
      await post(ctx, acct, {
        status: "earned", source: "birthday", points: amount, bonus_points: amount, tier,
        bonus_key: `birthday:${now.getFullYear()}`, description: `Birthday Bonus ${now.getFullYear()}`,
      });
    }
  }
}

export function walletSummary(ctx: Ctx, rows: LedgerRow[], acct: Account) {
  const now = Date.now();
  const warn = now + ctx.cfg.expiry_warning_days * 864e5;
  const lots = lotsFor(rows);
  const soon = lots.filter((l) => l.expires_at && new Date(l.expires_at).getTime() <= warn && new Date(l.expires_at).getTime() > now);
  const pendingRows = rows.filter((r) => r.status === "pending");
  return {
    available: Number(acct.points_balance),
    pending: Number(acct.pending_balance),
    lifetime: Number(acct.lifetime_points),
    redeemed: Number(acct.redeemed_points),
    expired: Number(acct.expired_points),
    reversed: Number(acct.reversed_points),
    expiringSoon: r2(soon.reduce((a, l) => a + l.left, 0)),
    nextExpiry: soon.sort((a, b) => String(a.expires_at).localeCompare(String(b.expires_at)))[0]?.expires_at ?? null,
    lots,
    pendingCount: pendingRows.length,
  };
}

/* ------------------------------------------------------------------ */
/* Redemption, reviews, adjustments                                    */
/* ------------------------------------------------------------------ */

const code = () => {
  const A = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "LWC-";
  for (let i = 0; i < 6; i++) s += A[Math.floor(Math.random() * A.length)];
  return s;
};

/** Redeem points for money off (a configured denomination) or for a catalogue reward. Returns the voucher code. */
export async function redeem(ctx: Ctx, customerId: string, opts: { points?: number; rewardId?: string }): Promise<{ error?: string; code?: string; value?: number }> {
  const acct = await ensureAccount(ctx, customerId);
  if (!acct) return { error: "Customer not found." };
  await settleAccount(ctx, acct);
  const balance = Number(acct.points_balance);
  if (balance < ctx.cfg.min_redeem_balance) return { error: `A member needs at least ${ctx.cfg.min_redeem_balance} points to redeem.` };

  let points = 0;
  let valueMinor = 0;
  let rewardId: string | null = null;
  let label = "";
  let validityDays = 30;
  if (opts.rewardId) {
    const { data: r } = await ctx.supabase
      .from("reward")
      .select("id, name, points_cost, value_minor, min_tier_id, stock, usage_limit_per_member, starts_on, ends_on, is_active, is_draft, validity_days")
      .eq("id", opts.rewardId)
      .maybeSingle();
    const rw = r as { id: string; name: string; points_cost: number; value_minor: number; min_tier_id: string | null; stock: number | null; usage_limit_per_member: number; starts_on: string | null; ends_on: string | null; is_active: boolean; is_draft: boolean; validity_days: number } | null;
    if (!rw || !rw.is_active || rw.is_draft) return { error: "That reward isn't available." };
    const today = new Date().toISOString().slice(0, 10);
    if ((rw.starts_on && rw.starts_on > today) || (rw.ends_on && rw.ends_on < today)) return { error: "That reward isn't running today." };
    if (rw.stock !== null && rw.stock <= 0) return { error: "That reward is out of stock." };
    if (rw.min_tier_id) {
      const tier = await tierForAccount(ctx, acct);
      const need = ctx.tiers.findIndex((t) => t.id === rw.min_tier_id);
      if (ctx.tiers.findIndex((t) => t.id === tier.id) < need) return { error: `That reward is for ${ctx.tiers[need]?.name ?? "higher"} members and above.` };
    }
    if (rw.usage_limit_per_member > 0) {
      const { count } = await ctx.supabase.from("reward_voucher").select("id", { count: "exact", head: true }).eq("customer_id", customerId).eq("reward_id", rw.id);
      if ((count ?? 0) >= rw.usage_limit_per_member) return { error: "This member has reached the limit for that reward." };
    }
    points = Number(rw.points_cost);
    valueMinor = Number(rw.value_minor) || 0;
    rewardId = rw.id;
    label = rw.name;
    validityDays = rw.validity_days || 30;
    if (rw.stock !== null) await ctx.supabase.from("reward").update({ stock: rw.stock - 1 }).eq("id", rw.id);
  } else {
    points = Number(opts.points) || 0;
    if (ctx.cfg.redemption_denominations.length && !ctx.cfg.redemption_denominations.includes(points)) {
      return { error: `Choose one of the redemption amounts: ${ctx.cfg.redemption_denominations.join(", ")} points.` };
    }
    valueMinor = pointsValueMinor(ctx.cfg, points);
    label = `₹${Math.round(valueMinor / 100)} off`;
  }
  if (points <= 0) return { error: "Nothing to redeem." };
  if (points > balance) return { error: `Not enough points: ${balance} available.` };

  const { data: cust } = await ctx.supabase.from("customer").select("branch_id").eq("id", customerId).maybeSingle();
  const voucherCode = code();
  const row = await post(ctx, acct, {
    status: "redeemed", source: rewardId ? "reward" : "checkout", points: -points, points_redeemed: points,
    description: `Reward Redemption: ${label} (${voucherCode})`,
  });
  if (!row) return { error: "Couldn't record the redemption. No points were taken." };
  const expires = new Date(Date.now() + validityDays * 864e5).toISOString();
  await ctx.supabase.from("reward_voucher").insert({
    branch_id: (cust as { branch_id: string } | null)?.branch_id,
    customer_id: customerId,
    reward_id: rewardId,
    code: voucherCode,
    loyalty_transaction_id: row.id,
    value_minor: valueMinor,
    points_spent: points,
    expires_at: expires,
  });
  return { code: voucherCode, value: valueMinor };
}

/** Record a review for a delivered order. Review points are awarded once per order, inside the review window. */
export async function recordReview(ctx: Ctx, orderId: string, stars: number, body: string | null): Promise<{ error?: string; awarded?: number }> {
  const { data } = await ctx.supabase.from("order").select("id, order_number, customer_id, status, branch_id, updated_at").eq("id", orderId).maybeSingle();
  const o = data as { id: string; order_number: string; customer_id: string; status: string; branch_id: string; updated_at: string } | null;
  if (!o) return { error: "Order not found." };
  if (o.status !== "delivered") return { error: "Only delivered orders can be reviewed." };
  const within = Date.now() - new Date(o.updated_at).getTime() <= ctx.cfg.review_window_days * 864e5;
  const award = within ? ctx.cfg.bonus_review_points : 0;
  const { error } = await ctx.supabase
    .from("order_review")
    .insert({ branch_id: o.branch_id, order_id: o.id, customer_id: o.customer_id, stars, body, points_awarded: award });
  if (error) return { error: error.code === "23505" ? "This order already has a review." : "Couldn't save the review." };
  if (award > 0) {
    const acct = await ensureAccount(ctx, o.customer_id);
    if (acct) {
      await post(ctx, acct, {
        status: "earned", source: "review", points: award, bonus_points: award, order_id: o.id,
        bonus_key: `review:${o.id}`, description: `Completed Review Bonus: ${o.order_number}`,
      });
    }
  }
  return { awarded: award };
}

/* ------------------------------------------------------------------ */
/* Checkout (POS and customer app)                                     */
/* ------------------------------------------------------------------ */

export type CheckoutOptions = {
  available: number;
  pointValueMinor: number;
  minRedeem: number;
  maxRedeemPct: number;
  denominations: number[];
  vouchers: { code: string; label: string; valueMinor: number; minOrderMinor: number }[];
};

/** What a customer can use at checkout: points balance, allowed amounts and active vouchers. */
export async function checkoutOptions(ctx: Ctx, customerId: string): Promise<CheckoutOptions> {
  const acct = await getAccount(ctx, customerId);
  if (acct) await settleAccount(ctx, acct);
  const { data } = await ctx.supabase
    .from("reward_voucher")
    .select("code, value_minor, expires_at, reward:reward_id(name, min_order_minor, value_minor)")
    .eq("customer_id", customerId)
    .eq("status", "active")
    .gt("expires_at", new Date().toISOString());
  const vouchers = ((data ?? []) as unknown as { code: string; value_minor: number | null; reward: { name: string; min_order_minor: number; value_minor: number } | { name: string; min_order_minor: number; value_minor: number }[] | null }[]).map((v) => {
    const r = Array.isArray(v.reward) ? v.reward[0] : v.reward;
    const value = Number(v.value_minor ?? r?.value_minor ?? 0);
    return { code: v.code, label: r?.name ?? `₹${Math.round(value / 100)} off`, valueMinor: value, minOrderMinor: Number(r?.min_order_minor ?? 0) };
  });
  return {
    available: acct ? Number(acct.points_balance) : 0,
    pointValueMinor: ctx.cfg.point_value_minor,
    minRedeem: ctx.cfg.min_redeem_balance,
    maxRedeemPct: ctx.cfg.max_redeem_pct,
    denominations: ctx.cfg.redemption_denominations,
    vouchers,
  };
}

/**
 * Applies points and/or a voucher to a just-created order: records the
 * redemption in the ledger and lowers the order total. Points and vouchers
 * go into discount_minor (so the printed invoice shows them); the points
 * part is also stored in loyalty_redeemed_minor.
 */
export async function applyCheckout(ctx: Ctx, orderId: string, opts: { points?: number; voucherCode?: string }): Promise<{ error?: string }> {
  const { data } = await ctx.supabase.from("order").select(ORDER_COLS).eq("id", orderId).maybeSingle();
  const order = data as OrderRow | null;
  if (!order) return { error: "Order not found." };
  const subtotal = Number(order.subtotal_minor) || 0;
  let discount = Number(order.discount_minor) || 0;
  let redeemedMinor = Number(order.loyalty_redeemed_minor) || 0;

  if (opts.voucherCode) {
    const { data: v } = await ctx.supabase
      .from("reward_voucher")
      .select("id, customer_id, status, expires_at, value_minor, reward:reward_id(min_order_minor, value_minor)")
      .eq("code", opts.voucherCode)
      .maybeSingle();
    const vv = v as unknown as { id: string; customer_id: string; status: string; expires_at: string; value_minor: number | null; reward: { min_order_minor: number; value_minor: number } | { min_order_minor: number; value_minor: number }[] | null } | null;
    const rw = vv ? (Array.isArray(vv.reward) ? vv.reward[0] : vv.reward) : null;
    if (!vv || vv.customer_id !== order.customer_id) return { error: "That voucher doesn't belong to this customer." };
    if (vv.status !== "active" || new Date(vv.expires_at) < new Date()) return { error: "That voucher has been used or has expired." };
    if (subtotal < Number(rw?.min_order_minor ?? 0)) return { error: `That voucher needs an order of ₹${Math.round(Number(rw?.min_order_minor) / 100)} or more.` };
    const value = Math.min(Number(vv.value_minor ?? rw?.value_minor ?? 0), Math.max(0, subtotal - discount));
    discount += value;
    await ctx.supabase.from("reward_voucher").update({ status: "used", used_order_id: orderId, used_at: new Date().toISOString() }).eq("id", vv.id);
  }

  const points = Number(opts.points) || 0;
  if (points > 0) {
    const acct = await ensureAccount(ctx, order.customer_id);
    if (!acct) return { error: "Customer not found." };
    await settleAccount(ctx, acct);
    const balance = Number(acct.points_balance);
    if (balance < ctx.cfg.min_redeem_balance) return { error: `The customer needs at least ${ctx.cfg.min_redeem_balance} points to redeem.` };
    if (points > balance) return { error: `Only ${balance} points available.` };
    if (ctx.cfg.redemption_denominations.length && !ctx.cfg.redemption_denominations.includes(points)) {
      return { error: `Choose one of: ${ctx.cfg.redemption_denominations.join(", ")} points.` };
    }
    const value = pointsValueMinor(ctx.cfg, points);
    const cap = Math.floor((subtotal * ctx.cfg.max_redeem_pct) / 100);
    if (value > cap) return { error: `Points can pay up to ${ctx.cfg.max_redeem_pct}% of an order (₹${Math.round(cap / 100)} here).` };
    if (value > subtotal - discount) return { error: "The points are worth more than what's left to pay." };
    const row = await post(ctx, acct, {
      status: "redeemed", source: "checkout", points: -points, points_redeemed: points, order_id: orderId,
      bonus_key: `checkout:${orderId}`, description: `Points used on order ${order.order_number}: ₹${Math.round(value / 100)} off`,
    });
    if (!row) return { error: "Couldn't record the redemption. No points were taken." };
    discount += value;
    redeemedMinor += value;
  }

  // Additional charges (express, delivery...) are added after discounts.
  const { data: ch } = await ctx.supabase.from("order").select("extra_charges_minor").eq("id", orderId).maybeSingle();
  const charges = Number((ch as { extra_charges_minor?: number } | null)?.extra_charges_minor ?? 0) || 0;
  const total = Math.max(0, subtotal - discount + (Number(order.tax_minor) || 0)) + charges;
  await ctx.supabase.from("order").update({ discount_minor: discount, loyalty_redeemed_minor: redeemedMinor, total_minor: total }).eq("id", orderId);
  return {};
}

/* ------------------------------------------------------------------ */
/* Nightly maintenance                                                 */
/* ------------------------------------------------------------------ */

/**
 * Expires due points and adds birthday bonuses. Idempotent.
 * "nightly" only visits wallets with credits that expired in the last 7 days
 * (fast enough for the midnight cron); "full" visits every wallet with a balance.
 */
export async function runDailyMaintenance(ctx: Ctx, mode: "nightly" | "full" = "full") {
  const accounts: Account[] = [];
  if (mode === "full") {
    for (let from = 0; from < 100000; from += 1000) {
      const { data } = await ctx.supabase.from("loyalty_account").select(ACCOUNT_COLS).order("id").range(from, from + 999);
      const rows = (data ?? []) as Account[];
      accounts.push(...rows);
      if (rows.length < 1000) break;
    }
  } else {
    const now = new Date();
    const since = new Date(now.getTime() - 7 * 864e5);
    const { data: due } = await ctx.supabase
      .from("loyalty_transaction")
      .select("loyalty_account_id")
      .eq("status", "earned")
      .gt("points", 0)
      .gte("expires_at", since.toISOString())
      .lte("expires_at", now.toISOString())
      .limit(5000);
    const ids = Array.from(new Set(((due ?? []) as { loyalty_account_id: string }[]).map((r) => r.loyalty_account_id)));
    for (let i = 0; i < ids.length; i += 200) {
      const { data } = await ctx.supabase.from("loyalty_account").select(ACCOUNT_COLS).in("id", ids.slice(i, i + 200));
      accounts.push(...((data ?? []) as Account[]));
    }
  }
  let checked = 0;
  for (const a of accounts) {
    if (Number(a.points_balance) > 0) {
      await settleAccount(ctx, a);
      checked++;
    }
  }
  const month = String(new Date().getMonth() + 1).padStart(2, "0");
  const { data: bdays } = await ctx.supabase.from("customer").select("id, birth_date").not("birth_date", "is", null).is("deleted_at", null);
  let birthdays = 0;
  for (const c of (bdays ?? []) as { id: string; birth_date: string }[]) {
    if (c.birth_date.slice(5, 7) !== month) continue;
    const acct = await ensureAccount(ctx, c.id);
    if (acct) {
      await settleAccount(ctx, acct);
      birthdays++;
    }
  }
  return { checked, birthdays, accounts: accounts.length };
}

/** Manual adjustment by staff, always written to the ledger with the reason. */
export async function adjust(ctx: Ctx, customerId: string, points: number, reason: string) {
  const acct = await ensureAccount(ctx, customerId);
  if (!acct) return null;
  const p = r2(points);
  return post(ctx, acct, {
    status: p >= 0 ? "earned" : "reversed", source: "adjustment", points: p,
    points_reversed: p < 0 ? -p : 0, bonus_points: p > 0 ? p : 0, description: `Adjustment: ${reason}`,
  });
}
