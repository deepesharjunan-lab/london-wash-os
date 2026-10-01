import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createItem, toggleItem, updateItem } from "../actions";
import { CatalogueTabs } from "../CatalogueTabs";
import { Pager } from "../Pager";
import { PER_PAGE_OPTIONS } from "../paging";
import { ProductFields, type ServiceOption } from "./ProductFields";

const UOM_LABEL: Record<string, string> = { per_piece: "Per piece", per_kg: "Per kg", per_set: "Per set" };

type Product = {
  id: string;
  name: string;
  category: string | null;
  is_active: boolean;
  service_id: string | null;
  uom: string | null;
  priority: number;
  description: string | null;
  is_multipiece: boolean;
  pieces: number;
};

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: { q?: string; show?: string; page?: string; per?: string; service?: string; saved?: string; error?: string };
}) {
  const supabase = createClient();
  const q = String(searchParams.q ?? "").trim().slice(0, 60);
  const showHidden = searchParams.show === "all";
  const serviceFilter = String(searchParams.service ?? "");
  const per = PER_PAGE_OPTIONS.includes(Number(searchParams.per)) ? Number(searchParams.per) : 25;
  const page = Math.max(1, Math.floor(Number(searchParams.page) || 1));

  let query = supabase
    .from("item")
    .select("id, name, category, is_active, service_id, uom, priority, description, is_multipiece, pieces", { count: "exact" })
    .is("deleted_at", null)
    .order("priority")
    .order("name")
    .range((page - 1) * per, page * per - 1);
  if (q) query = query.or(`name.ilike.%${q.replace(/[%,()]/g, "")}%,category.ilike.%${q.replace(/[%,()]/g, "")}%`);
  if (!showHidden) query = query.eq("is_active", true);
  if (serviceFilter) query = query.eq("service_id", serviceFilter);

  const [{ data: items, count }, { data: entries }, { data: cats }, { data: svc }, { data: lists }] = await Promise.all([
    query,
    supabase.from("price_list_entry").select("item_id").eq("is_active", true).not("item_id", "is", null),
    supabase.from("item").select("category").is("deleted_at", null).not("category", "is", null),
    supabase.from("service").select("id, name, default_unit, is_active").is("deleted_at", null).order("name"),
    supabase.from("price_list_profile").select("id, name, is_default").eq("is_active", true).order("is_default", { ascending: false }).order("name"),
  ]);
  const total = count ?? 0;
  const priced = new Map<string, number>();
  ((entries ?? []) as { item_id: string }[]).forEach((e) => priced.set(e.item_id, (priced.get(e.item_id) ?? 0) + 1));
  const list = (items ?? []) as Product[];
  const categories = [...new Set(((cats ?? []) as { category: string | null }[]).map((i) => i.category).filter(Boolean))].sort() as string[];
  const services = ((svc ?? []) as (ServiceOption & { is_active: boolean })[]).filter((s) => s.is_active);
  const serviceName = new Map(((svc ?? []) as { id: string; name: string }[]).map((s) => [s.id, s.name] as [string, string]));
  const priceLists = (lists ?? []) as { id: string; name: string; is_default: boolean }[];
  const keep = (extra: string) => `/services/products?per=${per}${q ? `&q=${encodeURIComponent(q)}` : ""}${serviceFilter ? `&service=${serviceFilter}` : ""}${extra}`;

  return (
    <div>
      <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-accent">Catalogue</div>
      <h1 className="mb-4 font-archivo text-2xl font-extrabold text-ink">Products</h1>
      <CatalogueTabs />
      <p className="-mt-2 mb-4 text-sm text-ink/60">
        The garments and articles you take in. Each product has a service type and a unit (per piece, kg or set) that decide how it&apos;s charged.
      </p>
      {searchParams.saved && <div className="mb-4 rounded-xl bg-[#e2eee7] px-4 py-3 text-[13.5px] text-[#2c6a4e]">{searchParams.saved}</div>}
      {searchParams.error && <div className="mb-4 rounded-xl bg-[#f6e4df] px-4 py-3 text-[13.5px] text-[#9c3326]">{searchParams.error}</div>}

      <details className="mb-6 border-2 border-black/10 bg-white" open={total === 0}>
        <summary className="cursor-pointer select-none px-5 py-3 text-[13.5px] font-semibold text-ink">+ Add product</summary>
        <form action={createItem} className="space-y-4 border-t border-black/5 px-5 py-4">
          <ProductFields services={services} idPrefix="new" />
          <div className="grid gap-3 border-t border-black/5 pt-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <label className="block text-[12px] font-semibold text-ink/60">
              Price (₹, optional)
              <input name="price" type="number" min="0" step="0.01" placeholder="Add it to a price list now" className="mt-1 w-full border border-black/10 px-3 py-2 text-sm" />
            </label>
            <label className="block text-[12px] font-semibold text-ink/60">
              In price list
              <select name="price_list_profile_id" defaultValue={priceLists.find((p) => p.is_default)?.id ?? ""} className="mt-1 w-full border border-black/10 px-3 py-2 text-sm">
                {!priceLists.length && <option value="">No price lists yet</option>}
                {priceLists.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                    {p.is_default ? " (default)" : ""}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit" className="rounded-md bg-accent px-5 py-2 text-sm font-semibold text-white hover:brightness-110">
              Add product
            </button>
          </div>
        </form>
      </details>

      <div className="overflow-hidden border-2 border-black/10 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-black/10 px-4 py-3">
          <span className="font-archivo text-[13.5px] font-bold text-ink">
            Products <span className="font-normal text-ink/50">({total})</span>
          </span>
          <form className="flex flex-wrap items-center gap-2">
            <input name="q" defaultValue={q} placeholder="Search name or category" className="w-52 border border-black/10 px-3 py-1.5 text-sm" />
            <select name="service" defaultValue={serviceFilter} className="border border-black/10 px-2 py-1.5 text-sm" aria-label="Filter by service">
              <option value="">All services</option>
              {services.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            {showHidden && <input type="hidden" name="show" value="all" />}
            <input type="hidden" name="per" value={per} />
            <button type="submit" className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white">
              Search
            </button>
            <Link href={keep(showHidden ? "" : "&show=all")} className="text-xs font-semibold text-accent hover:underline">
              {showHidden ? "Hide hidden" : "Show hidden"}
            </Link>
          </form>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead>
              <tr className="border-b-2 border-black/10 text-left text-[11px] uppercase tracking-wide text-ink/50">
                <th className="px-4 py-2">Priority</th>
                <th className="px-4 py-2">Product</th>
                <th className="px-4 py-2">Service type</th>
                <th className="px-4 py-2">UOM</th>
                <th className="px-4 py-2">Pieces</th>
                <th className="px-4 py-2">In price lists</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {list.map((i) => (
                <tr key={i.id} className={"border-b border-black/5 align-top last:border-0 " + (i.is_active ? "" : "opacity-50")}>
                  <td className="px-4 py-2.5 text-ink/60">{i.priority}</td>
                  <td className="px-4 py-2.5">
                    <div className="font-medium text-ink">{i.name}</div>
                    <div className="text-[12px] text-ink/50">
                      {[i.category, i.description].filter(Boolean).join(" · ")}
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-ink/70">{i.service_id ? serviceName.get(i.service_id) ?? "—" : <span className="text-[#8a5a12]">Not set</span>}</td>
                  <td className="px-4 py-2.5 text-ink/70">{UOM_LABEL[i.uom ?? ""] ?? "—"}</td>
                  <td className="px-4 py-2.5 text-ink/70">{i.is_multipiece ? `${i.pieces} pcs` : "1"}</td>
                  <td className="px-4 py-2.5 text-ink/60">{priced.get(i.id) ? `${priced.get(i.id)} prices` : <span className="text-[#8a5a12]">Not priced</span>}</td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-right">
                    <details className="relative inline-block text-left">
                      <summary className="cursor-pointer list-none text-xs font-semibold text-accent hover:underline">Edit</summary>
                      <form action={updateItem} className="absolute right-0 z-10 mt-2 w-[520px] max-w-[90vw] space-y-3 border-2 border-black/10 bg-white p-4 shadow-lg">
                        <input type="hidden" name="id" value={i.id} />
                        <ProductFields services={services} values={i} idPrefix={`e-${i.id}`} />
                        <button type="submit" className="w-full rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white">
                          Save
                        </button>
                      </form>
                    </details>
                    <form action={toggleItem} className="ml-3 inline">
                      <input type="hidden" name="id" value={i.id} />
                      <input type="hidden" name="next_active" value={i.is_active ? "false" : "true"} />
                      <button type="submit" className="text-xs font-semibold text-ink/60 hover:underline">
                        {i.is_active ? "Hide" : "Show"}
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
              {list.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-sm text-ink/40">
                    {q || serviceFilter ? "No products match." : "No products yet. Add your first one above."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {total > 0 && <Pager total={total} page={page} per={per} />}
      </div>
      <datalist id="item-categories">
        {categories.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>
    </div>
  );
}
