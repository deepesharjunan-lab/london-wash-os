import { createClient } from "@/lib/supabase/server";
import { loadServices, loadTiers } from "@/lib/loyalty/data";
import { inr, num } from "@/lib/loyalty/engine";
import { saveReward, toggleReward } from "../actions";
import { btnPrimary, btnSecondary, Card, ClubHeader, Field, inputCls, StatusPill } from "../ui";

export const dynamic = "force-dynamic";

type Reward = {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  points_cost: number;
  value_minor: number;
  min_tier_id: string | null;
  service_ids: string[] | null;
  min_order_minor: number;
  validity_days: number;
  usage_limit_per_member: number;
  stock: number | null;
  starts_on: string | null;
  ends_on: string | null;
  icon: string | null;
  card_style: string | null;
  sort_order: number;
  is_active: boolean;
  is_draft: boolean;
};

const CATS: [string, string][] = [["savings", "Savings"], ["service", "Service"], ["privilege", "Privilege"], ["keepsake", "Keepsake"]];
const ICONS = ["gift", "rupee", "truck", "iron", "sparkle", "shoe", "saree", "zap", "bag", "hanger", "leaf", "star"];
const STYLES: [string, string, string][] = [["a", "Ivory", "#ede5d6"], ["b", "Navy", "#1b2a48"], ["c", "Mist", "#e3e7ec"], ["d", "Charcoal", "#2a2b30"]];
const rs = (minor: number | null | undefined) => (minor === null || minor === undefined ? "" : String(Math.round(minor) / 100));

function RewardForm({ r, tiers, services }: { r: Partial<Reward>; tiers: { id: string; name: string }[]; services: { id: string; name: string }[] }) {
  const svc = new Set(r.service_ids ?? []);
  return (
    <form action={saveReward} className="space-y-4">
      {r.id && <input type="hidden" name="id" value={r.id} />}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="sm:col-span-2"><Field label="Reward name"><input className={inputCls} name="name" required defaultValue={r.name ?? ""} /></Field></div>
        <Field label="Category">
          <select className={inputCls} name="category" defaultValue={r.category ?? "service"}>{CATS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        </Field>
        <Field label="Points required"><input className={inputCls} type="number" min={1} name="points_cost" defaultValue={r.points_cost ?? 500} /></Field>
        <div className="sm:col-span-2 lg:col-span-4"><Field label="Description"><input className={inputCls} name="description" defaultValue={r.description ?? ""} placeholder="What the member gets, in one sentence" /></Field></div>
        <Field label="Value or discount (₹)"><input className={inputCls} type="number" min={0} name="value" defaultValue={rs(r.value_minor ?? 0)} /></Field>
        <Field label="Eligible tiers">
          <select className={inputCls} name="min_tier_id" defaultValue={r.min_tier_id ?? ""}>
            <option value="">All members</option>
            {tiers.slice(1).map((t) => <option key={t.id} value={t.id}>{t.name} and above</option>)}
          </select>
        </Field>
        <Field label="Minimum order (₹)"><input className={inputCls} type="number" min={0} name="min_order" defaultValue={rs(r.min_order_minor ?? 0)} /></Field>
        <Field label="Valid after redeeming (days)"><input className={inputCls} type="number" min={1} name="validity_days" defaultValue={r.validity_days ?? 30} /></Field>
        <Field label="Limit per member" hint="0 means no limit"><input className={inputCls} type="number" min={0} name="usage_limit_per_member" defaultValue={r.usage_limit_per_member ?? 0} /></Field>
        <Field label="Quantity available" hint="Empty means unlimited"><input className={inputCls} type="number" min={0} name="stock" defaultValue={r.stock ?? ""} /></Field>
        <Field label="Start date"><input className={inputCls} type="date" name="starts_on" defaultValue={r.starts_on ?? ""} /></Field>
        <Field label="End date"><input className={inputCls} type="date" name="ends_on" defaultValue={r.ends_on ?? ""} /></Field>
        <Field label="Icon">
          <select className={inputCls} name="icon" defaultValue={r.icon ?? "gift"}>{ICONS.map((i) => <option key={i}>{i}</option>)}</select>
        </Field>
        <Field label="Card colour">
          <select className={inputCls} name="card_style" defaultValue={r.card_style ?? "a"}>{STYLES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        </Field>
        <Field label="Marketplace order" hint="Lower numbers show first"><input className={inputCls} type="number" name="sort_order" defaultValue={r.sort_order ?? 0} /></Field>
      </div>
      <fieldset>
        <legend className="mb-2 text-[12.5px] font-semibold text-ink-2">Applicable services (none ticked = all services)</legend>
        <div className="flex flex-wrap gap-2">
          {services.map((s) => (
            <label key={s.id} className="inline-flex items-center gap-1.5 rounded-full border border-hair-2 bg-white px-3 py-1 text-[12.5px] text-ink">
              <input type="checkbox" name="service_ids" value={s.id} defaultChecked={svc.has(s.id)} /> {s.name}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="flex flex-wrap items-center gap-5 text-[13.5px] text-ink">
        <label className="flex items-center gap-2"><input type="checkbox" name="is_active" defaultChecked={r.is_active ?? true} /> Active</label>
        <label className="flex items-center gap-2"><input type="checkbox" name="is_draft" defaultChecked={r.is_draft ?? false} /> Draft (hidden from members)</label>
        <button type="submit" className={btnPrimary + " ml-auto"}>{r.id ? "Save reward" : "Create reward"}</button>
      </div>
    </form>
  );
}

export default async function ClubRewardsPage({ searchParams }: { searchParams: { saved?: string; error?: string } }) {
  const supabase = createClient();
  const [tiers, services, rewardsRes] = await Promise.all([
    loadTiers(supabase),
    loadServices(supabase),
    supabase
      .from("reward")
      .select("id, name, description, category, points_cost, value_minor, min_tier_id, service_ids, min_order_minor, validity_days, usage_limit_per_member, stock, starts_on, ends_on, icon, card_style, sort_order, is_active, is_draft")
      .is("deleted_at", null)
      .order("sort_order", { ascending: true })
      .order("points_cost", { ascending: true }),
  ]);
  const rewards = (rewardsRes.data ?? []) as Reward[];
  const tierName = new Map<string, string>(tiers.map((t) => [t.id, t.name] as [string, string]));
  const svcName = new Map<string, string>(services.map((s) => [s.id, s.name] as [string, string]));
  const styleBg = new Map<string, string>(STYLES.map(([v, , c]) => [v, c] as [string, string]));

  return (
    <div className="space-y-6">
      <ClubHeader
        current="/club/rewards"
        title="Rewards"
        sub="The rewards marketplace. Members spend points on these; open a reward to change it. There's no limit on how many you create."
        saved={searchParams.saved}
      />
      {searchParams.error && <div role="alert" className="rounded-xl bg-[#f6e4df] px-4 py-3 text-[13px] font-medium text-[#9c3326]">{searchParams.error}</div>}

      <Card title="New reward">
        <details>
          <summary className={btnSecondary + " inline-block cursor-pointer list-none"}>+ Create a reward</summary>
          <div className="mt-4"><RewardForm r={{}} tiers={tiers} services={services} /></div>
        </details>
      </Card>

      <div className="space-y-3">
        {rewards.map((r) => {
          const status = r.is_draft ? "draft" : r.is_active ? "active" : "paused";
          return (
            <details key={r.id} className="group border border-black/10 bg-white [border-radius:14px]">
              <summary className="flex cursor-pointer list-none flex-wrap items-center gap-4 px-5 py-4">
                <span className="grid h-10 w-12 shrink-0 place-items-center rounded-lg text-[10px] font-bold uppercase tracking-wide" style={{ background: styleBg.get(r.card_style ?? "a") ?? "#ede5d6", color: r.card_style === "b" || r.card_style === "d" ? "#e9dfc9" : "#15213a" }}>
                  {r.icon ?? "gift"}
                </span>
                <span className="min-w-[200px] flex-1">
                  <b className="block text-[14px] text-ink">{r.name}</b>
                  <span className="text-[12.5px] text-ink-2">
                    {num(r.points_cost)} pts · {inr(r.value_minor)} · {r.min_tier_id ? `${tierName.get(r.min_tier_id) ?? "Tier"} and above` : "All members"}
                    {r.service_ids && r.service_ids.length ? ` · ${r.service_ids.map((s) => svcName.get(s) ?? "").filter(Boolean).join(", ")}` : ""}
                    {r.stock !== null ? ` · ${r.stock} left` : ""}
                  </span>
                </span>
                <StatusPill status={status} />
                <span className="text-[12.5px] font-semibold text-ink-3 group-open:hidden">Edit</span>
              </summary>
              <div className="border-t border-black/5 px-5 py-5">
                <RewardForm r={r} tiers={tiers} services={services} />
                <form action={toggleReward} className="mt-3">
                  <input type="hidden" name="id" value={r.id} />
                  <input type="hidden" name="next" value={r.is_active ? "false" : "true"} />
                  <button type="submit" className={btnSecondary}>{r.is_active ? "Pause this reward" : "Make active"}</button>
                </form>
              </div>
            </details>
          );
        })}
        {rewards.length === 0 && <p className="text-sm text-ink-3">No rewards yet. Create the first one above.</p>}
      </div>
    </div>
  );
}
