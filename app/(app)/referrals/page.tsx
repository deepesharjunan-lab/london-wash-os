import { createClient } from "@/lib/supabase/server";
import { createReward, toggleRewardActive, createReferral, updateReferralStatus } from "./actions";

const statusOptions = ["pending", "rewarded", "expired"];

export default async function ReferralsPage() {
  const supabase = createClient();

  const [{ data: rewards }, { data: referrals }, { data: customers }] = await Promise.all([
    supabase.from("reward").select("*").order("created_at", { ascending: false }),
    supabase.from("referral").select("*").order("created_at", { ascending: false }),
    supabase.from("customer").select("id, full_name"),
  ]);

  const customerName = new Map((customers || []).map((c: any) => [c.id, c.full_name]));
  const rewardName = new Map((rewards || []).map((r: any) => [r.id, r.name]));

  return (
    <div className="space-y-8">
      <div>
        <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-accent">Sales</div>
        <h1 className="mb-6 font-archivo text-2xl font-extrabold text-ink">Referrals &amp; Rewards</h1>
        <p className="mb-6 -mt-4 text-sm text-ink/60">Reward catalog and customer referral tracking.</p>
      </div>

      <section className="border-2 border-black/10 bg-white p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Reward Catalog</h2>
          <details className="relative">
            <summary className="cursor-pointer list-none rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white">
              + Add Reward
            </summary>
            <form
              action={createReward}
              className="absolute right-0 z-10 mt-2 w-80 space-y-3 border-2 border-black/10 bg-white p-4"
            >
              <div>
                <label className="block text-xs font-medium text-slate-500">Reward name</label>
                <input
                  name="name"
                  required
                  placeholder="e.g. Free Wash & Fold"
                  className="mt-1 w-full border border-black/10 px-2 py-1.5 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500">Points cost</label>
                <input
                  type="number"
                  name="points_cost"
                  required
                  min={1}
                  className="mt-1 w-full border border-black/10 px-2 py-1.5 text-sm"
                />
              </div>
              <button type="submit" className="w-full rounded-md bg-slate-900 py-1.5 text-sm font-medium text-white">
                Save Reward
              </button>
            </form>
          </details>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b-2 border-black/10 text-left text-[11px] uppercase tracking-wide text-ink/50">
              <th className="py-2">Name</th>
              <th className="py-2">Points Cost</th>
              <th className="py-2">Status</th>
              <th className="py-2"></th>
            </tr>
          </thead>
          <tbody>
            {(rewards || []).map((r: any) => (
              <tr key={r.id} className="border-b border-black/5">
                <td className="py-2 font-medium">{r.name}</td>
                <td className="py-2 text-slate-600">{r.points_cost}</td>
                <td className="py-2 text-slate-600">
                  <span
                    className={
                      "px-2 py-0.5 text-xs font-medium uppercase tracking-wide " +
                      (r.is_active ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500")
                    }
                  >
                    {r.is_active ? "Active" : "Inactive"}
                  </span>
                </td>
                <td className="py-2">
                  <form action={toggleRewardActive}>
                    <input type="hidden" name="id" value={r.id} />
                    <input type="hidden" name="next_active" value={r.is_active ? "false" : "true"} />
                    <button type="submit" className="text-xs font-medium text-blue-600">
                      {r.is_active ? "Deactivate" : "Activate"}
                    </button>
                  </form>
                </td>
              </tr>
            ))}
            {(!rewards || rewards.length === 0) && (
              <tr>
                <td colSpan={4} className="py-4 text-center text-slate-400">
                  No rewards yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <section className="border-2 border-black/10 bg-white p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Referrals</h2>
          <details className="relative">
            <summary className="cursor-pointer list-none rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white">
              + Add Referral
            </summary>
            <form
              action={createReferral}
              className="absolute right-0 z-10 mt-2 w-80 space-y-3 border-2 border-black/10 bg-white p-4"
            >
              <div>
                <label className="block text-xs font-medium text-slate-500">Referrer</label>
                <select name="referrer_customer_id" required className="mt-1 w-full border border-black/10 px-2 py-1.5 text-sm">
                  <option value="">Select customer</option>
                  {(customers || []).map((c: any) => (
                    <option key={c.id} value={c.id}>
                      {c.full_name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500">Referred (optional)</label>
                <select name="referred_customer_id" className="mt-1 w-full border border-black/10 px-2 py-1.5 text-sm">
                  <option value="">Not yet known</option>
                  {(customers || []).map((c: any) => (
                    <option key={c.id} value={c.id}>
                      {c.full_name}
                    </option>
                  ))}
                </select>
              </div>
              <button type="submit" className="w-full rounded-md bg-slate-900 py-1.5 text-sm font-medium text-white">
                Save Referral
              </button>
            </form>
          </details>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b-2 border-black/10 text-left text-[11px] uppercase tracking-wide text-ink/50">
              <th className="py-2">Referrer</th>
              <th className="py-2">Referred</th>
              <th className="py-2">Status</th>
              <th className="py-2">Reward</th>
              <th className="py-2">Update</th>
            </tr>
          </thead>
          <tbody>
            {(referrals || []).map((r: any) => (
              <tr key={r.id} className="border-b border-black/5">
                <td className="py-2 font-medium">{customerName.get(r.referrer_customer_id) || "-"}</td>
                <td className="py-2 text-slate-600">{r.referred_customer_id ? customerName.get(r.referred_customer_id) : "-"}</td>
                <td className="py-2 text-slate-600">
                  <span
                    className={
                      "px-2 py-0.5 text-xs font-medium uppercase tracking-wide " +
                      (r.status === "rewarded"
                        ? "bg-emerald-100 text-emerald-700"
                        : r.status === "expired"
                        ? "bg-slate-100 text-slate-500"
                        : "bg-amber-100 text-amber-700")
                    }
                  >
                    {r.status}
                  </span>
                </td>
                <td className="py-2 text-slate-600">{r.reward_id ? rewardName.get(r.reward_id) : "-"}</td>
                <td className="py-2">
                  <form action={updateReferralStatus} className="flex items-center gap-1">
                    <input type="hidden" name="id" value={r.id} />
                    <select name="status" defaultValue={r.status} className="border border-black/10 px-1 py-1 text-xs">
                      {statusOptions.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                    <select name="reward_id" defaultValue={r.reward_id || ""} className="border border-black/10 px-1 py-1 text-xs">
                      <option value="">No reward</option>
                      {(rewards || []).map((rw: any) => (
                        <option key={rw.id} value={rw.id}>
                          {rw.name}
                        </option>
                      ))}
                    </select>
                    <button type="submit" className="text-xs font-medium text-blue-600">
                      Save
                    </button>
                  </form>
                </td>
              </tr>
            ))}
            {(!referrals || referrals.length === 0) && (
              <tr>
                <td colSpan={5} className="py-4 text-center text-slate-400">
                  No referrals yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
