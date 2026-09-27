import { createClient } from "@/lib/supabase/server";
import { loadConfig, loadServices, loadTiers } from "@/lib/loyalty/data";
import { computeEarning, inr, pts } from "@/lib/loyalty/engine";
import type { ClubConfig } from "@/lib/loyalty/engine";
import { saveRules } from "../actions";
import { btnPrimary, Card, ClubHeader, Field, inputCls } from "../ui";

export const dynamic = "force-dynamic";

const rs = (minor: number) => String(Math.round(minor) / 100);
const CHANNELS: [string, string][] = [["portal", "Customer app / portal"], ["whatsapp", "WhatsApp"], ["phone", "Phone"], ["pos_counter", "Store counter"]];

export default async function ClubRulesPage({ searchParams }: { searchParams: { saved?: string; error?: string } }) {
  const supabase = createClient();
  const [raw, tiers, services] = await Promise.all([loadConfig(supabase), loadTiers(supabase), loadServices(supabase)]);
  if (!raw) {
    return <ClubHeader current="/club/rules" title="Loyalty rules" sub="No rules row found. Run the Club setup scripts first." />;
  }
  const cfg: ClubConfig = {
    ...raw,
    redemption_denominations: raw.redemption_denominations ?? [],
    expiry_reminder_days: raw.expiry_reminder_days ?? [],
    app_order_channels: raw.app_order_channels ?? [],
    eligible_service_ids: raw.eligible_service_ids ?? [],
    excluded_item_ids: raw.excluded_item_ids ?? [],
  };
  const example = 200000; // Rs 2,000 eligible order
  const examples = tiers.map((t) => ({
    t,
    e: computeEarning(cfg, tiers, t, [], { eligibleMinor: example, eligibleByService: {}, orderDate: new Date().toISOString() }),
  }));
  const eligibleSvc = new Set(cfg.eligible_service_ids);

  const modes: [string, string, string][] = [
    ["spend", "Annual spend", "Members qualify on money spent in the period"],
    ["orders", "Number of orders", "Members qualify on how often they order"],
    ["combo", "Spend and orders", "Members must meet both levels"],
  ];

  return (
    <div className="space-y-6">
      <ClubHeader
        current="/club/rules"
        title="Loyalty rules"
        sub="How members qualify, earn, redeem and lose points. Saving applies the new rules from the next points transaction onward. Past transactions keep the rules they were calculated with."
        saved={searchParams.saved}
      />
      {searchParams.error && <div role="alert" className="rounded-xl bg-[#f6e4df] px-4 py-3 text-[13px] font-medium text-[#9c3326]">{searchParams.error}</div>}

      <div className="rounded-xl bg-beige px-4 py-3 text-[13.5px] text-ink">
        A {inr(example)} eligible order earns{" "}
        {examples.map(({ t, e }, i) => (
          <span key={t.id}>
            <b>{pts(cfg, e.total)}</b> for {t.name}
            {i < examples.length - 2 ? ", " : i === examples.length - 2 ? " and " : ""}
          </span>
        ))}
        . {pts(cfg, 100)} points are worth <b>{inr(100 * cfg.point_value_minor)}</b>.
      </div>

      <form action={saveRules} className="space-y-6">
        <input type="hidden" name="id" value={cfg.id} />

        <Card title="Tier qualification" sub="What moves members between tiers. The levels and multipliers are on Tiers & benefits.">
          <fieldset className="grid gap-3 md:grid-cols-3">
            <legend className="sr-only">Qualification mode</legend>
            {modes.map(([v, t, d]) => (
              <label key={v} className="flex cursor-pointer gap-3 rounded-xl border border-hair bg-white p-4 has-[:checked]:border-navy has-[:checked]:shadow-[inset_0_0_0_1px_#15213a]">
                <input type="radio" name="qualification_mode" value={v} defaultChecked={cfg.qualification_mode === v} className="mt-0.5" />
                <span>
                  <b className="block text-[14px] text-ink">{t}</b>
                  <span className="text-[12.5px] text-ink-2">{d}</span>
                </span>
              </label>
            ))}
          </fieldset>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Qualification period (months)"><input className={inputCls} type="number" min={1} name="qualification_period_months" defaultValue={cfg.qualification_period_months} /></Field>
            <Field label="Renewal period (months)"><input className={inputCls} type="number" min={1} name="renewal_period_months" defaultValue={cfg.renewal_period_months} /></Field>
            <Field label="Grace before moving down (days)"><input className={inputCls} type="number" min={0} name="downgrade_grace_days" defaultValue={cfg.downgrade_grace_days} /></Field>
            <label className="flex items-center gap-2 self-end pb-2 text-[13.5px] text-ink">
              <input type="checkbox" name="family_orders_count" defaultChecked={cfg.family_orders_count} /> Family orders count toward the main member
            </label>
          </div>
        </Card>

        <Card title="Earning" sub="Points are calculated on the eligible amount the customer actually pays: GST, fees, cancelled items, complimentary lines, refunds and points redeemed are left out.">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Spend for 1 base point (₹)" hint={`Now: 1 point per ${inr(cfg.spend_per_point_minor)}, before the tier multiplier`}><input className={inputCls} type="number" min={1} step="1" name="spend_per_point" defaultValue={rs(cfg.spend_per_point_minor)} /></Field>
            <Field label="Points shown with" hint="Decimals are always kept internally">
              <select className={inputCls} name="points_display_decimals" defaultValue={String(cfg.points_display_decimals)}>
                <option value="0">No decimals (31)</option>
                <option value="1">1 decimal (31.5)</option>
                <option value="2">2 decimals (31.50)</option>
              </select>
            </Field>
            <Field label="Max points per order" hint="Empty = no cap"><input className={inputCls} type="number" min={0} step="0.5" name="max_points_per_order" defaultValue={cfg.max_points_per_order ?? ""} /></Field>
            <Field label="Max promotional points per order" hint="Campaign points; empty = no cap"><input className={inputCls} type="number" min={0} step="0.5" name="max_promo_points_per_order" defaultValue={cfg.max_promo_points_per_order ?? ""} /></Field>
            <Field label="Points pending until">
              <select className={inputCls} name="points_available_on" defaultValue={cfg.points_available_on}>
                <option value="delivered">The order is delivered</option>
                <option value="paid">The order is paid</option>
              </select>
            </Field>
            <Field label="Earning starts on" hint="Orders delivered from this date earn points"><input className={inputCls} type="date" name="earning_starts_on" defaultValue={cfg.earning_starts_on} /></Field>
          </div>
          <fieldset className="mt-5">
            <legend className="mb-2 text-[12.5px] font-semibold text-ink-2">Eligible services (none ticked = all services earn points)</legend>
            <div className="flex flex-wrap gap-2">
              {services.map((s) => (
                <label key={s.id} className="inline-flex items-center gap-1.5 rounded-full border border-hair-2 bg-white px-3 py-1 text-[12.5px] text-ink">
                  <input type="checkbox" name="eligible_service_ids" value={s.id} defaultChecked={eligibleSvc.has(s.id)} /> {s.name}
                </label>
              ))}
            </div>
          </fieldset>
        </Card>

        <Card title="Redeeming" sub="What points are worth and how members can use them.">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Value of 100 points (₹)" hint={`Now: 100 points = ${inr(100 * cfg.point_value_minor)}`}><input className={inputCls} type="number" min={0} step="0.5" name="point_value_100" defaultValue={String((cfg.point_value_minor * 100) / 100)} /></Field>
            <Field label="Minimum balance to redeem"><input className={inputCls} type="number" min={0} name="min_redeem_balance" defaultValue={cfg.min_redeem_balance} /></Field>
            <Field label="Redemption amounts (points)" hint="Comma separated, e.g. 250, 500, 1000"><input className={inputCls} name="redemption_denominations" defaultValue={cfg.redemption_denominations.join(", ")} /></Field>
            <Field label="Points can pay up to (% of order)"><input className={inputCls} type="number" min={1} max={100} name="max_redeem_pct" defaultValue={cfg.max_redeem_pct} /></Field>
          </div>
          <p className="mt-3 text-[12.5px] text-ink-3">
            {cfg.redemption_denominations.map((d) => `${d} points = ${inr(d * cfg.point_value_minor)}`).join(" · ")}
          </p>
        </Card>

        <Card title="Bonus points" sub="Added on top of order points. Each is awarded once per event. Set a value to 0 to switch it off.">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="New Member Bonus" hint="Once, when a customer joins"><input className={inputCls} type="number" min={0} name="bonus_welcome_points" defaultValue={cfg.bonus_welcome_points} /></Field>
            <Field label="Referral Bonus" hint="To the referrer, after the friend's first paid order"><input className={inputCls} type="number" min={0} name="bonus_referral_points" defaultValue={cfg.bonus_referral_points} /></Field>
            <Field label="Referred friend's bonus" hint="Optional; 0 = off"><input className={inputCls} type="number" min={0} name="bonus_referral_friend_points" defaultValue={cfg.bonus_referral_friend_points} /></Field>
            <Field label="Tier Upgrade Bonus" hint="Only for a real upgrade, not a renewal"><input className={inputCls} type="number" min={0} name="bonus_tier_upgrade_points" defaultValue={cfg.bonus_tier_upgrade_points} /></Field>
            <Field label="App Order Bonus"><input className={inputCls} type="number" min={0} name="bonus_app_order_points" defaultValue={cfg.bonus_app_order_points} /></Field>
            <Field label="Pickup & Delivery Bonus"><input className={inputCls} type="number" min={0} name="bonus_pickup_points" defaultValue={cfg.bonus_pickup_points} /></Field>
            <Field label="Completed Review Bonus" hint="Once per completed order"><input className={inputCls} type="number" min={0} name="bonus_review_points" defaultValue={cfg.bonus_review_points} /></Field>
            <Field label="Review window (days after delivery)"><input className={inputCls} type="number" min={1} name="review_window_days" defaultValue={cfg.review_window_days} /></Field>
          </div>
          <p className="mt-3 text-[12.5px] text-ink-3">Birthday Bonus points are set per tier on Tiers & benefits (currently {tiers.map((t) => `${t.name} ${t.birthday_points}`).join(", ")}).</p>
          <fieldset className="mt-4">
            <legend className="mb-2 text-[12.5px] font-semibold text-ink-2">Orders from these channels get the App Order Bonus</legend>
            <div className="flex flex-wrap gap-2">
              {CHANNELS.map(([v, l]) => (
                <label key={v} className="inline-flex items-center gap-1.5 rounded-full border border-hair-2 bg-white px-3 py-1 text-[12.5px] text-ink">
                  <input type="checkbox" name="app_order_channels" value={v} defaultChecked={cfg.app_order_channels.includes(v)} /> {l}
                </label>
              ))}
            </div>
          </fieldset>
          <input type="hidden" name="bonus_festival_points" value={cfg.bonus_festival_points} />
        </Card>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card title="Stacking" sub="Tier multiplier and campaign multiplier always combine (1.5× tier during a 2× campaign = 3×).">
            <div className="space-y-2.5 text-[13.5px] text-ink">
              <label className="flex items-start gap-2"><input type="checkbox" name="campaigns_stack" defaultChecked={cfg.campaigns_stack} className="mt-1" /> <span>Let campaigns running at the same time stack with each other<span className="block text-[12px] text-ink-3">Off: only the best campaign applies, plus any campaign marked “stackable”.</span></span></label>
              <label className="flex items-start gap-2"><input type="checkbox" name="birthday_stacks_with_campaigns" defaultChecked={cfg.birthday_stacks_with_campaigns} className="mt-1" /> <span>Let birthday campaigns stack with the Birthday Bonus<span className="block text-[12px] text-ink-3">Off: a campaign whose name or occasion mentions “birthday” is skipped once the member has had this year's Birthday Bonus.</span></span></label>
            </div>
          </Card>
          <Card title="Expiry and reversals">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Points expire after (months)" hint="Counted from the date each point is earned"><input className={inputCls} type="number" min={1} name="points_expiry_months" defaultValue={cfg.points_expiry_months} /></Field>
              <Field label="“Expiring soon” warning (days)"><input className={inputCls} type="number" min={1} name="expiry_warning_days" defaultValue={cfg.expiry_warning_days} /></Field>
              <div className="sm:col-span-2"><Field label="Reminder days before expiry" hint="Comma separated, e.g. 30, 7, 1"><input className={inputCls} name="expiry_reminder_days" defaultValue={cfg.expiry_reminder_days.join(", ")} /></Field></div>
            </div>
            <div className="mt-4 space-y-2 text-[13.5px] text-ink">
              <label className="flex items-center gap-2"><input type="checkbox" name="reverse_on_cancel" defaultChecked={cfg.reverse_on_cancel} /> Reverse points when a completed order is cancelled</label>
              <label className="flex items-center gap-2"><input type="checkbox" name="reverse_on_refund" defaultChecked={cfg.reverse_on_refund} /> Reverse points in proportion to a refund</label>
              <label className="flex items-center gap-2"><input type="checkbox" name="allow_negative_balance" defaultChecked={cfg.allow_negative_balance} /> Allow a reversal to take the balance below zero</label>
            </div>
          </Card>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card title="Refer a friend">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Friend receives (₹ off first order)"><input className={inputCls} type="number" min={0} name="referral_give" defaultValue={rs(cfg.referral_give_minor)} /></Field>
              <Field label="Member receives (₹ voucher)"><input className={inputCls} type="number" min={0} name="referral_get" defaultValue={rs(cfg.referral_get_minor)} /></Field>
              <Field label="Friend's minimum first order (₹)"><input className={inputCls} type="number" min={0} name="referral_min_first_order" defaultValue={rs(cfg.referral_min_first_order_minor)} /></Field>
              <Field label="Reward valid for (days)"><input className={inputCls} type="number" min={1} name="referral_validity_days" defaultValue={cfg.referral_validity_days} /></Field>
            </div>
            <div className="mt-4 space-y-2 text-[13.5px] text-ink">
              <label className="flex items-center gap-2"><input type="checkbox" name="referral_block_same_household" defaultChecked={cfg.referral_block_same_household} /> Block referrals within the same household or address</label>
              <label className="flex items-center gap-2"><input type="checkbox" name="referral_block_same_device" defaultChecked={cfg.referral_block_same_device} /> Block referrals from the same device or phone number</label>
            </div>
          </Card>
          <Card title="Birthday and delivery">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2"><Field label="Birthday perk shown with the points"><input className={inputCls} name="birthday_perk" defaultValue={cfg.birthday_perk} /></Field></div>
              <Field label="Pickup & delivery fee (₹)"><input className={inputCls} type="number" min={0} name="delivery_fee" defaultValue={rs(cfg.delivery_fee_minor)} /></Field>
              <Field label="Free pickup for everyone over (₹)"><input className={inputCls} type="number" min={0} name="free_delivery_above" defaultValue={rs(cfg.free_delivery_above_minor)} /></Field>
            </div>
          </Card>
        </div>

        <input type="hidden" name="redeem_step_points" value={cfg.redeem_step_points} />
        <div className="sticky bottom-4 flex justify-end">
          <button type="submit" className={btnPrimary + " shadow-lg"}>Save rules</button>
        </div>
      </form>
    </div>
  );
}
