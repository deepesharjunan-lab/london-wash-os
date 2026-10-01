import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { inr, pts, pointsValueMinor } from "@/lib/loyalty/engine";
import { customerQualifying, getAccount, loadCtx, loadLedger, walletSummary } from "@/lib/loyalty/ledger";
import type { LedgerRow } from "@/lib/loyalty/ledger";
import { gapToNext } from "@/lib/loyalty/engine";
import { adjustMember, redeemForMember, reviewForMember, settleMember } from "../../actions";
import { btnPrimary, btnSecondary, Card, ClubHeader, Field, inputCls, StatusPill } from "../../ui";

import LoginCodeButton from "./LoginCodeButton";

export const dynamic = "force-dynamic";

const STATUS_STYLE: Record<string, string> = {
  pending: "scheduled",
  earned: "active",
  redeemed: "draft",
  expired: "ended",
  reversed: "paused",
  cancelled: "off",
};
const STATUS_LABEL: Record<string, string> = { pending: "Pending", earned: "Earned", redeemed: "Redeemed", expired: "Expired", reversed: "Reversed", cancelled: "Cancelled" };
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });

export default async function MemberWalletPage({ params, searchParams }: { params: { id: string }; searchParams: { saved?: string; error?: string } }) {
  const supabase = createClient();
  const ctx = await loadCtx(supabase);
  const { data: customer } = await supabase.from("customer").select("id, full_name, phone, birth_date, created_at").eq("id", params.id).maybeSingle();
  const cust = customer as { id: string; full_name: string; phone: string; birth_date: string | null; created_at: string } | null;
  if (!ctx || !cust) {
    return <ClubHeader current="/club/members" title="Member" sub={!ctx ? "The Club isn't set up yet." : "Customer not found."} />;
  }
  const { cfg, tiers } = ctx;
  const [acct, q] = await Promise.all([getAccount(ctx, cust.id), customerQualifying(ctx, cust.id)]);
  const rows: LedgerRow[] = acct ? await loadLedger(ctx, acct.id) : [];
  const w = acct ? walletSummary(ctx, rows, acct) : null;
  const gap = gapToNext(cfg, tiers, q);
  const tier = tiers.find((t) => t.id === acct?.loyalty_tier_id) ?? tiers[gap.idx];

  const orderIds = Array.from(new Set(rows.map((r) => r.order_id).filter(Boolean))) as string[];
  const [ordersRes, rewardsRes, vouchersRes, deliveredRes, reviewsRes] = await Promise.all([
    orderIds.length ? supabase.from("order").select("id, order_number").in("id", orderIds) : Promise.resolve({ data: [] }),
    supabase.from("reward").select("id, name, points_cost, value_minor, min_tier_id").is("deleted_at", null).eq("is_active", true).eq("is_draft", false).order("points_cost"),
    supabase.from("reward_voucher").select("id, code, value_minor, points_spent, status, expires_at, reward_id").eq("customer_id", cust.id).order("issued_at", { ascending: false }),
    supabase.from("order").select("id, order_number, updated_at").eq("customer_id", cust.id).eq("status", "delivered").order("updated_at", { ascending: false }).limit(20),
    supabase.from("order_review").select("order_id").eq("customer_id", cust.id),
  ]);
  const orderNo = new Map<string, string>(((ordersRes.data ?? []) as { id: string; order_number: string }[]).map((o) => [o.id, o.order_number] as [string, string]));
  const rewards = (rewardsRes.data ?? []) as { id: string; name: string; points_cost: number; value_minor: number; min_tier_id: string | null }[];
  const rewardName = new Map<string, string>(rewards.map((r) => [r.id, r.name] as [string, string]));
  const vouchers = (vouchersRes.data ?? []) as { id: string; code: string; value_minor: number | null; points_spent: number | null; status: string; expires_at: string; reward_id: string | null }[];
  const reviewed = new Set(((reviewsRes.data ?? []) as { order_id: string }[]).map((r) => r.order_id));
  const reviewable = ((deliveredRes.data ?? []) as { id: string; order_number: string }[]).filter((o) => !reviewed.has(o.id));
  const balance = w?.available ?? 0;
  const history = rows.slice().reverse();

  return (
    <div className="space-y-6">
      <ClubHeader current="/club/members" title={cust.full_name} saved={searchParams.saved} />
      {searchParams.error && <div role="alert" className="-mt-2 rounded-xl bg-[#f6e4df] px-4 py-3 text-[13px] font-medium text-[#9c3326]">{searchParams.error}</div>}

      <div className="flex flex-wrap items-center gap-3 text-[13px] text-ink-2">
        <span className="rounded-full bg-navy px-3 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-[#efe8da]">{tier?.name ?? "No tier"}</span>
        {acct?.member_no && <span className="font-mono">{acct.member_no}</span>}
        <span>{cust.phone}</span>
        <span>· {inr(q.spend)} and {q.orders} orders in {cfg.qualification_period_months} months</span>
        <span>· {gap.text}</span>
        <Link href={`/customers/${cust.id}`} className="font-semibold text-ink hover:underline">Customer record</Link>
      </div>

      <Card title="Customer app" sub="Customers sign in at club.thelondonwash.com with their mobile number and a 6-digit code. Until SMS/WhatsApp is connected, create the code here and give it to the customer in person, by phone or on WhatsApp.">
        <LoginCodeButton customerId={cust.id} />
      </Card>

      {!acct && (
        <Card title="No wallet yet">
          <p className="text-sm text-ink-2">This member&apos;s wallet opens automatically with their first points event, such as an order moving past draft. You can also add points below.</p>
        </Card>
      )}

      {w && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          {[
            ["Available", pts(cfg, w.available), `Worth ${inr(pointsValueMinor(cfg, w.available))}`],
            ["Pending", pts(cfg, w.pending), "Released when orders complete"],
            ["Expiring soon", pts(cfg, w.expiringSoon), w.nextExpiry ? `First on ${fmtDate(w.nextExpiry)}` : `None in ${cfg.expiry_warning_days} days`],
            ["Lifetime", pts(cfg, w.lifetime), "Total ever earned"],
            ["Redeemed", pts(cfg, w.redeemed), "Total used"],
            ["Expired", pts(cfg, w.expired), w.reversed ? `${pts(cfg, w.reversed)} reversed` : "Never used in time"],
          ].map(([k, v, n]) => (
            <div key={k} className="border border-black/10 bg-white px-4 py-3.5">
              <div className="text-[12px] font-medium text-ink-2">{k}</div>
              <div className="mt-1 text-[24px] font-bold tabular-nums text-ink">{v}</div>
              <div className="text-[12px] text-ink-3">{n}</div>
            </div>
          ))}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Redeem points" sub={`Minimum balance ${cfg.min_redeem_balance} points. 100 points = ${inr(100 * cfg.point_value_minor)}. Redeeming issues a voucher code to apply as a discount on the order.`}>
          <form action={redeemForMember} className="space-y-4">
            <input type="hidden" name="customer_id" value={cust.id} />
            <fieldset>
              <legend className="mb-2 text-[12.5px] font-semibold text-ink-2">Money off</legend>
              <div className="flex flex-wrap gap-2">
                {cfg.redemption_denominations.map((d) => (
                  <label key={d} className={"inline-flex items-center gap-1.5 rounded-full border border-hair-2 bg-white px-3 py-1.5 text-[12.5px] " + (d > balance ? "text-ink-3" : "text-ink")}>
                    <input type="radio" name="points" value={d} disabled={d > balance} /> {d} pts = {inr(d * cfg.point_value_minor)}
                  </label>
                ))}
              </div>
            </fieldset>
            <Field label="Or a reward">
              <select className={inputCls} name="reward_id" defaultValue="">
                <option value="">No reward, use the money-off amount above</option>
                {rewards.map((r) => (
                  <option key={r.id} value={r.id} disabled={r.points_cost > balance}>
                    {r.name} · {r.points_cost} pts{r.points_cost > balance ? " (not enough points)" : ""}
                  </option>
                ))}
              </select>
            </Field>
            <button type="submit" className={btnPrimary} disabled={balance < cfg.min_redeem_balance}>Redeem</button>
            {balance < cfg.min_redeem_balance && <p className="text-[12.5px] text-ink-3">Needs {pts(cfg, cfg.min_redeem_balance - balance)} more points to redeem.</p>}
          </form>
        </Card>

        <div className="space-y-6">
          <Card title="Adjust points" sub="Every adjustment is written to the ledger with your name and the reason.">
            <form action={adjustMember} className="grid gap-3 sm:grid-cols-[120px_1fr_auto] sm:items-end">
              <input type="hidden" name="customer_id" value={cust.id} />
              <Field label="Points (+ / −)"><input className={inputCls} type="number" step="0.5" name="points" placeholder="e.g. 50" required /></Field>
              <Field label="Reason"><input className={inputCls} name="reason" placeholder="e.g. Service recovery for late delivery" required /></Field>
              <button type="submit" className={btnSecondary + " py-2"}>Apply</button>
            </form>
          </Card>
          <Card title="Record a review" sub={`Awards ${cfg.bonus_review_points} points once per delivered order, within ${cfg.review_window_days} days of delivery.`}>
            {reviewable.length === 0 ? (
              <p className="text-sm text-ink-3">No delivered orders waiting for a review.</p>
            ) : (
              <form action={reviewForMember} className="grid gap-3 sm:grid-cols-[1fr_90px] sm:items-end">
                <input type="hidden" name="customer_id" value={cust.id} />
                <Field label="Order">
                  <select className={inputCls} name="order_id">{reviewable.map((o) => <option key={o.id} value={o.id}>{o.order_number}</option>)}</select>
                </Field>
                <Field label="Stars">
                  <select className={inputCls} name="stars" defaultValue="5">{[5, 4, 3, 2, 1].map((s) => <option key={s}>{s}</option>)}</select>
                </Field>
                <div className="sm:col-span-2"><Field label="What the customer said"><input className={inputCls} name="body" placeholder="Optional" /></Field></div>
                <button type="submit" className={btnSecondary + " justify-self-start py-2"}>Save review</button>
              </form>
            )}
          </Card>
        </div>
      </div>

      {vouchers.length > 0 && (
        <Card title="Vouchers">
          <ul className="divide-y divide-black/5 text-[13px]">
            {vouchers.map((v) => (
              <li key={v.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
                <span><b className="font-mono">{v.code}</b> · {v.reward_id ? rewardName.get(v.reward_id) ?? "Reward" : `${inr(v.value_minor ?? 0)} off`}</span>
                <span className="text-ink-2">{v.points_spent ? `${pts(cfg, Number(v.points_spent))} pts · ` : ""}until {fmtDate(v.expires_at)}</span>
                <StatusPill status={v.status === "active" ? "active" : v.status === "used" ? "ended" : "off"} />
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card
        title="Points history"
        sub="Every transaction, newest first. Open a row to see exactly how the points were calculated."
        action={
          <form action={settleMember}>
            <input type="hidden" name="customer_id" value={cust.id} />
            <button type="submit" className={btnSecondary}>Check expiry & birthday</button>
          </form>
        }
      >
        {history.length === 0 ? (
          <p className="text-sm text-ink-3">No points transactions yet.</p>
        ) : (
          <div className="divide-y divide-black/5">
            {history.map((r) => {
              const p = Number(r.points);
              const pend = Number(r.pending_points);
              const shown = p !== 0 ? p : pend;
              return (
                <details key={r.id} className="group">
                  <summary className="grid cursor-pointer list-none grid-cols-[92px_1fr_auto_90px_90px] items-center gap-3 py-3 text-[13px]">
                    <span className="text-ink-3">{fmtDate(r.created_at)}</span>
                    <span className="min-w-0">
                      <b className="block truncate font-medium text-ink">{r.description ?? r.source ?? r.type}</b>
                      {r.order_id && <span className="text-[12px] text-ink-3">Order {orderNo.get(r.order_id) ?? ""}</span>}
                    </span>
                    <StatusPill status={STATUS_STYLE[r.status] ?? "off"} />
                    <span className={"text-right font-semibold tabular-nums " + (shown > 0 ? "text-[#2c6a4e]" : shown < 0 ? "text-[#9c3326]" : "text-ink-3")}>
                      {shown > 0 ? "+" : shown < 0 ? "−" : ""}{pts(cfg, Math.abs(shown))}
                      {p === 0 && pend !== 0 && <span className="block text-[11px] font-normal text-ink-3">pending</span>}
                    </span>
                    <span className="text-right tabular-nums text-ink-2">{pts(cfg, Number(r.balance_after))}</span>
                  </summary>
                  <div className="mb-3 space-y-2 rounded-xl bg-beige px-4 py-3 text-[12.5px] text-ink">
                    {r.breakdown && r.breakdown.length > 0 && (
                      <ul className="space-y-1">
                        {r.breakdown.map((l, i) => (
                          <li key={i} className="flex justify-between gap-4"><span>{l.label}</span><b className="tabular-nums">{l.points >= 0 ? "+" : "−"}{pts(cfg, Math.abs(l.points))}</b></li>
                        ))}
                      </ul>
                    )}
                    <div className="grid gap-x-6 gap-y-1 text-ink-2 sm:grid-cols-3">
                      <span>Status: <b className="text-ink">{STATUS_LABEL[r.status] ?? r.status}</b></span>
                      <span>Type: {r.source ?? r.type}</span>
                      {r.base_eligible_minor !== null && <span>Eligible amount: {inr(Number(r.base_eligible_minor))}</span>}
                      {r.tier_name && <span>Tier: {r.tier_name} ({Number(r.tier_multiplier)}×)</span>}
                      {Number(r.campaign_multiplier) !== 1 && <span>Campaign: {r.campaign_name} ({Number(r.campaign_multiplier)}×)</span>}
                      {r.campaign_name && Number(r.campaign_multiplier) === 1 && <span>Campaign: {r.campaign_name}</span>}
                      {Number(r.bonus_points) > 0 && <span>Bonus points: {pts(cfg, Number(r.bonus_points))}</span>}
                      {Number(r.points_redeemed) > 0 && <span>Redeemed: {pts(cfg, Number(r.points_redeemed))}</span>}
                      {Number(r.points_reversed) > 0 && <span>Reversed: {pts(cfg, Number(r.points_reversed))}</span>}
                      {r.expires_at && <span>Expires: {fmtDate(r.expires_at)}</span>}
                      <span>Balance after: {pts(cfg, Number(r.balance_after))}</span>
                    </div>
                  </div>
                </details>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
