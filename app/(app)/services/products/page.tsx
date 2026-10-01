import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createItem, toggleItem, updateItem } from "../actions";
import { CatalogueTabs } from "../CatalogueTabs";

const field = "w-full border border-black/10 px-3 py-2 text-sm outline-none focus:border-accent";

export default async function ProductsPage({ searchParams }: { searchParams: { q?: string; show?: string } }) {
  const supabase = createClient();
  const q = String(searchParams.q ?? "").trim().slice(0, 60);
  const showHidden = searchParams.show === "all";

  let query = supabase.from("item").select("id, name, category, is_active").is("deleted_at", null).order("category").order("name");
  if (q) query = query.or(`name.ilike.%${q.replace(/[%,()]/g, "")}%,category.ilike.%${q.replace(/[%,()]/g, "")}%`);
  if (!showHidden) query = query.eq("is_active", true);
  const [{ data: items }, { data: entries }] = await Promise.all([
    query,
    supabase.from("price_list_entry").select("item_id").eq("is_active", true).not("item_id", "is", null),
  ]);
  const priced = new Map<string, number>();
  ((entries ?? []) as { item_id: string }[]).forEach((e) => priced.set(e.item_id, (priced.get(e.item_id) ?? 0) + 1));
  const list = (items ?? []) as { id: string; name: string; category: string | null; is_active: boolean }[];
  const categories = [...new Set(list.map((i) => i.category).filter(Boolean))] as string[];

  return (
    <div>
      <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-accent">Catalogue</div>
      <h1 className="mb-4 font-archivo text-2xl font-extrabold text-ink">Products</h1>
      <CatalogueTabs />
      <p className="-mt-2 mb-6 text-sm text-ink/60">The garments and articles you take in: shirt, saree, blanket… Add them here, then price them in a price list.</p>

      <section className="grid gap-4 lg:grid-cols-[1fr_300px]">
        <div className="overflow-hidden border-2 border-black/10 bg-white">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-black/10 px-4 py-3">
            <span className="font-archivo text-[13.5px] font-bold text-ink">
              Products <span className="font-normal text-ink/50">({list.length})</span>
            </span>
            <form className="flex items-center gap-2">
              <input name="q" defaultValue={q} placeholder="Search name or category" className="w-56 border border-black/10 px-3 py-1.5 text-sm" />
              {showHidden && <input type="hidden" name="show" value="all" />}
              <button type="submit" className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white">
                Search
              </button>
              <Link href={`/services/products?${q ? `q=${encodeURIComponent(q)}&` : ""}${showHidden ? "" : "show=all"}`} className="text-xs font-semibold text-accent hover:underline">
                {showHidden ? "Hide hidden" : "Show hidden"}
              </Link>
            </form>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b-2 border-black/10 text-left text-[11px] uppercase tracking-wide text-ink/50">
                <th className="px-4 py-2">Product</th>
                <th className="px-4 py-2">Category</th>
                <th className="px-4 py-2">In price lists</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {list.map((i) => (
                <tr key={i.id} className={"border-b border-black/5 last:border-0 " + (i.is_active ? "" : "opacity-50")}>
                  <td className="px-4 py-2.5 font-medium text-ink">{i.name}</td>
                  <td className="px-4 py-2.5 text-ink/60">{i.category ?? "—"}</td>
                  <td className="px-4 py-2.5 text-ink/60">{priced.get(i.id) ? `${priced.get(i.id)} prices` : <span className="text-[#8a5a12]">Not priced</span>}</td>
                  <td className="px-4 py-2.5 text-right">
                    <details className="relative inline-block text-left">
                      <summary className="cursor-pointer list-none text-xs font-semibold text-accent hover:underline">Edit</summary>
                      <form action={updateItem} className="absolute right-0 z-10 mt-2 w-64 space-y-2 border-2 border-black/10 bg-white p-3">
                        <input type="hidden" name="id" value={i.id} />
                        <input name="name" defaultValue={i.name} required className={field} />
                        <input name="category" defaultValue={i.category ?? ""} placeholder="Category" list="item-categories" className={field} />
                        <button type="submit" className="w-full rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white">
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
                  <td colSpan={4} className="px-4 py-6 text-center text-sm text-ink/40">
                    {q ? "No products match." : "No products yet."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <form action={createItem} className="space-y-2 self-start border-2 border-black/10 bg-white p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-ink/50">Add product</div>
          <input name="name" required placeholder="e.g. Shirt" className={field} />
          <input name="category" placeholder="Category, e.g. Men's wear" list="item-categories" className={field} />
          <button type="submit" className="w-full rounded-md bg-accent px-3 py-2 text-sm font-semibold text-white hover:brightness-110">
            Add
          </button>
          <p className="text-[12px] text-ink/50">
            Next: <Link href="/services/prices" className="font-semibold text-accent hover:underline">add it to a price list</Link>.
          </p>
        </form>
      </section>
      <datalist id="item-categories">
        {categories.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>
    </div>
  );
}
