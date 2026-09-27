import Link from "next/link";
import { redirect } from "next/navigation";
import { requireMember } from "@/lib/customer/session";
import { loadMember } from "@/lib/customer/member";
import { inr, mult, pts } from "@/lib/loyalty/engine";
import { AppShell, Card, TierCard, btn, fmtDate } from "../ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Membership · The London Wash Club" };

export default async function MemberMembershipPage() {
  const { customerId, db } = requireMember();
  const m = await loadMember(db, customerId);
  if (!m) redirect("/my/login");
  const [benefitsRes, valuesRes, historyRes] = await Promise.all([
    db.from("loyalty_benefit").select("id, name, note, auto_source").is("deleted_at", null).order("sort_order"),
    db.from("loyalty_benefit_value").select("benefit_id, loyalty_tier_id, included, label"),
    m.acct
      ? db.from("loyalty_transaction").select("created_at, tier_name, description").eq("loyalty_account_id", m.acct.id).eq("source", "tier_upgrade").order("created_at", { ascending: false })
      : Promise.resolve({ data: [] }),
  ]);
  const benefits = (benefitsRes.data ?? []) as { id: string; name: string; note: string | null; auto_source: string | null }[];
  const values = new Map<string, { included: boolean; label: string | null }>();
  for (const v of (valuesRes.data ?? []) as { benefit_id: string; loyalty_tier_id: string; included: boolean; label: string | null }[]) values.set(`${v.benefit_id}|${v.loyalty_tier_id}`, v);
  const cell = (bId: string, auto: string | null, tierIdx: number): string | boolean => {
    const t = m.tiers[tierIdx];
    if (auto === "multiplier") return mult(t.points_multiplier);
    if (auto === "birthday") return `${t.birthday_points} pts`;
    const v = values.get(`${bId}|${t.id}`);
    return v?.included ? v.label || true : false;
  };
  const mine = benefits.map((b) => ({ b, v: cell(b.id, b.auto_source, m.tierIdx) })).filter((x) => x.v);
  const mode = m.cfg.qualification_mode;
  const req = (i: number) => {
    const t = m.tiers[i];
    if (!t.min_spend_minor && !t.min_orders) return "On joining";
    if (mode === "orders") return `${t.min_orders} orders a year`;
    if (mode === "combo") return `${inr(t.min_spend_minor)} and ${t.min_orders} orders a year`;
    return `${inr(t.min_spend_minor)} a year`;
  };
  const history = (historyRes.data ?? []) as { created_at: string; tier_name: string | null; description: string | null }[];

  return (
    <AppShell current="/my/membership" title="Membership">
      <TierCard
        href="/my/card"
        style={m.tier.card_style}
        tierName={m.tier.name}
        memberNo={m.acct?.member_no ?? null}
        points={m.points}
        progressPct={m.pct}
        leftNote={m.leftNote}
        rightNote={m.gapText}
        renew={fmtDate(m.renew.toISOString())}
      />

      <div className="grid grid-cols-3 overflow-hidden rounded-[14px] border border-hair bg-hair text-center [&>div]:bg-white">
        <div className="px-2 py-3">
          <div className="text-[16px] font-bold tabular-nums">{m.points}</div>
          <div className="text-[11px] text-ink-2">Points</div>
        </div>
        <div className="mx-px px-2 py-3">
          <div className="text-[16px] font-bold tabular-nums">{inr(m.q.spend)}</div>
          <div className="text-[11px] text-ink-2">Spend, {m.cfg.qualification_period_months} months</div>
        </div>
        <div className="px-2 py-3">
          <div className="text-[16px] font-bold tabular-nums">{m.q.orders}</div>
          <div className="text-[11px] text-ink-2">Orders, {m.cfg.qualification_period_months} months</div>
        </div>
      </div>

      <Card className="flex flex-col gap-3 p-4">
        <h2 className="text-[15px] font-semibold">Your progress</h2>
        <ol className="flex flex-col">
          {m.tiers.map((t, i) => (
            <li key={t.id} className="grid grid-cols-[28px_1fr_auto] items-start gap-3">
              <span className="flex flex-col items-center">
                {i > 0 && <span className={"h-[18px] w-0.5 " + (i <= m.tierIdx ? "bg-ink" : "bg-hair-2")} />}
                <span
                  className={
                    "mt-[3px] h-3.5 w-3.5 rounded-full border-2 " +
                    (i < m.tierIdx ? "border-ink bg-ink" : i === m.tierIdx ? "border-brass bg-brass shadow-[0_0_0_5px_rgba(154,131,88,.22)]" : "border-hair-2 bg-ivory")
                  }
                />
              </span>
              <span style={{ paddingTop: i > 0 ? 18 : 0 }}>
                <span className="block text-[12px] font-bold uppercase tracking-[0.18em]">{t.name}</span>
                <span className="text-[12.5px] text-ink-2">
                  {req(i)} · {mult(t.points_multiplier)} points
                </span>
              </span>
              <span style={{ paddingTop: i > 0 ? 18 : 0 }}>
                {i === m.tierIdx && <span className="rounded-full border border-brass/50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-brass">You are here</span>}
              </span>
            </li>
          ))}
        </ol>
        <p className="font-semibold">{m.gapText}.</p>
        <Link href="/my/book" className={btn + " self-start px-5 text-[14px]"}>
          Book a pickup
        </Link>
      </Card>

      <section className="flex flex-col gap-2.5">
        <h2 className="text-[15px] font-semibold">Your {m.tier.name} benefits</h2>
        <Card>
          <ul className="divide-y divide-hair">
            {mine.map(({ b, v }) => (
              <li key={b.id} className="flex items-center justify-between gap-3 px-4 py-3 text-[13.5px]">
                <span>
                  {b.name}
                  {b.note && <span className="block text-[12px] text-ink-3">{b.note}</span>}
                </span>
                {v !== true && <span className="text-right text-[12.5px] text-ink-2">{String(v)}</span>}
              </li>
            ))}
          </ul>
        </Card>
      </section>

      <section id="compare" className="flex flex-col gap-2.5">
        <h2 className="text-[15px] font-semibold">Compare tiers</h2>
        <div className="-mx-5 overflow-x-auto px-5">
          <table className="w-full min-w-[520px] border-separate border-spacing-0 text-[12.5px]">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 border-b border-hair-2 bg-ivory py-2.5 pr-3 text-left text-[10.5px] font-bold uppercase tracking-[0.14em] text-ink-2">Benefit</th>
                {m.tiers.map((t, i) => (
                  <th key={t.id} className={"border-b border-hair-2 px-2 py-2.5 text-center text-[10.5px] font-bold uppercase tracking-[0.14em] " + (i === m.tierIdx ? "bg-brass/10 text-ink" : "text-ink-2")}>
                    {t.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {benefits.map((b) => (
                <tr key={b.id}>
                  <td className="sticky left-0 z-10 border-b border-hair bg-ivory py-2.5 pr-3">{b.name}</td>
                  {m.tiers.map((t, i) => {
                    const v = cell(b.id, b.auto_source, i);
                    return (
                      <td key={t.id} className={"border-b border-hair px-2 py-2.5 text-center " + (i === m.tierIdx ? "bg-brass/10" : "")}>
                        {v === true ? <span aria-label="Included">✓</span> : v ? <span className="text-[11.5px]">{v}</span> : <span className="text-ink-3" aria-label="Not included">—</span>}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {history.length > 0 && (
        <section className="flex flex-col gap-2.5">
          <h2 className="text-[15px] font-semibold">Tier history</h2>
          <Card>
            <ul className="divide-y divide-hair">
              {history.map((h, i) => (
                <li key={i} className="flex justify-between gap-3 px-4 py-3 text-[13.5px]">
                  <span>{h.description}</span>
                  <span className="text-ink-3">{fmtDate(h.created_at)}</span>
                </li>
              ))}
            </ul>
          </Card>
        </section>
      )}

      <Card>
        <details className="border-b border-hair">
          <summary className="cursor-pointer list-none px-4 py-3.5 text-[14px] font-semibold">How tiers work</summary>
          <p className="px-4 pb-4 text-[13.5px] text-ink-2">
            Your tier is based on your {mode === "spend" ? "spend" : mode === "orders" ? "number of orders" : "spend and number of orders"} over the last{" "}
            {m.cfg.qualification_period_months} months. Moving up a tier adds {m.cfg.bonus_tier_upgrade_points} bonus points.
          </p>
        </details>
        <details className="border-b border-hair">
          <summary className="cursor-pointer list-none px-4 py-3.5 text-[14px] font-semibold">Points and expiry</summary>
          <p className="px-4 pb-4 text-[13.5px] text-ink-2">
            You earn 1 point for every {inr(m.cfg.spend_per_point_minor)} you pay, multiplied by your tier. Points from an order become available when it&apos;s delivered.
            Points expire {m.cfg.points_expiry_months} months after they&apos;re earned. {pts(m.cfg, 100)} points are worth {inr(100 * m.cfg.point_value_minor)}.
          </p>
        </details>
        <details>
          <summary className="cursor-pointer list-none px-4 py-3.5 text-[14px] font-semibold">Changes to the Club</summary>
          <p className="px-4 pb-4 text-[13.5px] text-ink-2">We may update benefits, rewards and qualifying levels, and will tell you before a change affects your tier.</p>
        </details>
      </Card>
    </AppShell>
  );
}
