import { createClient } from "@/lib/supabase/server";
import {
  addLoyaltyTier,
  enrollLoyaltyAccount,
  adjustLoyaltyPoints,
  addSubscriptionPlan,
  toggleSubscriptionPlan,
  createSubscription,
  updateSubscriptionStatus,
} from "./actions";

function formatMinor(minor: number | null) {
  if (minor === null || minor === undefined) return "\u2014";
  return `\u20B9${(minor / 100).toLocaleString("en-IN")}`;
}

export default async function LoyaltyPage() {
  const supabase = createClient();

  const { data: auth } = await supabase.auth.getUser();
  const { data: me } = auth?.user
    ? await supabase.from("user").select("branch_id").eq("auth_user_id", auth.user.id).single()
    : { data: null };

  const { data: tiers } = await supabase
    .from("loyalty_tier")
    .select("id, name, min_points, perk_description")
    .is("deleted_at", null)
    .order("min_points", { ascending: true });

  const { data: customers } = me
    ? await supabase
        .from("customer")
        .select("id, full_name")
        .eq("branch_id", me.branch_id)
        .order("full_name", { ascending: true })
    : { data: [] };

  const { data: accounts } = await supabase
    .from("loyalty_account")
    .select("id, customer_id, loyalty_tier_id, points_balance, created_at")
    .order("created_at", { ascending: false });

  const { data: plans } = await supabase
    .from("subscription_plan")
    .select("id, name, price_minor, currency, included_pieces, billing_cycle, is_active")
    .is("deleted_at", null)
    .order("name", { ascending: true });

  const { data: subscriptions } = await supabase
    .from("subscription")
    .select("id, customer_id, subscription_plan_id, status, starts_at, renews_at")
    .order("starts_at", { ascending: false });

  const customerName = new Map((customers ?? []).map((c: any) => [c.id, c.full_name]));
  const tierName = new Map((tiers ?? []).map((t: any) => [t.id, t.name]));
  const planName = new Map((plans ?? []).map((p: any) => [p.id, p.name]));

  return (
    <div className="space-y-6">
      <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-accent">Loyalty &amp; Subscriptions</div>
      <h1 className="mb-6 font-archivo text-2xl font-extrabold text-ink">Loyalty Tiers, Accounts &amp; Subscriptions</h1>

      <div className="border-2 border-black/10 bg-white">
        <div className="border-b-2 border-black/10 px-5 py-3 font-archivo text-[13.5px] font-bold text-ink">
          Loyalty Tiers
        </div>
        <details className="border-b border-black/5">
          <summary className="cursor-pointer select-none px-5 py-3 text-[13px] font-semibold text-accent">
            + Add Tier
          </summary>
          <form
            action={addLoyaltyTier}
            className="grid grid-cols-1 gap-3 px-5 py-4 sm:grid-cols-2 lg:grid-cols-4"
          >
            <input
              name="name"
              required
              placeholder="e.g. Gold"
              className="border border-black/10 px-3 py-2 text-[13px]"
            />
            <input
              name="min_points"
              type="number"
              step="1"
              placeholder="Min points"
              className="border border-black/10 px-3 py-2 text-[13px]"
            />
            <input
              name="perk_description"
              placeholder="Perk description"
              className="border border-black/10 px-3 py-2 text-[13px] sm:col-span-2 lg:col-span-1"
            />
            <button
              type="submit"
              className="rounded-md bg-accent px-4 py-2 text-[13px] font-semibold text-white hover:brightness-110"
            >
              Add
            </button>
          </form>
        </details>
        <table className="w-full text-left text-[13px]">
          <thead className="border-b-2 border-black/10 text-left text-[11px] uppercase tracking-wide text-ink/50">
            <tr>
              <th className="px-5 py-3 font-medium">Name</th>
              <th className="px-5 py-3 font-medium">Min points</th>
              <th className="px-5 py-3 font-medium">Perk</th>
            </tr>
          </thead>
          <tbody>
            {(!tiers || tiers.length === 0) && (
              <tr>
                <td colSpan={3} className="px-5 py-8 text-center text-ink/40">
                  No loyalty tiers yet. Add one above.
                </td>
              </tr>
            )}
            {(tiers ?? []).map((t: any) => (
              <tr key={t.id} className="border-t border-black/5">
                <td className="px-5 py-3 font-medium text-ink">{t.name}</td>
                <td className="px-5 py-3 text-ink/70">{t.min_points}</td>
                <td className="px-5 py-3 text-ink/70">{t.perk_description || "\u2014"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="border-2 border-black/10 bg-white">
        <div className="border-b-2 border-black/10 px-5 py-3 font-archivo text-[13.5px] font-bold text-ink">
          Loyalty Accounts
        </div>
        <details className="border-b border-black/5">
          <summary className="cursor-pointer select-none px-5 py-3 text-[13px] font-semibold text-accent">
            + Enroll Customer
          </summary>
          <form
            action={enrollLoyaltyAccount}
            className="grid grid-cols-1 gap-3 px-5 py-4 sm:grid-cols-2 lg:grid-cols-3"
          >
            <select
              name="customer_id"
              required
              defaultValue=""
              className="border border-black/10 px-3 py-2 text-[13px] text-ink"
            >
              <option value="">Customer</option>
              {(customers ?? []).map((c: any) => (
                <option key={c.id} value={c.id}>
                  {c.full_name}
                </option>
              ))}
            </select>
            <select
              name="loyalty_tier_id"
              defaultValue=""
              className="border border-black/10 px-3 py-2 text-[13px] text-ink"
            >
              <option value="">No tier</option>
              {(tiers ?? []).map((t: any) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            <button
              type="submit"
              className="rounded-md bg-accent px-4 py-2 text-[13px] font-semibold text-white hover:brightness-110"
            >
              Enroll
            </button>
          </form>
        </details>
        <table className="w-full text-left text-[13px]">
          <thead className="border-b-2 border-black/10 text-left text-[11px] uppercase tracking-wide text-ink/50">
            <tr>
              <th className="px-5 py-3 font-medium">Customer</th>
              <th className="px-5 py-3 font-medium">Tier</th>
              <th className="px-5 py-3 font-medium">Points</th>
              <th className="px-5 py-3 font-medium">Adjust</th>
            </tr>
          </thead>
          <tbody>
            {(!accounts || accounts.length === 0) && (
              <tr>
                <td colSpan={4} className="px-5 py-8 text-center text-ink/40">
                  No loyalty accounts yet. Enroll a customer above.
                </td>
              </tr>
            )}
            {(accounts ?? []).map((a: any) => (
              <tr key={a.id} className="border-t border-black/5">
                <td className="px-5 py-3 font-medium text-ink">
                  {customerName.get(a.customer_id) || "\u2014"}
                </td>
                <td className="px-5 py-3 text-ink/70">
                  {a.loyalty_tier_id ? tierName.get(a.loyalty_tier_id) || "\u2014" : "\u2014"}
                </td>
                <td className="px-5 py-3 text-ink/70">{a.points_balance}</td>
                <td className="px-5 py-3">
                  <form action={adjustLoyaltyPoints} className="flex items-center gap-2">
                    <input type="hidden" name="loyalty_account_id" value={a.id} />
                    <select
                      name="type"
                      defaultValue="adjustment"
                      className="border border-black/10 px-2 py-1 text-[12px] text-ink"
                    >
                      <option value="earn">Earn</option>
                      <option value="redeem">Redeem</option>
                      <option value="adjustment">Adjustment</option>
                    </select>
                    <input
                      name="points"
                      type="number"
                      step="1"
                      placeholder="+/- pts"
                      className="w-20 border border-black/10 px-2 py-1 text-[12px]"
                    />
                    <button
                      type="submit"
                      className="rounded-md border border-black/10 px-3 py-1.5 text-[12px] font-semibold text-ink hover:bg-black/[0.03]"
                    >
                      Apply
                    </button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="border-2 border-black/10 bg-white">
        <div className="border-b-2 border-black/10 px-5 py-3 font-archivo text-[13.5px] font-bold text-ink">
          Subscription Plans
        </div>
        <details className="border-b border-black/5">
          <summary className="cursor-pointer select-none px-5 py-3 text-[13px] font-semibold text-accent">
            + Add Plan
          </summary>
          <form
            action={addSubscriptionPlan}
            className="grid grid-cols-1 gap-3 px-5 py-4 sm:grid-cols-2 lg:grid-cols-5"
          >
            <input
              name="name"
              required
              placeholder="e.g. Monthly Unlimited"
              className="border border-black/10 px-3 py-2 text-[13px]"
            />
            <input
              name="price"
              type="number"
              step="0.01"
              placeholder="Price (\u20B9)"
              className="border border-black/10 px-3 py-2 text-[13px]"
            />
            <input
              name="included_pieces"
              type="number"
              step="1"
              placeholder="Included pieces"
              className="border border-black/10 px-3 py-2 text-[13px]"
            />
            <select
              name="billing_cycle"
              defaultValue="monthly"
              className="border border-black/10 px-3 py-2 text-[13px] text-ink"
            >
              <option value="monthly">Monthly</option>
              <option value="quarterly">Quarterly</option>
              <option value="yearly">Yearly</option>
            </select>
            <button
              type="submit"
              className="rounded-md bg-accent px-4 py-2 text-[13px] font-semibold text-white hover:brightness-110"
            >
              Add
            </button>
          </form>
        </details>
        <table className="w-full text-left text-[13px]">
          <thead className="border-b-2 border-black/10 text-left text-[11px] uppercase tracking-wide text-ink/50">
            <tr>
              <th className="px-5 py-3 font-medium">Name</th>
              <th className="px-5 py-3 font-medium">Price</th>
              <th className="px-5 py-3 font-medium">Included pieces</th>
              <th className="px-5 py-3 font-medium">Billing</th>
              <th className="px-5 py-3 font-medium">Status</th>
              <th className="px-5 py-3 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {(!plans || plans.length === 0) && (
              <tr>
                <td colSpan={6} className="px-5 py-8 text-center text-ink/40">
                  No subscription plans yet. Add one above.
                </td>
              </tr>
            )}
            {(plans ?? []).map((p: any) => (
              <tr key={p.id} className="border-t border-black/5">
                <td className="px-5 py-3 font-medium text-ink">{p.name}</td>
                <td className="px-5 py-3 text-ink/70">{formatMinor(p.price_minor)}</td>
                <td className="px-5 py-3 text-ink/70">{p.included_pieces ?? "\u2014"}</td>
                <td className="px-5 py-3 text-ink/70 capitalize">{p.billing_cycle}</td>
                <td className="px-5 py-3">
                  <span
                    className={`px-2 py-1 text-[11px] font-semibold uppercase tracking-wide ${
                      p.is_active ? "bg-green-100 text-green-700" : "bg-black/5 text-ink/60"
                    }`}
                  >
                    {p.is_active ? "Active" : "Inactive"}
                  </span>
                </td>
                <td className="px-5 py-3 text-right">
                  <form action={toggleSubscriptionPlan}>
                    <input type="hidden" name="id" value={p.id} />
                    <input type="hidden" name="next_active" value={(!p.is_active).toString()} />
                    <button
                      type="submit"
                      className="rounded-md border border-black/10 px-3 py-1.5 text-[12px] font-semibold text-ink hover:bg-black/[0.03]"
                    >
                      {p.is_active ? "Deactivate" : "Activate"}
                    </button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="border-2 border-black/10 bg-white">
        <div className="border-b-2 border-black/10 px-5 py-3 font-archivo text-[13.5px] font-bold text-ink">
          Subscriptions
        </div>
        <details className="border-b border-black/5">
          <summary className="cursor-pointer select-none px-5 py-3 text-[13px] font-semibold text-accent">
            + New Subscription
          </summary>
          <form
            action={createSubscription}
            className="grid grid-cols-1 gap-3 px-5 py-4 sm:grid-cols-2 lg:grid-cols-4"
          >
            <select
              name="customer_id"
              required
              defaultValue=""
              className="border border-black/10 px-3 py-2 text-[13px] text-ink"
            >
              <option value="">Customer</option>
              {(customers ?? []).map((c: any) => (
                <option key={c.id} value={c.id}>
                  {c.full_name}
                </option>
              ))}
            </select>
            <select
              name="subscription_plan_id"
              required
              defaultValue=""
              className="border border-black/10 px-3 py-2 text-[13px] text-ink"
            >
              <option value="">Plan</option>
              {(plans ?? []).map((p: any) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <input
              name="starts_at"
              type="date"
              className="border border-black/10 px-3 py-2 text-[13px]"
            />
            <button
              type="submit"
              className="rounded-md bg-accent px-4 py-2 text-[13px] font-semibold text-white hover:brightness-110"
            >
              Create
            </button>
          </form>
        </details>
        <table className="w-full text-left text-[13px]">
          <thead className="border-b-2 border-black/10 text-left text-[11px] uppercase tracking-wide text-ink/50">
            <tr>
              <th className="px-5 py-3 font-medium">Customer</th>
              <th className="px-5 py-3 font-medium">Plan</th>
              <th className="px-5 py-3 font-medium">Status</th>
              <th className="px-5 py-3 font-medium">Starts</th>
              <th className="px-5 py-3 font-medium">Renews</th>
              <th className="px-5 py-3 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {(!subscriptions || subscriptions.length === 0) && (
              <tr>
                <td colSpan={6} className="px-5 py-8 text-center text-ink/40">
                  No subscriptions yet. Create one above.
                </td>
              </tr>
            )}
            {(subscriptions ?? []).map((s: any) => (
              <tr key={s.id} className="border-t border-black/5">
                <td className="px-5 py-3 font-medium text-ink">
                  {customerName.get(s.customer_id) || "\u2014"}
                </td>
                <td className="px-5 py-3 text-ink/70">{planName.get(s.subscription_plan_id) || "\u2014"}</td>
                <td className="px-5 py-3">
                  <span
                    className={`px-2 py-1 text-[11px] font-semibold uppercase tracking-wide ${
                      s.status === "active"
                        ? "bg-green-100 text-green-700"
                        : s.status === "paused"
                        ? "bg-amber-100 text-amber-700"
                        : "bg-black/5 text-ink/60"
                    }`}
                  >
                    {s.status}
                  </span>
                </td>
                <td className="px-5 py-3 text-ink/70">{s.starts_at || "\u2014"}</td>
                <td className="px-5 py-3 text-ink/70">{s.renews_at || "\u2014"}</td>
                <td className="px-5 py-3 text-right">
                  {s.status === "active" && (
                    <form action={updateSubscriptionStatus} className="inline">
                      <input type="hidden" name="id" value={s.id} />
                      <input type="hidden" name="status" value="paused" />
                      <button
                        type="submit"
                        className="mr-1 rounded-md border border-black/10 px-3 py-1.5 text-[12px] font-semibold text-ink hover:bg-black/[0.03]"
                      >
                        Pause
                      </button>
                    </form>
                  )}
                  {s.status === "paused" && (
                    <form action={updateSubscriptionStatus} className="inline">
                      <input type="hidden" name="id" value={s.id} />
                      <input type="hidden" name="status" value="active" />
                      <button
                        type="submit"
                        className="mr-1 rounded-md border border-black/10 px-3 py-1.5 text-[12px] font-semibold text-ink hover:bg-black/[0.03]"
                      >
                        Resume
                      </button>
                    </form>
                  )}
                  {(s.status === "active" || s.status === "paused") && (
                    <form action={updateSubscriptionStatus} className="inline">
                      <input type="hidden" name="id" value={s.id} />
                      <input type="hidden" name="status" value="cancelled" />
                      <button
                        type="submit"
                        className="rounded-md border border-black/10 px-3 py-1.5 text-[12px] font-semibold text-ink hover:bg-black/[0.03]"
                      >
                        Cancel
                      </button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
