import { redirect } from "next/navigation";
import { requireMember } from "@/lib/customer/session";
import { loadMember } from "@/lib/customer/member";
import { inr, pts } from "@/lib/loyalty/engine";
import { redeemRewardAction } from "../actions";
import { AppShell, Card, Notice, fmtDate } from "../ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Rewards · The London Wash Club" };

type Reward = { id: string; name: string; description: string | null; category: string | null; points_cost: number; value_minor: number; min_tier_id: string | null; stock: number | null; starts_on: string | null; ends_on: string | null; card_style: string | null };
const ART: Record<string, { bg: string; fg: string }> = { a: { bg: "#EDE5D6", fg: "#15213A" }, b: { bg: "#1B2A48", fg: "#E9DFC9" }, c: { bg: "#E3E7EC", fg: "#2E4470" }, d: { bg: "#2A2B30", fg: "#C7B58F" } };

export default async function MemberRewardsPage({ searchParams }: { searchParams: { voucher?: string; error?: string } }) {
  const { customerId, db } = requireMember();
  const m = await loadMember(db, customerId);
  if (!m) redirect("/my/login");
  const today = new Date().toISOString().slice(0, 10);
  const [rewardsRes, vouchersRes] = await Promise.all([
    db
      .from("reward")
      .select("id, name, description, category, points_cost, value_minor, min_tier_id, stock, starts_on, ends_on, card_style")
      .is("deleted_at", null)
      .eq("is_active", true)
      .eq("is_draft", false)
      .order("sort_order")
      .order("points_cost"),
    db.from("reward_voucher").select("id, code, status, expires_at, value_minor, reward:reward_id(name)").eq("customer_id", customerId).eq("status", "active").order("issued_at", { ascending: false }),
  ]);
  const rewards = ((rewardsRes.data ?? []) as Reward[]).filter((r) => (!r.starts_on || r.starts_on <= today) && (!r.ends_on || r.ends_on >= today));
  const vouchers = (vouchersRes.data ?? []) as unknown as { id: string; code: string; expires_at: string; value_minor: number | null; reward: { name: string } | { name: string }[] | null }[];
  const available = m.wallet?.available ?? 0;
  const canRedeemAtAll = available >= m.cfg.min_redeem_balance;
  const denominations = m.cfg.redemption_denominations ?? [];

  return (
    <AppShell current="/my/rewards" title="Rewards">
      <Card className="flex items-center gap-3 px-4 py-3.5">
        <span className="flex-1">
          <span className="block text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-3">Available</span>
          <span className="font-display text-[28px] leading-tight tabular-nums">
            {pts(m.cfg, available)} <span className="font-archivo text-[13px] text-ink-2">points</span>
          </span>
        </span>
        <a href="/my/points" className="text-[13.5px] font-semibold text-ink-2">
          History
        </a>
      </Card>

      {searchParams.voucher && (
        <Notice tone="ok">
          <b>Reward redeemed.</b> Your code is <span className="font-mono font-bold">{searchParams.voucher}</span>. Show it at the counter or quote it when you book, and we&apos;ll take it off your order.
        </Notice>
      )}
      {searchParams.error && <Notice tone="danger">{searchParams.error}</Notice>}

      {vouchers.length > 0 && (
        <section className="flex flex-col gap-2.5">
          <h2 className="text-[15px] font-semibold">Ready to use</h2>
          <Card>
            <ul className="divide-y divide-hair">
              {vouchers.map((v) => {
                const r = Array.isArray(v.reward) ? v.reward[0] : v.reward;
                return (
                  <li key={v.id} className="flex items-center justify-between gap-3 px-4 py-3">
                    <span>
                      <b className="block text-[14px]">{r?.name ?? `${inr(Number(v.value_minor ?? 0))} off`}</b>
                      <span className="font-mono text-[12.5px] text-ink-2">
                        {v.code} · until {fmtDate(v.expires_at)}
                      </span>
                    </span>
                    <span className="rounded-full bg-[#e2eee7] px-2.5 py-1 text-[10.5px] font-bold uppercase tracking-wide text-[#2c6a4e]">Active</span>
                  </li>
                );
              })}
            </ul>
          </Card>
        </section>
      )}

      {denominations.length > 0 && (
        <section className="flex flex-col gap-2.5">
          <h2 className="text-[15px] font-semibold">Money off</h2>
          <p className="-mt-1 text-[13px] text-ink-2">
            {pts(m.cfg, 100)} points = {inr(100 * m.cfg.point_value_minor)}. You need {pts(m.cfg, m.cfg.min_redeem_balance)} points to start redeeming.
          </p>
          <div className="grid grid-cols-2 gap-2.5">
            {denominations.map((d) => {
              const ok = canRedeemAtAll && d <= available;
              return (
                <form key={d} action={redeemRewardAction}>
                  <input type="hidden" name="points" value={d} />
                  <button
                    type="submit"
                    disabled={!ok}
                    className="flex w-full flex-col items-start gap-1 rounded-[14px] border border-hair bg-white p-3.5 text-left disabled:opacity-50"
                  >
                    <span className="text-[17px] font-bold">{inr(d * m.cfg.point_value_minor)} off</span>
                    <span className="text-[12.5px] text-ink-2">
                      {pts(m.cfg, d)} pts{ok ? " · Redeem" : d > available ? ` · ${pts(m.cfg, d - available)} to go` : ""}
                    </span>
                  </button>
                </form>
              );
            })}
          </div>
        </section>
      )}

      <section className="flex flex-col gap-2.5">
        <h2 className="text-[15px] font-semibold">Rewards</h2>
        {rewards.length === 0 ? (
          <p className="text-[14px] text-ink-2">New rewards are on the way.</p>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {rewards.map((r) => {
              const needTier = r.min_tier_id ? m.tiers.findIndex((t) => t.id === r.min_tier_id) : 0;
              const tierOk = needTier <= m.tierIdx;
              const stockOk = r.stock === null || r.stock > 0;
              const pointsOk = r.points_cost <= available && canRedeemAtAll;
              const art = ART[r.card_style ?? "a"] ?? ART.a;
              return (
                <details key={r.id} className="group overflow-hidden rounded-[14px] border border-hair bg-white shadow-sm">
                  <summary className="flex cursor-pointer list-none flex-col">
                    <span className="relative grid h-[84px] place-items-center text-[11px] font-bold uppercase tracking-[0.16em]" style={{ background: art.bg, color: art.fg, opacity: tierOk ? 1 : 0.6 }}>
                      {r.category ?? "Reward"}
                      {!tierOk && (
                        <span className="absolute right-2 top-2 rounded-full bg-white/85 px-2 py-0.5 text-[10px] font-bold text-navy">{m.tiers[needTier]?.name}+</span>
                      )}
                    </span>
                    <span className="flex flex-col gap-1 p-3">
                      <b className="text-[13.5px] leading-snug">{r.name}</b>
                      <span className="text-[12.5px] text-ink-2">
                        {pts(m.cfg, r.points_cost)} pts
                        {pointsOk && tierOk && stockOk ? " · Redeem" : !tierOk ? "" : r.points_cost > available ? ` · ${pts(m.cfg, r.points_cost - available)} to go` : ""}
                      </span>
                    </span>
                  </summary>
                  <div className="flex flex-col gap-2 border-t border-hair p-3 text-[12.5px] text-ink-2">
                    {r.description && <p>{r.description}</p>}
                    <p>Worth {inr(r.value_minor)}.</p>
                    {!tierOk && <p>For {m.tiers[needTier]?.name} members and above.</p>}
                    {!stockOk && <p>Fully redeemed.</p>}
                    <form action={redeemRewardAction}>
                      <input type="hidden" name="reward_id" value={r.id} />
                      <button type="submit" disabled={!(pointsOk && tierOk && stockOk)} className="w-full rounded-full bg-navy py-2.5 text-[13px] font-semibold text-[#f8f5ef] disabled:opacity-40">
                        Redeem for {pts(m.cfg, r.points_cost)} points
                      </button>
                    </form>
                  </div>
                </details>
              );
            })}
          </div>
        )}
      </section>
    </AppShell>
  );
}
