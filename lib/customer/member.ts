import type { SupabaseClient } from "@supabase/supabase-js";
import { gapToNext, inr, pts } from "@/lib/loyalty/engine";
import { customerQualifying, getAccount, loadCtx, loadLedger, walletSummary } from "@/lib/loyalty/ledger";

// Loads what most customer-app screens need for ONE customer. Every query
// is filtered by that customer's id; nothing here is shared with others.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Supa = SupabaseClient<any, "public", any>;

export async function loadMember(db: Supa, customerId: string, opts?: { ledger?: boolean }) {
  const ctx = await loadCtx(db);
  const { data: c } = await db
    .from("customer")
    .select("id, full_name, phone, email, birth_date, created_at, family_account_id, branch_id")
    .eq("id", customerId)
    .maybeSingle();
  const customer = c as {
    id: string;
    full_name: string;
    phone: string;
    email: string | null;
    birth_date: string | null;
    created_at: string;
    family_account_id: string | null;
    branch_id: string;
  } | null;
  if (!ctx || !customer) return null;
  const [acct, q] = await Promise.all([getAccount(ctx, customerId), customerQualifying(ctx, customerId)]);
  const rows = acct && opts?.ledger ? await loadLedger(ctx, acct.id) : [];
  const wallet = acct ? walletSummary(ctx, rows.length ? rows : await loadLedger(ctx, acct.id), acct) : null;
  const gap = gapToNext(ctx.cfg, ctx.tiers, q);
  const tier = ctx.tiers.find((t) => t.id === acct?.loyalty_tier_id) ?? ctx.tiers[gap.idx];
  const tierIdx = Math.max(0, ctx.tiers.findIndex((t) => t.id === tier.id));
  const next = ctx.tiers[tierIdx + 1] ?? null;

  // Progress toward the next tier (or toward keeping the top tier).
  const target = next ?? tier;
  const mode = ctx.cfg.qualification_mode;
  const spendPct = target.min_spend_minor ? Math.min(1, q.spend / target.min_spend_minor) : 1;
  const orderPct = target.min_orders ? Math.min(1, q.orders / target.min_orders) : 1;
  const pct = mode === "spend" ? spendPct : mode === "orders" ? orderPct : Math.min(spendPct, orderPct);
  const leftNote = mode === "orders" ? `${q.orders} / ${target.min_orders} orders` : `${inr(q.spend)} / ${inr(target.min_spend_minor)}`;
  const gapText = next
    ? (() => {
        const parts: string[] = [];
        if (mode !== "orders" && q.spend < next.min_spend_minor) parts.push(inr(next.min_spend_minor - q.spend));
        if (mode !== "spend" && q.orders < next.min_orders) parts.push(`${next.min_orders - q.orders} orders`);
        return parts.length ? `${parts.join(" + ")} to ${next.name}` : `${next.name} at your next review`;
      })()
    : pct >= 1
      ? `${tier.name} secured`
      : `${inr(Math.max(0, tier.min_spend_minor - q.spend))} to keep ${tier.name}`;

  // Renewal: yearly from the date the member joined.
  const joined = new Date(customer.created_at);
  const renew = new Date(joined);
  while (renew <= new Date()) renew.setMonth(renew.getMonth() + ctx.cfg.renewal_period_months);

  return {
    ctx,
    cfg: ctx.cfg,
    tiers: ctx.tiers,
    customer,
    acct,
    q,
    tier,
    tierIdx,
    next,
    pct,
    leftNote,
    gapText,
    renew,
    wallet,
    rows,
    points: pts(ctx.cfg, wallet?.available ?? 0),
    firstName: customer.full_name.split(" ")[0],
  };
}

/** Friendly order stages for the tracking view, mapped from order.status. */
export const STAGES = [
  { status: "confirmed", label: "Order received", note: "We have your garments and have tagged each one." },
  { status: "in_production", label: "Cleaning", note: "Cleaned to the care label, with your saved preferences." },
  { status: "ready", label: "Ready", note: "Checked, packed and ready." },
  { status: "out_for_delivery", label: "Out for delivery", note: "With your delivery partner." },
  { status: "delivered", label: "Delivered", note: "Delivered. Thank you." },
];
export const stageIndex = (status: string) => STAGES.findIndex((s) => s.status === status);
