import Link from "next/link";
import { redirect } from "next/navigation";
import { requireMember } from "@/lib/customer/session";
import { loadMember, STAGES, stageIndex } from "@/lib/customer/member";
import { campaignStatus, pts } from "@/lib/loyalty/engine";
import { AppShell, Card, Icon, Notice, TierCard, fmtDate } from "./ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "The London Wash Club" };

const greeting = () => {
  const h = Number(new Date().toLocaleString("en-IN", { hour: "numeric", hour12: false, timeZone: "Asia/Kolkata" }));
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
};

export default async function MemberHomePage() {
  const { customerId, db } = requireMember();
  const m = await loadMember(db, customerId);
  if (!m) redirect("/my/login");
  const today = new Date().toISOString().slice(0, 10);

  const [activeRes, pickupRes, rewardsRes, campaignsRes, bdayRes] = await Promise.all([
    db.from("order").select("id, order_number, status, created_at").eq("customer_id", customerId).in("status", ["confirmed", "in_production", "ready", "out_for_delivery"]).order("created_at", { ascending: false }).limit(3),
    db.from("pickup").select("id, scheduled_window_start, scheduled_window_end, status").eq("customer_id", customerId).eq("status", "scheduled").gte("scheduled_window_start", new Date().toISOString()).order("scheduled_window_start").limit(1),
    db.from("reward").select("id, name, points_cost, min_tier_id").is("deleted_at", null).eq("is_active", true).eq("is_draft", false).order("points_cost"),
    db.from("loyalty_campaign").select("id, name, occasion, message, perk, starts_on, ends_on, is_enabled, min_tier_id").is("deleted_at", null).eq("is_enabled", true).lte("starts_on", today).gte("ends_on", today).limit(1),
    m.acct ? db.from("loyalty_transaction").select("id").eq("loyalty_account_id", m.acct.id).eq("bonus_key", `birthday:${new Date().getFullYear()}`).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const active = (activeRes.data ?? []) as { id: string; order_number: string; status: string; created_at: string }[];
  const pickup = ((pickupRes.data ?? []) as { id: string; scheduled_window_start: string; scheduled_window_end: string }[])[0];
  const available = m.wallet?.available ?? 0;
  const eligible = ((rewardsRes.data ?? []) as { id: string; name: string; points_cost: number; min_tier_id: string | null }[]).filter((r) => {
    const need = r.min_tier_id ? m.tiers.findIndex((t) => t.id === r.min_tier_id) : 0;
    return need <= m.tierIdx;
  });
  const nextReward = eligible.find((r) => r.points_cost > available);
  const canRedeem = eligible.filter((r) => r.points_cost <= available).length;
  const campaign = ((campaignsRes.data ?? []) as { id: string; name: string; occasion: string | null; message: string | null; perk: string | null; starts_on: string; ends_on: string; is_enabled: boolean; min_tier_id: string | null }[]).find(
    (c) => campaignStatus(c) === "live"
  );
  const bdayMonth = m.customer.birth_date && Number(m.customer.birth_date.slice(5, 7)) === new Date().getMonth() + 1;
  const bdayDone = !!bdayRes.data;
  const o = active[0];
  const oIdx = o ? stageIndex(o.status) : -1;

  return (
    <AppShell current="/my">
      <div className="flex items-start justify-between pt-4">
        <div>
          <div className="text-[14px] text-ink-2">{greeting()},</div>
          <div className="font-display text-[30px] font-medium leading-tight">{m.firstName}</div>
        </div>
        <Link href="/my/points" className="grid h-11 w-11 place-items-center rounded-full hover:bg-beige" aria-label="My points">
          <Icon d='<path d="M12 3.5c.6 3.8 2.7 5.9 6.5 6.5-3.8.6-5.9 2.7-6.5 6.5-.6-3.8-2.7-5.9-6.5-6.5 3.8-.6 5.9-2.7 6.5-6.5z"/>' />
        </Link>
      </div>

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

      {m.wallet && m.wallet.expiringSoon > 0 && m.wallet.nextExpiry && (
        <Notice tone="warn">
          <b>{pts(m.cfg, m.wallet.expiringSoon)} points</b> expire from {fmtDate(m.wallet.nextExpiry)}. Use them on your next order.
        </Notice>
      )}

      {o && (
        <Link href={`/my/orders/${o.id}`}>
          <Card className="flex items-center gap-3 px-4 py-3.5">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-beige">
              <Icon d='<path d="M5.5 8h13l-1 12.2a1 1 0 0 1-1 .8H7.5a1 1 0 0 1-1-.8z"/><path d="M9 8V6.5a3 3 0 0 1 6 0V8"/>' />
            </span>
            <span className="min-w-0 flex-1">
              <b className="block text-[14px]">{STAGES[oIdx]?.label ?? "In progress"}</b>
              <span className="text-[12.5px] text-ink-2">
                {o.order_number}
                {active.length > 1 ? ` · ${active.length - 1} more active` : ""}
              </span>
              <span className="mt-2 flex gap-1" aria-hidden="true">
                {STAGES.map((s, k) => (
                  <i key={s.status} className={"h-[3px] flex-1 rounded " + (k < oIdx ? "bg-ink" : k === oIdx ? "bg-brass" : "bg-hair")} />
                ))}
              </span>
            </span>
          </Card>
        </Link>
      )}

      {pickup && (
        <Notice tone="info">
          Pickup booked for{" "}
          <b>
            {new Date(pickup.scheduled_window_start).toLocaleString("en-IN", { weekday: "short", day: "numeric", month: "short", hour: "numeric", timeZone: "Asia/Kolkata" })}
          </b>
          . We&apos;ll see you then.
        </Notice>
      )}

      <div className="grid grid-cols-4 gap-2">
        {[
          ["/my/book", "Book pickup", '<path d="M3 7h11v9H3zM14 10h4l3 3v3h-7"/><circle cx="7" cy="17.5" r="1.8"/><circle cx="17" cy="17.5" r="1.8"/>'],
          ["/my/card", "My card", '<rect x="4" y="4" width="6" height="6" rx=".5"/><rect x="14" y="4" width="6" height="6" rx=".5"/><rect x="4" y="14" width="6" height="6" rx=".5"/><path d="M14 14h2.5v2.5H14zM19 14h1M14 19h2.5v1M19 18v2"/>'],
          ["/my/rewards", "Rewards", '<rect x="4" y="9" width="16" height="11" rx="1"/><path d="M3 9h18M12 9v11"/>'],
          ["/my/points", "Points", '<path d="M12 3.5c.6 3.8 2.7 5.9 6.5 6.5-3.8.6-5.9 2.7-6.5 6.5-.6-3.8-2.7-5.9-6.5-6.5 3.8-.6 5.9-2.7 6.5-6.5z"/>'],
        ].map(([href, label, icon]) => (
          <Link key={href} href={href} className="flex flex-col items-center gap-2 text-[12px] font-semibold">
            <span className="grid h-14 w-14 place-items-center rounded-[18px] border border-hair bg-white shadow-sm">
              <Icon d={icon} className="h-[22px] w-[22px]" />
            </span>
            {label}
          </Link>
        ))}
      </div>

      {bdayMonth && !bdayDone && (
        <Notice tone="ok">
          <b>Your Birthday Bonus is on its way.</b> It&apos;s added to your points during your birthday month.
        </Notice>
      )}

      {nextReward ? (
        <Card className="flex flex-col gap-2.5 p-4">
          <h2 className="text-[15px] font-semibold">Your next reward is within reach</h2>
          <p className="text-[13.5px] text-ink-2">
            You&apos;re <b className="text-ink">{pts(m.cfg, nextReward.points_cost - available)} points</b> away from {nextReward.name}.
            {canRedeem ? ` You can redeem ${canRedeem} ${canRedeem === 1 ? "reward" : "rewards"} today.` : ""}
          </p>
          <div className="h-1.5 overflow-hidden rounded-full bg-hair">
            <div className="h-full rounded-full bg-navy" style={{ width: `${Math.min(100, Math.round((available / nextReward.points_cost) * 100))}%` }} />
          </div>
          <Link href="/my/rewards" className="self-start text-[13.5px] font-semibold underline-offset-4 hover:underline">
            See rewards
          </Link>
        </Card>
      ) : (
        canRedeem > 0 && (
          <Card className="p-4">
            <b>Your points are waiting.</b>
            <p className="text-[13.5px] text-ink-2">You can redeem any reward in the marketplace today.</p>
          </Card>
        )
      )}

      {campaign && (
        <section className="relative flex min-h-[132px] flex-col justify-end gap-1 overflow-hidden rounded-[14px] p-[18px] text-[#f6f1e7]" style={{ background: "radial-gradient(120% 90% at 85% 10%,rgba(214,190,140,.55),transparent 55%),radial-gradient(90% 90% at 10% 100%,rgba(120,30,40,.55),transparent 60%),linear-gradient(135deg,#6B1F2A,#3C1219)" }}>
          <span className="text-[11px] font-semibold uppercase tracking-[0.16em] opacity-80">
            {campaign.occasion ?? "Offer"} · until {fmtDate(campaign.ends_on)}
          </span>
          <h3 className="font-display text-[21px] font-medium leading-tight">{campaign.name}</h3>
          {campaign.message && <p className="text-[13px] opacity-90">{campaign.message}</p>}
          {campaign.perk && m.tierIdx >= 2 && <p className="text-[13px] opacity-90">{campaign.perk}</p>}
        </section>
      )}
    </AppShell>
  );
}
