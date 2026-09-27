import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { loadConfig, loadCustomers, loadPointsOutstanding, loadQualifying, loadTiers } from "@/lib/loyalty/data";
import { campaignStatus, gapToNext, inr, num, tierColor, tierIndex } from "@/lib/loyalty/engine";
import { Card, ClubHeader, Kpi, StatusPill } from "./ui";

export const dynamic = "force-dynamic";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export default async function ClubOverviewPage() {
  const supabase = createClient();
  const [cfg, tiers] = await Promise.all([loadConfig(supabase), loadTiers(supabase)]);

  if (!cfg || tiers.length === 0) {
    return (
      <div>
        <ClubHeader current="/club" title="Loyalty Club" />
        <Card title="The Club isn't set up yet">
          <p className="text-sm text-ink-2">No loyalty rules or tiers were found. Run the London Wash Club setup scripts in Supabase first.</p>
        </Card>
      </div>
    );
  }

  const [{ byCustomer, monthly }, customers, pointsOutstanding, campaignsRes, rewardsRes] = await Promise.all([
    loadQualifying(supabase, cfg.qualification_period_months),
    loadCustomers(supabase),
    loadPointsOutstanding(supabase),
    supabase.from("loyalty_campaign").select("id, name, occasion, campaign_type, multiplier, bonus_points, starts_on, ends_on, is_enabled").is("deleted_at", null).order("starts_on"),
    supabase.from("reward").select("id, is_active, is_draft, category").is("deleted_at", null),
  ]);

  const totalMembers = customers.length;
  const counts = tiers.map(() => 0);
  const revenueByTier = tiers.map(() => 0);
  const near: { id: string; name: string; tier: number; text: string; pct: number; spend: number }[] = [];
  let active90 = 0;
  const cutoff90 = new Date(Date.now() - 90 * 864e5).toISOString();

  for (const c of customers) {
    const q = byCustomer.get(c.id) ?? { spend: 0, orders: 0, last: "" };
    const idx = tierIndex(cfg, tiers, q);
    counts[idx] += 1;
    revenueByTier[idx] += q.spend;
    if (q.last && q.last >= cutoff90) active90 += 1;
    const g = gapToNext(cfg, tiers, q);
    if (g.next && g.pct >= 0.8 && q.orders > 0) near.push({ id: c.id, name: c.full_name, tier: idx, text: g.text, pct: g.pct, spend: q.spend });
  }
  near.sort((a, b) => b.pct - a.pct);

  const campaigns = (campaignsRes.data ?? []) as { id: string; name: string; occasion: string | null; campaign_type: string; multiplier: number; bonus_points: number; starts_on: string; ends_on: string; is_enabled: boolean }[];
  const rewards = (rewardsRes.data ?? []) as { is_active: boolean; is_draft: boolean }[];
  const liveRewards = rewards.filter((r) => r.is_active && !r.is_draft).length;
  const maxCount = Math.max(1, ...counts);

  // last 12 months of qualifying revenue
  const now = new Date();
  const months = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - 11 + i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    return { label: MONTHS[d.getMonth()], value: monthly.get(key) ?? 0 };
  });
  const maxMonth = Math.max(1, ...months.map((m) => m.value));
  const modeLabel = cfg.qualification_mode === "spend" ? "annual spend" : cfg.qualification_mode === "orders" ? "number of orders" : "spend and orders";

  return (
    <div className="space-y-6">
      <ClubHeader
        current="/club"
        title="Loyalty Club"
        sub={`Every customer is placed in a tier from their ${modeLabel} over the last ${cfg.qualification_period_months} months, using the levels on Tiers & benefits. Orders that are drafts or cancelled don't count.`}
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Kpi label="Members" value={num(totalMembers)} note="Every customer is a member" />
        {tiers.map((t, i) => (
          <Kpi key={t.id} label={t.name} value={num(counts[i])} note={`${Math.round((counts[i] / Math.max(1, customers.length)) * 100)}% of members`} color={tierColor(t)} />
        ))}
        <Kpi label="Active in 90 days" value={num(active90)} note={`${num(customers.length - active90)} inactive`} />
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="Points outstanding" value={num(pointsOutstanding)} note="Across loyalty accounts" />
        <Kpi label="Points liability" value={inr(pointsOutstanding * cfg.point_value_minor)} note={`At ${inr(cfg.point_value_minor * 100)} per 100 points`} />
        <Kpi label="Rewards live" value={num(liveRewards)} note={`${rewards.length} in the catalogue`} />
        <Kpi label="Campaigns live" value={num(campaigns.filter((c) => campaignStatus(c) === "live").length)} note={`${campaigns.length} set up`} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Tier distribution" sub="Live from the current levels">
          <div className="space-y-3">
            {tiers.map((t, i) => (
              <div key={t.id} className="grid grid-cols-[100px_1fr_110px] items-center gap-3 text-[13px]">
                <span className="font-semibold uppercase tracking-[0.12em] text-ink" style={{ fontSize: 11 }}>{t.name}</span>
                <span className="h-3 overflow-hidden rounded-full bg-beige">
                  <span className="block h-full rounded-full" style={{ width: `${(counts[i] / maxCount) * 100}%`, background: tierColor(t) }} />
                </span>
                <span className="text-right tabular-nums">
                  <b>{num(counts[i])}</b> <span className="text-ink-3">· {inr(revenueByTier[i])}</span>
                </span>
              </div>
            ))}
          </div>
        </Card>

        <Card title="Qualifying revenue by month" sub="Orders that count toward tiers">
          <div className="flex h-44 items-end gap-1.5" role="img" aria-label="Monthly qualifying revenue for the last 12 months">
            {months.map((m) => (
              <div key={m.label + m.value} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
                <span className="w-full rounded-t-[4px] bg-navy" style={{ height: `${Math.max(2, (m.value / maxMonth) * 100)}%` }} title={`${m.label}: ${inr(m.value)}`} />
                <span className="text-[10.5px] text-ink-3">{m.label}</span>
              </div>
            ))}
          </div>
          <p className="mt-2 text-[12px] text-ink-3">Highest month: {inr(maxMonth)}</p>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Almost at the next tier" sub="Members within 20% of moving up. A good list for a personal call or message.">
          {near.length === 0 ? (
            <p className="text-sm text-ink-3">No one is close to the next tier right now.</p>
          ) : (
            <table className="w-full text-left text-[13px]">
              <thead className="border-b-2 border-black/10 text-[11px] uppercase tracking-wide text-ink/50">
                <tr><th className="py-2 font-medium">Customer</th><th className="py-2 font-medium">Now</th><th className="py-2 text-right font-medium">To go</th></tr>
              </thead>
              <tbody>
                {near.slice(0, 10).map((n) => (
                  <tr key={n.id} className="border-t border-black/5">
                    <td className="py-2.5"><Link href={`/customers/${n.id}`} className="font-medium text-ink hover:underline">{n.name}</Link></td>
                    <td className="py-2.5 text-ink-2">{tiers[n.tier].name}</td>
                    <td className="py-2.5 text-right tabular-nums text-ink">{n.text}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        <Card title="Campaigns" sub="Switch them on from Campaigns" action={<Link href="/club/campaigns" className="text-[13px] font-semibold text-ink-2 hover:text-ink">Manage</Link>}>
          <ul className="divide-y divide-black/5">
            {campaigns.slice(0, 6).map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 py-2.5 text-[13px]">
                <span>
                  <b className="font-semibold text-ink">{c.name}</b>
                  <span className="block text-[12px] text-ink-3">
                    {c.starts_on} to {c.ends_on} · {c.campaign_type === "multiplier" ? `${Number(c.multiplier)}× points` : `+${c.bonus_points} points`}
                  </span>
                </span>
                <StatusPill status={campaignStatus(c)} />
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
