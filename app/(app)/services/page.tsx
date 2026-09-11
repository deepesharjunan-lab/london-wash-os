import { createClient } from "@/lib/supabase/server";
import {
  createServiceCategory,
  createService,
  createItem,
  createPriceListProfile,
  createPriceListEntry,
} from "./actions";

function formatMinor(minor: number) {
  return `₹${(minor / 100).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

export default async function ServicesPage() {
  const supabase = createClient();

  const [
    { data: categories },
    { data: services },
    { data: items },
    { data: profiles },
    { data: entries },
  ] = await Promise.all([
    supabase.from("service_category").select("id, name").order("sort_order", { ascending: true }),
    supabase
      .from("service")
      .select("id, name, default_unit, service_category:service_category_id(name)")
      .order("name"),
    supabase.from("item").select("id, name, category").order("name"),
    supabase.from("price_list_profile").select("id, name, is_default").order("name"),
    supabase
      .from("price_list_entry")
      .select(
        "id, price_minor, unit, service:service_id(name), item:item_id(name), price_list_profile:price_list_profile_id(name)"
      )
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  return (
    <div className="space-y-8">
      <div>
        <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-accent">Masters</div>
        <h1 className="font-archivo text-2xl font-extrabold text-ink">Services &amp; Prices</h1>
      </div>

      <section className="grid gap-4 sm:grid-cols-[1fr_280px]">
        <div className="overflow-hidden rounded-lg border border-black/5 bg-white shadow-sm">
          <div className="border-b border-black/5 px-4 py-3 text-sm font-bold text-ink">Service categories</div>
          <table className="w-full text-sm">
            <tbody>
              {(categories ?? []).map((c) => (
                <tr key={c.id} className="border-b border-black/5 last:border-0">
                  <td className="px-4 py-2.5 text-ink">{c.name}</td>
                </tr>
              ))}
              {(categories ?? []).length === 0 && (
                <tr>
                  <td className="px-4 py-6 text-center text-sm text-ink/40">No categories yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <form
          action={createServiceCategory}
          className="space-y-2 rounded-lg border border-black/5 bg-white p-4 shadow-sm"
        >
          <div className="text-xs font-semibold uppercase tracking-wide text-ink/50">Add category</div>
          <input
            name="name"
            required
            placeholder="e.g. Laundry"
            className="w-full rounded-md border border-black/10 px-3 py-2 text-sm outline-none focus:border-accent"
          />
          <button
            type="submit"
            className="w-full rounded-md bg-accent px-3 py-2 text-sm font-semibold text-white hover:brightness-110"
          >
            Add
          </button>
        </form>
      </section>

      <section className="grid gap-4 sm:grid-cols-[1fr_280px]">
        <div className="overflow-hidden rounded-lg border border-black/5 bg-white shadow-sm">
          <div className="border-b border-black/5 px-4 py-3 text-sm font-bold text-ink">Services</div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-black/5 bg-black/[0.02] text-left text-[11px] font-semibold uppercase tracking-wide text-ink/50">
                <th className="px-4 py-2">Name</th>
                <th className="px-4 py-2">Category</th>
                <th className="px-4 py-2">Unit</th>
              </tr>
            </thead>
            <tbody>
              {(services ?? []).map((s: any) => (
                <tr key={s.id} className="border-b border-black/5 last:border-0">
                  <td className="px-4 py-2.5 font-medium text-ink">{s.name}</td>
                  <td className="px-4 py-2.5 text-ink/60">{s.service_category?.name ?? "—"}</td>
                  <td className="px-4 py-2.5 text-ink/60">{s.default_unit}</td>
                </tr>
              ))}
              {(services ?? []).length === 0 && (
                <tr>
                  <td colSpan={3} className="px-4 py-6 text-center text-sm text-ink/40">
                    No services yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <form action={createService} className="space-y-2 rounded-lg border border-black/5 bg-white p-4 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-wide text-ink/50">Add service</div>
          <input
            name="name"
            required
            placeholder="e.g. Wash & Fold"
            className="w-full rounded-md border border-black/10 px-3 py-2 text-sm outline-none focus:border-accent"
          />
          <select
            name="service_category_id"
            required
            defaultValue=""
            className="w-full rounded-md border border-black/10 px-3 py-2 text-sm outline-none focus:border-accent"
          >
            <option value="" disabled>
              Category...
            </option>
            {(categories ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <select
            name="default_unit"
            defaultValue="piece"
            className="w-full rounded-md border border-black/10 px-3 py-2 text-sm outline-none focus:border-accent"
          >
            <option value="piece">Per piece</option>
            <option value="kg">Per kg</option>
            <option value="set">Per set</option>
          </select>
          <button
            type="submit"
            className="w-full rounded-md bg-accent px-3 py-2 text-sm font-semibold text-white hover:brightness-110"
          >
            Add
          </button>
        </form>
      </section>

      <section className="grid gap-4 sm:grid-cols-[1fr_280px]">
        <div className="overflow-hidden rounded-lg border border-black/5 bg-white shadow-sm">
          <div className="border-b border-black/5 px-4 py-3 text-sm font-bold text-ink">Garment items</div>
          <table className="w-full text-sm">
            <tbody>
              {(items ?? []).map((i) => (
                <tr key={i.id} className="border-b border-black/5 last:border-0">
                  <td className="px-4 py-2.5 font-medium text-ink">{i.name}</td>
                  <td className="px-4 py-2.5 text-ink/60">{i.category ?? "—"}</td>
                </tr>
              ))}
              {(items ?? []).length === 0 && (
                <tr>
                  <td colSpan={2} className="px-4 py-6 text-center text-sm text-ink/40">
                    No items yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <form action={createItem} className="space-y-2 rounded-lg border border-black/5 bg-white p-4 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-wide text-ink/50">Add item</div>
          <input
            name="name"
            required
            placeholder="e.g. Shirt"
            className="w-full rounded-md border border-black/10 px-3 py-2 text-sm outline-none focus:border-accent"
          />
          <input
            name="category"
            placeholder="e.g. Apparel"
            className="w-full rounded-md border border-black/10 px-3 py-2 text-sm outline-none focus:border-accent"
          />
          <button
            type="submit"
            className="w-full rounded-md bg-accent px-3 py-2 text-sm font-semibold text-white hover:brightness-110"
          >
            Add
          </button>
        </form>
      </section>

      <section className="grid gap-4 sm:grid-cols-[1fr_280px]">
        <div className="overflow-hidden rounded-lg border border-black/5 bg-white shadow-sm">
          <div className="border-b border-black/5 px-4 py-3 text-sm font-bold text-ink">Price lists</div>
          <table className="w-full text-sm">
            <tbody>
              {(profiles ?? []).map((p) => (
                <tr key={p.id} className="border-b border-black/5 last:border-0">
                  <td className="px-4 py-2.5 font-medium text-ink">{p.name}</td>
                  <td className="px-4 py-2.5">
                    {p.is_default && (
                      <span className="inline-flex rounded-full bg-ok/10 px-2.5 py-1 text-[11px] font-semibold text-ok">
                        Default
                      </span>
                    )}
                  </td>
                </tr>
              ))}
              {(profiles ?? []).length === 0 && (
                <tr>
                  <td colSpan={2} className="px-4 py-6 text-center text-sm text-ink/40">
                    No price lists yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <form
          action={createPriceListProfile}
          className="space-y-2 rounded-lg border border-black/5 bg-white p-4 shadow-sm"
        >
          <div className="text-xs font-semibold uppercase tracking-wide text-ink/50">Add price list</div>
          <input
            name="name"
            required
            placeholder="e.g. Standard"
            className="w-full rounded-md border border-black/10 px-3 py-2 text-sm outline-none focus:border-accent"
          />
          <input
            name="description"
            placeholder="Description (optional)"
            className="w-full rounded-md border border-black/10 px-3 py-2 text-sm outline-none focus:border-accent"
          />
          <label className="flex items-center gap-2 text-sm text-ink/70">
            <input type="checkbox" name="is_default" className="rounded border-black/20" />
            Set as default
          </label>
          <button
            type="submit"
            className="w-full rounded-md bg-accent px-3 py-2 text-sm font-semibold text-white hover:brightness-110"
          >
            Add
          </button>
        </form>
      </section>

      <section className="grid gap-4 sm:grid-cols-[1fr_280px]">
        <div className="overflow-hidden rounded-lg border border-black/5 bg-white shadow-sm">
          <div className="border-b border-black/5 px-4 py-3 text-sm font-bold text-ink">Prices</div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-black/5 bg-black/[0.02] text-left text-[11px] font-semibold uppercase tracking-wide text-ink/50">
                <th className="px-4 py-2">Price list</th>
                <th className="px-4 py-2">Service</th>
                <th className="px-4 py-2">Item</th>
                <th className="px-4 py-2 text-right">Price</th>
              </tr>
            </thead>
            <tbody>
              {(entries ?? []).map((e: any) => (
                <tr key={e.id} className="border-b border-black/5 last:border-0">
                  <td className="px-4 py-2.5 text-ink/70">{e.price_list_profile?.name}</td>
                  <td className="px-4 py-2.5 font-medium text-ink">{e.service?.name}</td>
                  <td className="px-4 py-2.5 text-ink/60">{e.item?.name ?? "Any item"}</td>
                  <td className="px-4 py-2.5 text-right text-ink">
                    {formatMinor(Number(e.price_minor))} / {e.unit}
                  </td>
                </tr>
              ))}
              {(entries ?? []).length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-sm text-ink/40">
                    No prices set yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <form
          action={createPriceListEntry}
          className="space-y-2 rounded-lg border border-black/5 bg-white p-4 shadow-sm"
        >
          <div className="text-xs font-semibold uppercase tracking-wide text-ink/50">Add price</div>
          <select
            name="price_list_profile_id"
            required
            defaultValue=""
            className="w-full rounded-md border border-black/10 px-3 py-2 text-sm outline-none focus:border-accent"
          >
            <option value="" disabled>
              Price list...
            </option>
            {(profiles ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <select
            name="service_id"
            required
            defaultValue=""
            className="w-full rounded-md border border-black/10 px-3 py-2 text-sm outline-none focus:border-accent"
          >
            <option value="" disabled>
              Service...
            </option>
            {(services ?? []).map((s: any) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <select
            name="item_id"
            defaultValue=""
            className="w-full rounded-md border border-black/10 px-3 py-2 text-sm outline-none focus:border-accent"
          >
            <option value="">Any item</option>
            {(items ?? []).map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
              </option>
            ))}
          </select>
          <input
            name="price"
            type="number"
            step="0.01"
            required
            placeholder="Price in ₹"
            className="w-full rounded-md border border-black/10 px-3 py-2 text-sm outline-none focus:border-accent"
          />
          <select
            name="unit"
            defaultValue="per_piece"
            className="w-full rounded-md border border-black/10 px-3 py-2 text-sm outline-none focus:border-accent"
          >
            <option value="per_piece">Per piece</option>
            <option value="per_kg">Per kg</option>
            <option value="per_set">Per set</option>
          </select>
          <button
            type="submit"
            className="w-full rounded-md bg-accent px-3 py-2 text-sm font-semibold text-white hover:brightness-110"
          >
            Add
          </button>
        </form>
      </section>
    </div>
  );
}
