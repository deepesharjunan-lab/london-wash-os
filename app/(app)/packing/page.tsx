import { createClient } from "@/lib/supabase/server";
import { createPackedBag, addGarmentToBag, removeGarmentFromBag } from "./actions";

export default async function PackingPage() {
  const supabase = createClient();

  const [{ data: bags }, { data: orders }, { data: garments }, { data: contents }, { data: users }] =
    await Promise.all([
      supabase.from("packed_bag").select("*").order("created_at", { ascending: false }),
      supabase.from("order").select("id, order_number"),
      supabase.from("garment").select("id, tag_code"),
      supabase.from("packed_bag_garment").select("*"),
      supabase.from("user").select("id, full_name"),
    ]);

  const orderNumber = new Map((orders || []).map((o: any) => [o.id, o.order_number]));
  const garmentLabel = new Map((garments || []).map((g: any) => [g.id, g.tag_code || g.id.slice(0, 8)]));
  const userName = new Map((users || []).map((u: any) => [u.id, u.full_name]));
  const bagLabel = new Map((bags || []).map((b: any) => [b.id, b.bag_code]));
  const contentsByBag = new Map<string, any[]>();
  (contents || []).forEach((c: any) => {
    const list = contentsByBag.get(c.packed_bag_id) || [];
    list.push(c);
    contentsByBag.set(c.packed_bag_id, list);
  });

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Packed Bags / Dispatch Packing</h1>
        <p className="text-slate-500">Pack finished garments into bags before delivery.</p>
      </div>

      <section className="rounded-lg border border-slate-200 bg-white p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Packed Bags</h2>
          <details className="relative">
            <summary className="cursor-pointer list-none rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white">
              + New Bag
            </summary>
            <form
              action={createPackedBag}
              className="absolute right-0 z-10 mt-2 w-80 space-y-3 rounded-md border border-slate-200 bg-white p-4 shadow-lg"
            >
              <div>
                <label className="block text-xs font-medium text-slate-500">Order</label>
                <select name="order_id" required className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm">
                  <option value="">Select order</option>
                  {(orders || []).map((o: any) => (
                    <option key={o.id} value={o.id}>
                      {o.order_number}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500">Bag code</label>
                <input
                  name="bag_code"
                  required
                  placeholder="e.g. BAG-0001"
                  className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                />
              </div>
              <button type="submit" className="w-full rounded-md bg-slate-900 py-1.5 text-sm font-medium text-white">
                Create Bag
              </button>
            </form>
          </details>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="py-2">Bag Code</th>
              <th className="py-2">Order</th>
              <th className="py-2">Garments</th>
              <th className="py-2">Packed By</th>
              <th className="py-2">Date</th>
            </tr>
          </thead>
          <tbody>
            {(bags || []).map((b: any) => (
              <tr key={b.id} className="border-b border-slate-100">
                <td className="py-2 font-medium">{b.bag_code}</td>
                <td className="py-2 text-slate-600">{orderNumber.get(b.order_id) || "-"}</td>
                <td className="py-2 text-slate-600">{(contentsByBag.get(b.id) || []).length}</td>
                <td className="py-2 text-slate-600">{b.packed_by ? userName.get(b.packed_by) : "-"}</td>
                <td className="py-2 text-slate-500">{new Date(b.created_at).toLocaleDateString()}</td>
              </tr>
            ))}
            {(!bags || bags.length === 0) && (
              <tr>
                <td colSpan={5} className="py-4 text-center text-slate-400">
                  No bags packed yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Bag Contents</h2>
          <details className="relative">
            <summary className="cursor-pointer list-none rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white">
              + Add Garment to Bag
            </summary>
            <form
              action={addGarmentToBag}
              className="absolute right-0 z-10 mt-2 w-80 space-y-3 rounded-md border border-slate-200 bg-white p-4 shadow-lg"
            >
              <div>
                <label className="block text-xs font-medium text-slate-500">Bag</label>
                <select name="packed_bag_id" required className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm">
                  <option value="">Select bag</option>
                  {(bags || []).map((b: any) => (
                    <option key={b.id} value={b.id}>
                      {b.bag_code}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500">Garment</label>
                <select name="garment_id" required className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm">
                  <option value="">Select garment</option>
                  {(garments || []).map((g: any) => (
                    <option key={g.id} value={g.id}>
                      {g.tag_code || g.id.slice(0, 8)}
                    </option>
                  ))}
                </select>
              </div>
              <button type="submit" className="w-full rounded-md bg-slate-900 py-1.5 text-sm font-medium text-white">
                Add to Bag
              </button>
            </form>
          </details>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="py-2">Bag</th>
              <th className="py-2">Garment</th>
              <th className="py-2"></th>
            </tr>
          </thead>
          <tbody>
            {(contents || []).map((c: any) => (
              <tr key={c.packed_bag_id + c.garment_id} className="border-b border-slate-100">
                <td className="py-2 font-medium">{bagLabel.get(c.packed_bag_id) || "-"}</td>
                <td className="py-2 text-slate-600">{garmentLabel.get(c.garment_id) || "-"}</td>
                <td className="py-2">
                  <form action={removeGarmentFromBag}>
                    <input type="hidden" name="packed_bag_id" value={c.packed_bag_id} />
                    <input type="hidden" name="garment_id" value={c.garment_id} />
                    <button type="submit" className="text-xs font-medium text-red-600">
                      Remove
                    </button>
                  </form>
                </td>
              </tr>
            ))}
            {(!contents || contents.length === 0) && (
              <tr>
                <td colSpan={3} className="py-4 text-center text-slate-400">
                  No garments packed yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
