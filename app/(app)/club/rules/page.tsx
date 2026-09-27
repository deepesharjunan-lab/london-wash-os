import { createClient } from "@/lib/supabase/server";
import { loadConfig, loadTiers } from "@/lib/loyalty/data";
import { inr, orderPoints } from "@/lib/loyalty/engine";
import { saveRules } from "../actions";
import { btnPrimary, Card, ClubHeader, Field, inputCls } from "../ui";

export const dynamic = "force-dynamic";

const rs = (minor: number) => String(Math.round(minor) / 100);

export default async function ClubRulesPage({ searchParams }: { searchParams: { saved?: string; error?: string } }) {
  const supabase = createClient();
  const [cfg, tiers] = await Promise.all([loadConfig(supabase), loadTiers(supabase)]);
  if (!cfg) {
    return <ClubHeader current="/club/rules" title="Loyalty rules" sub="No rules row found. Run the Club setup scripts first." />;
  }
  const top = tiers[tiers.length - 1];
  const entry = tiers[0];
  const example = 285000; // ₹2,850 order
  const exEntry = entry ? orderPoints(cfg, entry, example, { app: true, pickup: true }) : 0;
  const exTop = top ? orderPoints(cfg, top, example, { app: true, pickup: true }) : 0;

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
        sub="How members qualify, earn and use points. Saving applies the new rules to every member straight away."
        saved={searchParams.saved}
      />
      {searchParams.error && <div role="alert" className="rounded-xl bg-[#f6e4df] px-4 py-3 text-[13px] font-medium text-[#9c3326]">{searchParams.error}</div>}

      <div className="rounded-xl bg-beige px-4 py-3 text-[13.5px] text-ink">
        With the current rules, a {inr(example)} order placed in the app with pickup earns <b>{exEntry} points</b>
        {entry ? ` for ${entry.name}` : ""} and <b>{exTop} points</b>{top ? ` for ${top.name}` : ""}. 500 points are worth{" "}
        <b>{inr(500 * cfg.point_value_minor)}</b> at checkout.
      </div>

      <form action={saveRules} className="space-y-6">
        <input type="hidden" name="id" value={cfg.id} />

        <Card title="Tier qualification" sub="What moves members between tiers. The levels themselves are set on Tiers & benefits.">
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

        <Card title="Earning and redeeming" sub="Base rates, before tier multipliers and campaigns.">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Spend for 1 point (₹)" hint={`Now: 1 point for every ${inr(cfg.spend_per_point_minor)}`}><input className={inputCls} type="number" min={1} step="1" name="spend_per_point" defaultValue={rs(cfg.spend_per_point_minor)} /></Field>
            <Field label="Value of 1 point (₹)" hint="Used at checkout and for the liability figure"><input className={inputCls} type="number" min={0} step="0.01" name="point_value" defaultValue={rs(cfg.point_value_minor)} /></Field>
            <Field label="Points expire after (months)"><input className={inputCls} type="number" min={1} name="points_expiry_months" defaultValue={cfg.points_expiry_months} /></Field>
            <Field label="Points can pay up to (% of order)"><input className={inputCls} type="number" min={1} max={100} name="max_redeem_pct" defaultValue={cfg.max_redeem_pct} /></Field>
            <Field label="Redeem in steps of (points)"><input className={inputCls} type="number" min={1} name="redeem_step_points" defaultValue={cfg.redeem_step_points} /></Field>
            <Field label="Points become available">
              <select className={inputCls} name="points_available_on" defaultValue={cfg.points_available_on}>
                <option value="delivered">When the order is delivered</option>
                <option value="paid">When the order is paid</option>
              </select>
            </Field>
          </div>
        </Card>

        <Card title="Bonus points" sub="Added on top of order points. Set any value to 0 to switch it off.">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Welcome bonus"><input className={inputCls} type="number" min={0} name="bonus_welcome_points" defaultValue={cfg.bonus_welcome_points} /></Field>
            <Field label="Completed review" hint="Once per order"><input className={inputCls} type="number" min={0} name="bonus_review_points" defaultValue={cfg.bonus_review_points} /></Field>
            <Field label="Review window (days after delivery)"><input className={inputCls} type="number" min={1} name="review_window_days" defaultValue={cfg.review_window_days} /></Field>
            <Field label="App order bonus"><input className={inputCls} type="number" min={0} name="bonus_app_order_points" defaultValue={cfg.bonus_app_order_points} /></Field>
            <Field label="Pickup & delivery bonus"><input className={inputCls} type="number" min={0} name="bonus_pickup_points" defaultValue={cfg.bonus_pickup_points} /></Field>
            <Field label="Festival bonus on every order" hint="For dated festivals, use Campaigns"><input className={inputCls} type="number" min={0} name="bonus_festival_points" defaultValue={cfg.bonus_festival_points} /></Field>
          </div>
        </Card>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card title="Refer a friend">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Friend receives (₹)"><input className={inputCls} type="number" min={0} name="referral_give" defaultValue={rs(cfg.referral_give_minor)} /></Field>
              <Field label="Member receives (₹)"><input className={inputCls} type="number" min={0} name="referral_get" defaultValue={rs(cfg.referral_get_minor)} /></Field>
              <Field label="Friend's minimum first order (₹)"><input className={inputCls} type="number" min={0} name="referral_min_first_order" defaultValue={rs(cfg.referral_min_first_order_minor)} /></Field>
              <Field label="Reward valid for (days)"><input className={inputCls} type="number" min={1} name="referral_validity_days" defaultValue={cfg.referral_validity_days} /></Field>
            </div>
            <div className="mt-4 space-y-2 text-[13.5px] text-ink">
              <label className="flex items-center gap-2"><input type="checkbox" name="referral_block_same_household" defaultChecked={cfg.referral_block_same_household} /> Block referrals within the same household or address</label>
              <label className="flex items-center gap-2"><input type="checkbox" name="referral_block_same_device" defaultChecked={cfg.referral_block_same_device} /> Block referrals from the same device or phone number</label>
            </div>
          </Card>
          <Card title="Birthday and delivery" sub="Birthday points per tier are on Tiers & benefits.">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2"><Field label="Birthday perk"><input className={inputCls} name="birthday_perk" defaultValue={cfg.birthday_perk} /></Field></div>
              <Field label="Pickup & delivery fee (₹)"><input className={inputCls} type="number" min={0} name="delivery_fee" defaultValue={rs(cfg.delivery_fee_minor)} /></Field>
              <Field label="Free pickup for everyone over (₹)"><input className={inputCls} type="number" min={0} name="free_delivery_above" defaultValue={rs(cfg.free_delivery_above_minor)} /></Field>
            </div>
          </Card>
        </div>

        <div className="sticky bottom-4 flex justify-end">
          <button type="submit" className={btnPrimary + " shadow-lg"}>Save rules</button>
        </div>
      </form>
    </div>
  );
}
