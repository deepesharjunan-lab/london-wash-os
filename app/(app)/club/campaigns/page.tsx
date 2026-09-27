import { createClient } from "@/lib/supabase/server";
import { loadConfig, loadServices, loadTiers } from "@/lib/loyalty/data";
import { campaignStatus, inr } from "@/lib/loyalty/engine";
import { createCampaign, removeCampaign, saveCampaign, toggleCampaign } from "../actions";
import { btnPrimary, btnSecondary, Card, ClubHeader, Field, inputCls, StatusPill } from "../ui";

export const dynamic = "force-dynamic";

type Campaign = {
  id: string;
  name: string;
  occasion: string | null;
  campaign_type: "multiplier" | "bonus";
  multiplier: number;
  bonus_points: number;
  min_order_minor: number;
  service_ids: string[] | null;
  min_tier_id: string | null;
  starts_on: string;
  ends_on: string;
  is_enabled: boolean;
  message: string | null;
  perk: string | null;
};

const OCCASIONS = ["Onam", "Vishu", "Eid", "Christmas", "Wedding season", "School reopening", "Monsoon", "Other"];
const ORDER: Record<string, number> = { live: 0, scheduled: 1, off: 2, ended: 3 };
const rs = (minor: number) => String(Math.round(minor) / 100);

export default async function ClubCampaignsPage({ searchParams }: { searchParams: { saved?: string; error?: string } }) {
  const supabase = createClient();
  const [cfg, tiers, services, res] = await Promise.all([
    loadConfig(supabase),
    loadTiers(supabase),
    loadServices(supabase),
    supabase
      .from("loyalty_campaign")
      .select("id, name, occasion, campaign_type, multiplier, bonus_points, min_order_minor, service_ids, min_tier_id, starts_on, ends_on, is_enabled, message, perk")
      .is("deleted_at", null),
  ]);
  const campaigns = ((res.data ?? []) as Campaign[]).sort(
    (a, b) => ORDER[campaignStatus(a)] - ORDER[campaignStatus(b)] || a.starts_on.localeCompare(b.starts_on)
  );
  const svcName = new Map<string, string>(services.map((s) => [s.id, s.name] as [string, string]));
  const tierName = new Map<string, string>(tiers.map((t) => [t.id, t.name] as [string, string]));
  const elite = tiers[1];

  return (
    <div className="space-y-6">
      <ClubHeader
        current="/club/campaigns"
        title="Campaigns"
        sub="Seasonal offers for Onam, Vishu, Eid, Christmas, wedding season and more. A switched-on campaign runs only between its dates, with no release needed."
        saved={searchParams.saved}
      />
      {searchParams.error && <div role="alert" className="rounded-xl bg-[#f6e4df] px-4 py-3 text-[13px] font-medium text-[#9c3326]">{searchParams.error}</div>}

      <Card title="Start from an occasion" sub="Creates a switched-off draft two weeks from today, with sensible defaults you can change.">
        <form action={createCampaign} className="flex flex-wrap gap-2">
          {OCCASIONS.map((o) => (
            <button key={o} type="submit" name="occasion" value={o} className={btnSecondary}>+ {o}</button>
          ))}
        </form>
      </Card>

      <div className="space-y-3">
        {campaigns.map((c) => {
          const st = campaignStatus(c);
          const offer = c.campaign_type === "multiplier" ? `${Number(c.multiplier)}× points` : `+${c.bonus_points} points`;
          const scope = c.service_ids && c.service_ids.length ? c.service_ids.map((s) => svcName.get(s) ?? "").filter(Boolean).join(", ") : "All services";
          // Example: a ₹1,800 order from the second tier
          const base = cfg ? Math.floor(180000 / cfg.spend_per_point_minor) : 18;
          const tierMult = elite ? Number(elite.points_multiplier) : 1;
          const normal = Math.floor(base * tierMult);
          const extra = c.campaign_type === "multiplier" ? Math.floor(base * (Number(c.multiplier) - 1)) : 180000 >= c.min_order_minor ? c.bonus_points : 0;
          return (
            <details key={c.id} className="group border border-black/10 bg-white [border-radius:14px]">
              <summary className="flex cursor-pointer list-none flex-wrap items-center gap-4 px-5 py-4">
                <span className="min-w-[220px] flex-1">
                  <b className="block text-[14px] text-ink">{c.name}</b>
                  <span className="text-[12.5px] text-ink-2">
                    {c.occasion ? `${c.occasion} · ` : ""}{c.starts_on} to {c.ends_on} · {offer}
                    {c.min_order_minor ? ` on orders over ${inr(c.min_order_minor)}` : ""} · {scope}
                    {c.min_tier_id ? ` · ${tierName.get(c.min_tier_id) ?? "Tier"} and above` : ""}
                  </span>
                </span>
                <StatusPill status={st} />
                <span className="text-[12.5px] font-semibold text-ink-3 group-open:hidden">Edit</span>
              </summary>
              <div className="space-y-4 border-t border-black/5 px-5 py-5">
                {elite && (
                  <div className="rounded-xl bg-beige px-4 py-3 text-[13px] text-ink">
                    A {inr(180000)} order from an {elite.name} member earns <b>{normal + extra} points</b> during this campaign, instead of {normal}.
                  </div>
                )}
                <form action={saveCampaign} className="space-y-4">
                  <input type="hidden" name="id" value={c.id} />
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <div className="sm:col-span-2"><Field label="Campaign name"><input className={inputCls} name="name" defaultValue={c.name} required /></Field></div>
                    <Field label="Occasion"><input className={inputCls} name="occasion" defaultValue={c.occasion ?? ""} /></Field>
                    <Field label="Type">
                      <select className={inputCls} name="campaign_type" defaultValue={c.campaign_type}>
                        <option value="multiplier">Points multiplier</option>
                        <option value="bonus">Bonus points</option>
                      </select>
                    </Field>
                    <Field label="Multiplier" hint="Used when the type is multiplier"><input className={inputCls} type="number" min={1} step={0.1} name="multiplier" defaultValue={Number(c.multiplier)} /></Field>
                    <Field label="Bonus points" hint="Used when the type is bonus"><input className={inputCls} type="number" min={0} name="bonus_points" defaultValue={c.bonus_points} /></Field>
                    <Field label="Minimum order (₹)"><input className={inputCls} type="number" min={0} name="min_order" defaultValue={rs(c.min_order_minor)} /></Field>
                    <Field label="Eligible tiers">
                      <select className={inputCls} name="min_tier_id" defaultValue={c.min_tier_id ?? ""}>
                        <option value="">All members</option>
                        {tiers.slice(1).map((t) => <option key={t.id} value={t.id}>{t.name} and above</option>)}
                      </select>
                    </Field>
                    <Field label="Starts"><input className={inputCls} type="date" name="starts_on" defaultValue={c.starts_on} required /></Field>
                    <Field label="Ends"><input className={inputCls} type="date" name="ends_on" defaultValue={c.ends_on} required /></Field>
                    <div className="sm:col-span-2"><Field label="Message members see"><input className={inputCls} name="message" defaultValue={c.message ?? ""} /></Field></div>
                    <div className="sm:col-span-2 lg:col-span-4"><Field label="Extra privilege for higher tiers (optional)"><input className={inputCls} name="perk" defaultValue={c.perk ?? ""} /></Field></div>
                  </div>
                  <fieldset>
                    <legend className="mb-2 text-[12.5px] font-semibold text-ink-2">Services (none ticked = all services)</legend>
                    <div className="flex flex-wrap gap-2">
                      {services.map((s) => (
                        <label key={s.id} className="inline-flex items-center gap-1.5 rounded-full border border-hair-2 bg-white px-3 py-1 text-[12.5px] text-ink">
                          <input type="checkbox" name="service_ids" value={s.id} defaultChecked={(c.service_ids ?? []).includes(s.id)} /> {s.name}
                        </label>
                      ))}
                    </div>
                  </fieldset>
                  <div className="flex flex-wrap items-center gap-4">
                    <label className="flex items-center gap-2 text-[13.5px] text-ink"><input type="checkbox" name="is_enabled" defaultChecked={c.is_enabled} /> Switched on</label>
                    <button type="submit" className={btnPrimary + " ml-auto"}>Save campaign</button>
                  </div>
                </form>
                <div className="flex flex-wrap gap-2">
                  <form action={toggleCampaign}>
                    <input type="hidden" name="id" value={c.id} />
                    <input type="hidden" name="next" value={c.is_enabled ? "false" : "true"} />
                    <button type="submit" className={btnSecondary}>{c.is_enabled ? "Switch off" : "Switch on"}</button>
                  </form>
                  <form action={removeCampaign}>
                    <input type="hidden" name="id" value={c.id} />
                    <button type="submit" className="rounded-full px-4 py-1.5 text-[12.5px] font-semibold text-[#9c3326] hover:bg-[#f6e4df]">Remove campaign</button>
                  </form>
                </div>
              </div>
            </details>
          );
        })}
        {campaigns.length === 0 && <p className="text-sm text-ink-3">No campaigns yet. Start one from an occasion above.</p>}
      </div>
    </div>
  );
}
