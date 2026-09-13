import { createClient } from "@/lib/supabase/server";
import { createPromotion, togglePromotionActive, createCoupon, toggleCouponActive } from "./actions";

function formatMinor(minor: number | null) {
  if (minor === null || minor === undefined) return "-";
  return "₹" + (minor / 100).toFixed(2);
}

function formatDiscount(p: any) {
  if (p.discount_percent) return p.discount_percent + "%";
  if (p.discount_amount_minor) return formatMinor(p.discount_amount_minor);
  return "-";
}

export default async function PromotionsPage() {
  const supabase = createClient();

  const [{ data: promotions }, { data: coupons }] = await Promise.all([
    supabase.from("promotion").select("*").is("deleted_at", null).order("created_at", { ascending: false }),
    supabase.from("coupon").select("*").is("deleted_at", null).order("created_at", { ascending: false }),
  ]);

  const promotionName = new Map((promotions || []).map((p: any) => [p.id, p.name]));

  return (
    <div className="space-y-8">
      <div>
        <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-accent">Sales</div>
        <h1 className="mb-6 font-archivo text-2xl font-extrabold text-ink">Coupons &amp; Promotions</h1>
        <p className="mb-6 -mt-4 text-sm text-ink/60">Discount campaigns and redeemable codes.</p>
      </div>

      <section className="border-2 border-black/10 bg-white p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Promotions</h2>
          <details className="relative">
            <summary className="cursor-pointer list-none rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white">
              + Add Promotion
            </summary>
            <form
              action={createPromotion}
              className="absolute right-0 z-10 mt-2 w-80 space-y-3 border-2 border-black/10 bg-white p-4"
            >
              <div>
                <label className="block text-xs font-medium text-slate-500">Name</label>
                <input
                  name="name"
                  required
                  placeholder="e.g. National Day Sale"
                  className="mt-1 w-full border border-black/10 px-2 py-1.5 text-sm"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-medium text-slate-500">Discount %</label>
                  <input
                    type="number"
                    name="discount_percent"
                    placeholder="e.g. 20"
                    className="mt-1 w-full border border-black/10 px-2 py-1.5 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500">Or Amount (₹)</label>
                  <input
                    type="number"
                    name="discount_amount"
                    step="0.01"
                    placeholder="e.g. 100"
                    className="mt-1 w-full border border-black/10 px-2 py-1.5 text-sm"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-medium text-slate-500">Starts</label>
                  <input type="date" name="starts_at" className="mt-1 w-full border border-black/10 px-2 py-1.5 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500">Ends</label>
                  <input type="date" name="ends_at" className="mt-1 w-full border border-black/10 px-2 py-1.5 text-sm" />
                </div>
              </div>
              <button type="submit" className="w-full rounded-md bg-slate-900 py-1.5 text-sm font-medium text-white">
                Save Promotion
              </button>
            </form>
          </details>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b-2 border-black/10 text-left text-[11px] uppercase tracking-wide text-ink/50">
              <th className="py-2">Name</th>
              <th className="py-2">Discount</th>
              <th className="py-2">Starts</th>
              <th className="py-2">Ends</th>
              <th className="py-2">Status</th>
              <th className="py-2"></th>
            </tr>
          </thead>
          <tbody>
            {(promotions || []).map((p: any) => (
              <tr key={p.id} className="border-b border-black/5">
                <td className="py-2 font-medium">{p.name}</td>
                <td className="py-2 text-slate-600">{formatDiscount(p)}</td>
                <td className="py-2 text-slate-600">{p.starts_at ? new Date(p.starts_at).toLocaleDateString() : "-"}</td>
                <td className="py-2 text-slate-600">{p.ends_at ? new Date(p.ends_at).toLocaleDateString() : "-"}</td>
                <td className="py-2 text-slate-600">
                  <span
                    className={
                      "px-2 py-0.5 text-xs font-medium uppercase tracking-wide " +
                      (p.is_active ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500")
                    }
                  >
                    {p.is_active ? "Active" : "Inactive"}
                  </span>
                </td>
                <td className="py-2">
                  <form action={togglePromotionActive}>
                    <input type="hidden" name="id" value={p.id} />
                    <input type="hidden" name="next_active" value={p.is_active ? "false" : "true"} />
                    <button type="submit" className="text-xs font-medium text-blue-600">
                      {p.is_active ? "Deactivate" : "Activate"}
                    </button>
                  </form>
                </td>
              </tr>
            ))}
            {(!promotions || promotions.length === 0) && (
              <tr>
                <td colSpan={6} className="py-4 text-center text-slate-400">
                  No promotions yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <section className="border-2 border-black/10 bg-white p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Coupons</h2>
          <details className="relative">
            <summary className="cursor-pointer list-none rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white">
              + Add Coupon
            </summary>
            <form
              action={createCoupon}
              className="absolute right-0 z-10 mt-2 w-80 space-y-3 border-2 border-black/10 bg-white p-4"
            >
              <div>
                <label className="block text-xs font-medium text-slate-500">Code</label>
                <input
                  name="code"
                  required
                  placeholder="e.g. WASH20"
                  className="mt-1 w-full border border-black/10 px-2 py-1.5 text-sm uppercase"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500">Promotion (optional)</label>
                <select
                  name="promotion_id"
                  className="mt-1 w-full border border-black/10 px-2 py-1.5 text-sm"
                >
                  <option value="">None</option>
                  {(promotions || []).map((p: any) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500">Max redemptions (optional)</label>
                <input
                  type="number"
                  name="max_redemptions"
                  placeholder="Leave blank for unlimited"
                  className="mt-1 w-full border border-black/10 px-2 py-1.5 text-sm"
                />
              </div>
              <button type="submit" className="w-full rounded-md bg-slate-900 py-1.5 text-sm font-medium text-white">
                Save Coupon
              </button>
            </form>
          </details>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b-2 border-black/10 text-left text-[11px] uppercase tracking-wide text-ink/50">
              <th className="py-2">Code</th>
              <th className="py-2">Promotion</th>
              <th className="py-2">Redemptions</th>
              <th className="py-2">Status</th>
              <th className="py-2"></th>
            </tr>
          </thead>
          <tbody>
            {(coupons || []).map((c: any) => (
              <tr key={c.id} className="border-b border-black/5">
                <td className="py-2 font-medium">{c.code}</td>
                <td className="py-2 text-slate-600">{c.promotion_id ? promotionName.get(c.promotion_id) : "-"}</td>
                <td className="py-2 text-slate-600">
                  {c.redemptions_count}
                  {c.max_redemptions ? " / " + c.max_redemptions : ""}
                </td>
                <td className="py-2 text-slate-600">
                  <span
                    className={
                      "px-2 py-0.5 text-xs font-medium uppercase tracking-wide " +
                      (c.is_active ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500")
                    }
                  >
                    {c.is_active ? "Active" : "Inactive"}
                  </span>
                </td>
                <td className="py-2">
                  <form action={toggleCouponActive}>
                    <input type="hidden" name="id" value={c.id} />
                    <input type="hidden" name="next_active" value={c.is_active ? "false" : "true"} />
                    <button type="submit" className="text-xs font-medium text-blue-600">
                      {c.is_active ? "Deactivate" : "Activate"}
                    </button>
                  </form>
                </td>
              </tr>
            ))}
            {(!coupons || coupons.length === 0) && (
              <tr>
                <td colSpan={5} className="py-4 text-center text-slate-400">
                  No coupons yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
