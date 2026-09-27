import { createClient } from "@/lib/supabase/server";
import { loadConfig, loadCustomers, loadQualifying, loadTiers } from "@/lib/loyalty/data";
import { mult, num, tierColor, tierIndex } from "@/lib/loyalty/engine";
import { addBenefit, removeBenefit, saveBenefitMatrix, saveTiers } from "../actions";
import { btnPrimary, btnSecondary, Card, ClubHeader, inputCls } from "../ui";

export const dynamic = "force-dynamic";

const rs = (minor: number | null) => (minor === null || minor === undefined ? "" : String(Math.round(minor) / 100));
const cell = "px-3 py-2.5";
const small = "w-full border border-black/10 px-2.5 py-1.5 text-[13px] text-ink text-right tabular-nums";

export default async function ClubTiersPage({ searchParams }: { searchParams: { saved?: string; error?: string } }) {
  const supabase = createClient();
  const [cfg, tiers] = await Promise.all([loadConfig(supabase), loadTiers(supabase)]);
  if (!cfg) return <ClubHeader current="/club/tiers" title="Tiers & benefits" sub="No rules row found. Run the Club setup scripts first." />;

  const [{ byCustomer }, customers, benefitsRes, valuesRes] = await Promise.all([
    loadQualifying(supabase, cfg.qualification_period_months),
    loadCustomers(supabase),
    supabase.from("loyalty_benefit").select("id, name, note, auto_source, sort_order").is("deleted_at", null).order("sort_order"),
    supabase.from("loyalty_benefit_value").select("benefit_id, loyalty_tier_id, included, label"),
  ]);
  const counts = tiers.map(() => 0);
  for (const c of customers) counts[tierIndex(cfg, tiers, byCustomer.get(c.id) ?? { spend: 0, orders: 0 })] += 1;

  const benefits = (benefitsRes.data ?? []) as { id: string; name: string; note: string | null; auto_source: string | null }[];
  const values = new Map<string, { included: boolean; label: string | null }>();
  for (const v of (valuesRes.data ?? []) as { benefit_id: string; loyalty_tier_id: string; included: boolean; label: string | null }[]) {
    values.set(`${v.benefit_id}|${v.loyalty_tier_id}`, v);
  }
  const modeNote =
    cfg.qualification_mode === "spend"
      ? "Qualification uses spend only, so the orders column is ignored until you change the rule."
      : cfg.qualification_mode === "orders"
        ? "Qualification uses order count only, so the spend column is ignored until you change the rule."
        : "Members must meet both the spend and the orders level.";

  return (
    <div className="space-y-6">
      <ClubHeader
        current="/club/tiers"
        title="Tiers & benefits"
        sub={`Levels are measured over ${cfg.qualification_period_months} months. ${modeNote}`}
        saved={searchParams.saved}
      />
      {searchParams.error && <div role="alert" className="rounded-xl bg-[#f6e4df] px-4 py-3 text-[13px] font-medium text-[#9c3326]">{searchParams.error}</div>}

      <form action={saveTiers}>
        <Card title="Tiers" sub="Leave free pickup or turnaround empty to use the standard rule.">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-left text-[13px]">
              <thead className="border-b-2 border-black/10 text-[11px] uppercase tracking-wide text-ink/50">
                <tr>
                  <th className={cell}>Tier</th>
                  <th className={cell + " text-right"}>Spend (₹)</th>
                  <th className={cell + " text-right"}>Orders</th>
                  <th className={cell + " text-right"}>Multiplier</th>
                  <th className={cell + " text-right"}>Birthday pts</th>
                  <th className={cell + " text-right"}>Free pickup over (₹)</th>
                  <th className={cell}>Priority</th>
                  <th className={cell + " text-right"}>Turnaround (h)</th>
                  <th className={cell + " text-right"}>Members</th>
                </tr>
              </thead>
              <tbody>
                {tiers.map((t, i) => (
                  <tr key={t.id} className="border-t border-black/5 align-top">
                    <td className={cell}>
                      <input type="hidden" name="tier_id" value={t.id} />
                      <div className="flex items-center gap-2">
                        <span className="h-8 w-2 shrink-0 rounded" style={{ background: tierColor(t) }} />
                        <input className="w-32 border border-black/10 px-2.5 py-1.5 text-[13px] font-semibold text-ink" name={`name_${t.id}`} defaultValue={t.name} aria-label="Tier name" />
                      </div>
                      <input className="mt-2 w-full min-w-[180px] border border-black/10 px-2.5 py-1.5 text-[12px] text-ink-2" name={`perk_${t.id}`} defaultValue={t.perk_description ?? ""} placeholder="Short summary" aria-label={`${t.name} summary`} />
                    </td>
                    <td className={cell}><input className={small} type="number" min={0} step={500} name={`min_spend_${t.id}`} defaultValue={rs(t.min_spend_minor)} readOnly={i === 0} aria-label={`${t.name} qualifying spend`} /></td>
                    <td className={cell}><input className={small} type="number" min={0} name={`min_orders_${t.id}`} defaultValue={t.min_orders} readOnly={i === 0} aria-label={`${t.name} qualifying orders`} /></td>
                    <td className={cell}><input className={small} type="number" min={0.1} step={0.1} name={`mult_${t.id}`} defaultValue={t.points_multiplier} aria-label={`${t.name} multiplier`} /></td>
                    <td className={cell}><input className={small} type="number" min={0} step={10} name={`bday_${t.id}`} defaultValue={t.birthday_points} aria-label={`${t.name} birthday points`} /></td>
                    <td className={cell}><input className={small} type="number" min={0} step={100} name={`free_${t.id}`} defaultValue={rs(t.free_delivery_above_minor)} placeholder="Standard" aria-label={`${t.name} free pickup threshold`} /></td>
                    <td className={cell}><input type="checkbox" name={`prio_${t.id}`} defaultChecked={t.priority_processing} aria-label={`${t.name} priority processing`} className="mt-2" /></td>
                    <td className={cell}><input className={small} type="number" min={1} step={12} name={`tat_${t.id}`} defaultValue={t.turnaround_hours ?? ""} placeholder="Standard" aria-label={`${t.name} turnaround hours`} /></td>
                    <td className={cell + " pt-4 text-right font-semibold tabular-nums"}>{num(counts[i])}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-4 flex justify-end">
            <button type="submit" className={btnPrimary}>Save tiers</button>
          </div>
        </Card>
      </form>

      <form action={saveBenefitMatrix}>
        <Card title="Benefit table" sub="What members see when they compare tiers. Custom text replaces the tick, for example “Orders over ₹800”.">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-left text-[13px]">
              <thead className="border-b-2 border-black/10 text-[11px] uppercase tracking-wide text-ink/50">
                <tr>
                  <th className={cell}>Benefit</th>
                  {tiers.map((t) => <th key={t.id} className={cell}>{t.name}</th>)}
                  <th className={cell}><span className="sr-only">Remove</span></th>
                </tr>
              </thead>
              <tbody>
                {benefits.map((b) => (
                  <tr key={b.id} className="border-t border-black/5 align-top">
                    <td className={cell + " min-w-[200px]"}>
                      <b className="font-semibold text-ink">{b.name}</b>
                      {b.note && <span className="block text-[11.5px] text-ink-3">{b.note}</span>}
                      {b.auto_source && <span className="block text-[11.5px] text-ink-3">From tier settings</span>}
                    </td>
                    {tiers.map((t) => {
                      if (b.auto_source === "multiplier") return <td key={t.id} className={cell + " tabular-nums"}>{mult(t.points_multiplier)}</td>;
                      if (b.auto_source === "birthday") return <td key={t.id} className={cell + " tabular-nums"}>{t.birthday_points} pts</td>;
                      const key = `${b.id}|${t.id}`;
                      const v = values.get(key);
                      const kind = !v || !v.included ? "no" : v.label ? "custom" : "yes";
                      return (
                        <td key={t.id} className={cell}>
                          <input type="hidden" name="cell" value={key} />
                          <select className="w-full border border-black/10 px-2 py-1.5 text-[12.5px] text-ink" name={`v_${key}`} defaultValue={kind} aria-label={`${b.name} for ${t.name}`}>
                            <option value="yes">Included</option>
                            <option value="no">Not included</option>
                            <option value="custom">Custom text</option>
                          </select>
                          <input className="mt-1.5 w-full border border-black/10 px-2 py-1 text-[12px] text-ink-2" name={`l_${key}`} defaultValue={v?.label ?? ""} placeholder="Custom text" aria-label={`${b.name} custom text for ${t.name}`} />
                        </td>
                      );
                    })}
                    <td className={cell}>
                      {!b.auto_source && (
                        <button formAction={removeBenefit} name="id" value={b.id} className="text-[12px] font-semibold text-ink-3 hover:text-[#9c3326]" aria-label={`Remove ${b.name}`}>
                          Remove
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-[12px] text-ink-3">Custom text only shows when the cell is set to “Custom text”.</p>
          <div className="mt-4 flex justify-end">
            <button type="submit" className={btnPrimary}>Save benefit table</button>
          </div>
        </Card>
      </form>

      <Card title="Add a benefit">
        <form action={addBenefit} className="flex flex-wrap items-end gap-3">
          <label className="flex min-w-[240px] flex-1 flex-col gap-1.5">
            <span className="text-[12.5px] font-semibold text-ink-2">Benefit name</span>
            <input className={inputCls} name="name" required placeholder="e.g. Free button repairs" />
          </label>
          <label className="flex min-w-[200px] flex-1 flex-col gap-1.5">
            <span className="text-[12.5px] font-semibold text-ink-2">Note (optional)</span>
            <input className={inputCls} name="note" placeholder="e.g. Where the fabric allows" />
          </label>
          <button type="submit" className={btnSecondary + " py-2"}>Add benefit</button>
        </form>
      </Card>
    </div>
  );
}
