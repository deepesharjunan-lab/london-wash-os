import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { removePriceEntry, savePrices } from "../actions";
import { CatalogueTabs } from "../CatalogueTabs";

const one = (x: any) => (Array.isArray(x) ? x[0] : x);
const rupees = (minor: number) => (minor / 100).toLocaleString("en-IN", { maximumFractionDigits: 2, useGrouping: false });
const UNIT_LABEL: Record<string, string> = { per_piece: "per piece", per_kg: "per kg", per_set: "per set" };

export default async function AddToPriceListPage({
  searchParams,
}: {
  searchParams: { list?: string; service?: string; q?: string; all?: string; saved?: string; error?: string };
}) {
  const supabase = createClient();
  const [{ data: profiles }, { data: services }, { data: items }] = await Promise.all([
    supabase.from("price_list_profile").select("id, name, is_default, is_active").order("is_default", { ascending: false }).order("name"),
    supabase.from("service").select("id, name, default_unit, is_active").is("deleted_at", null).order("name"),
    supabase.from("item").select("id, name, category, service_id, uom").eq("is_active", true).is("deleted_at", null).order("priority").order("name"),
  ]);
  const lists = ((profiles ?? []) as any[]).filter((p) => p.is_active || p.id === searchParams.list);
  const svcs = ((services ?? []) as any[]).filter((s) => s.is_active || s.id === searchParams.service);
  const listId = lists.find((p) => p.id === searchParams.list)?.id ?? lists.find((p) => p.is_default)?.id ?? lists[0]?.id ?? "";
  const service = svcs.find((s) => s.id === searchParams.service) ?? null;
  const q = String(searchParams.q ?? "").trim().toLowerCase();

  const { data: entries } = listId
    ? await supabase
        .from("price_list_entry")
        .select("id, service_id, item_id, price_minor, unit, service:service_id(name), item:item_id(name)")
        .eq("price_list_profile_id", listId)
        .eq("is_active", true)
    : { data: [] };
  const all = (entries ?? []) as any[];
  const forService = service ? all.filter((e) => e.service_id === service.id) : [];
  const byItem = new Map(forService.map((e) => [e.item_id ?? "any", e] as [string, any]));
  const unit = forService[0]?.unit ?? (["per_piece", "per_kg", "per_set"].includes(service?.default_unit) ? service.default_unit : "per_piece");
  const showAll = searchParams.all === "1";
  type Prod = { id: string; name: string; category: string | null; service_id: string | null; uom: string | null };
  const allProducts = (items ?? []) as Prod[];
  // By default show the products of this service (plus any already priced here, and products without a service yet).
  const products = allProducts.filter(
    (i) =>
      (!q || i.name.toLowerCase().includes(q) || (i.category ?? "").toLowerCase().includes(q)) &&
      (showAll || !service || !i.service_id || i.service_id === service.id || byItem.has(i.id))
  );
  const hiddenCount = allProducts.length - allProducts.filter((i) => showAll || !service || !i.service_id || i.service_id === service.id || byItem.has(i.id)).length;
  const perService = new Map<string, number>();
  all.forEach((e) => perService.set(e.service_id, (perService.get(e.service_id) ?? 0) + 1));
  const listName = lists.find((p) => p.id === listId)?.name ?? "";

  return (
    <div>
      <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-accent">Catalogue</div>
      <h1 className="mb-4 font-archivo text-2xl font-extrabold text-ink">Add Products to a Price List</h1>
      <CatalogueTabs />

      {searchParams.saved && <div className="mb-4 rounded-xl bg-[#e2eee7] px-4 py-3 text-[13.5px] text-[#2c6a4e]">Saved: {searchParams.saved}.</div>}
      {searchParams.error && <div className="mb-4 rounded-xl bg-[#f6e4df] px-4 py-3 text-[13.5px] text-[#9c3326]">{searchParams.error}</div>}

      {!lists.length ? (
        <div className="border-2 border-black/10 bg-white p-6 text-sm text-ink/60">
          Create a price list first on{" "}
          <Link href="/services/price-lists" className="font-semibold text-accent hover:underline">
            Price Lists
          </Link>
          .
        </div>
      ) : (
        <>
          <form className="mb-6 flex flex-wrap items-end gap-3 border-2 border-black/10 bg-white p-4">
            <label className="text-[12px] font-semibold text-ink/60">
              1. Price list
              <select name="list" defaultValue={listId} className="mt-1 block min-w-[200px] border border-black/10 px-3 py-2 text-sm">
                {lists.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                    {p.is_default ? " (default)" : ""}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-[12px] font-semibold text-ink/60">
              2. Service
              <select name="service" defaultValue={service?.id ?? ""} className="mt-1 block min-w-[200px] border border-black/10 px-3 py-2 text-sm">
                <option value="" disabled>
                  Choose a service…
                </option>
                {svcs.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} {perService.get(s.id) ? `(${perService.get(s.id)} priced)` : ""}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-[12px] font-semibold text-ink/60">
              Filter products
              <input name="q" defaultValue={searchParams.q ?? ""} placeholder="e.g. saree" className="mt-1 block w-48 border border-black/10 px-3 py-2 text-sm" />
            </label>
            <button type="submit" className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white">
              Show products
            </button>
          </form>

          {service ? (
            <form action={savePrices} className="overflow-hidden border-2 border-black/10 bg-white">
              <input type="hidden" name="price_list_profile_id" value={listId} />
              <input type="hidden" name="service_id" value={service.id} />
              <input type="hidden" name="list" value={listId} />
              <input type="hidden" name="service" value={service.id} />
              <div className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-black/10 px-4 py-3">
                <span className="font-archivo text-[13.5px] font-bold text-ink">
                  3. Prices for {service.name} in {listName}
                </span>
                <span className="flex items-center gap-3">
                  <label className="flex items-center gap-2 text-[12.5px] text-ink/60">
                    Default unit
                    <select name="unit" defaultValue={unit} className="border border-black/10 px-2 py-1 text-sm">
                      <option value="per_piece">per piece</option>
                      <option value="per_kg">per kg</option>
                      <option value="per_set">per set</option>
                    </select>
                  </label>
                  {/* First submit button in the form, so pressing Enter saves (never removes). */}
                  <button type="submit" className="rounded-md bg-accent px-4 py-1.5 text-sm font-semibold text-white hover:brightness-110">
                    Save prices
                  </button>
                </span>
              </div>
              <p className="border-b border-black/5 px-4 py-2 text-[12.5px] text-ink/50">
                Type a price (₹) next to each product this service applies to. Leave the rest blank. Existing prices are filled in and can be changed.
                {!showAll && hiddenCount > 0 && (
                  <>
                    {" "}
                    Showing products of this service.{" "}
                    <Link href={`/services/prices?list=${listId}&service=${service.id}&all=1`} className="font-semibold text-accent hover:underline">
                      Show all {allProducts.length} products
                    </Link>
                  </>
                )}
              </p>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b-2 border-black/10 text-left text-[11px] uppercase tracking-wide text-ink/50">
                    <th className="px-4 py-2">Product</th>
                    <th className="px-4 py-2">Category</th>
                    <th className="px-4 py-2">Price (₹)</th>
                    <th className="px-4 py-2">Charged</th>
                    <th className="px-4 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {[{ id: "any", name: "Any item (one price for the service, e.g. per kg)", category: null as string | null, service_id: null, uom: null } as Prod, ...products].map((p) => {
                    const e = byItem.get(p.id);
                    return (
                      <tr key={p.id} className={"border-b border-black/5 last:border-0 " + (e ? "bg-[#f7faf8]" : "")}>
                        <td className={"px-4 py-2 " + (p.id === "any" ? "italic text-ink/70" : "font-medium text-ink")}>{p.name}</td>
                        <td className="px-4 py-2 text-ink/50">{p.category ?? ""}</td>
                        <td className="px-4 py-2">
                          <input
                            name={`price__${p.id}`}
                            type="number"
                            min="0"
                            step="0.01"
                            inputMode="decimal"
                            defaultValue={e ? rupees(Number(e.price_minor)) : ""}
                            placeholder="—"
                            aria-label={`Price for ${p.name}`}
                            className="w-28 border border-black/10 px-2 py-1.5 text-sm"
                          />
                        </td>
                        <td className="px-4 py-2">
                          <select name={`unit__${p.id}`} defaultValue={e?.unit ?? p.uom ?? unit} aria-label={`Unit for ${p.name}`} className="border border-black/10 px-2 py-1.5 text-sm">
                            <option value="per_piece">per piece</option>
                            <option value="per_kg">per kg</option>
                            <option value="per_set">per set</option>
                          </select>
                        </td>
                        <td className="px-4 py-2 text-right">
                          {e && (
                            <button type="submit" formAction={removePriceEntry} name="id" value={e.id} className="text-xs font-semibold text-[#9c3326] hover:underline">
                              Remove
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {products.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-4 py-4 text-center text-sm text-ink/40">
                        {q ? "No products match the filter." : (
                          <>
                            No products yet. Add them on{" "}
                            <Link href="/services/products" className="font-semibold text-accent hover:underline">
                              Products
                            </Link>
                            .
                          </>
                        )}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
              <div className="sticky bottom-0 flex items-center justify-between gap-3 border-t-2 border-black/10 bg-white px-4 py-3">
                <span className="text-[12.5px] text-ink/50">{forService.length} priced for this service</span>
                <button type="submit" className="rounded-md bg-accent px-5 py-2 text-sm font-semibold text-white hover:brightness-110">
                  Save prices
                </button>
              </div>
            </form>
          ) : (
            <div className="border-2 border-dashed border-black/10 bg-white p-6 text-center text-sm text-ink/50">Choose a service above to start adding products.</div>
          )}

          {all.length > 0 && (
            <section className="mt-8 overflow-hidden border-2 border-black/10 bg-white">
              <div className="border-b-2 border-black/10 px-4 py-3 font-archivo text-[13.5px] font-bold text-ink">
                Everything in {listName} <span className="font-normal text-ink/50">({all.length} prices)</span>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b-2 border-black/10 text-left text-[11px] uppercase tracking-wide text-ink/50">
                    <th className="px-4 py-2">Service</th>
                    <th className="px-4 py-2">Product</th>
                    <th className="px-4 py-2 text-right">Price</th>
                  </tr>
                </thead>
                <tbody>
                  {[...all]
                    .sort((a, b) => (one(a.service)?.name ?? "").localeCompare(one(b.service)?.name ?? "") || (one(a.item)?.name ?? "").localeCompare(one(b.item)?.name ?? ""))
                    .map((e) => (
                      <tr key={e.id} className="border-b border-black/5 last:border-0">
                        <td className="px-4 py-2">
                          <Link href={`/services/prices?list=${listId}&service=${e.service_id}`} className="font-medium text-ink hover:text-accent">
                            {one(e.service)?.name}
                          </Link>
                        </td>
                        <td className="px-4 py-2 text-ink/60">{one(e.item)?.name ?? "Any item"}</td>
                        <td className="px-4 py-2 text-right text-ink">
                          ₹{rupees(Number(e.price_minor))} {UNIT_LABEL[e.unit] ?? e.unit}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </section>
          )}
        </>
      )}
    </div>
  );
}
