import { createClient } from "@/lib/supabase/server";
import { saveSubCategory } from "../actions";
import { CatalogueTabs } from "../CatalogueTabs";
import { Pager } from "../Pager";
import { PER_PAGE_OPTIONS } from "../paging";
import { ToggleInput } from "@/lib/ui/Toggle";

const field = "w-full border border-black/10 px-3 py-2 text-sm outline-none focus:border-accent";
const filter = "mt-1.5 w-full rounded border border-black/10 px-2 py-1 text-[12.5px] font-normal normal-case tracking-normal";
const clean = (s: string) => s.replace(/[%,()]/g, "").trim().slice(0, 60);

export default async function SubCategoriesPage({
  searchParams,
}: {
  searchParams: { name?: string; desc?: string; active?: string; page?: string; per?: string; saved?: string; error?: string };
}) {
  const supabase = createClient();
  const name = clean(searchParams.name ?? "");
  const desc = clean(searchParams.desc ?? "");
  const active = searchParams.active === "Y" || searchParams.active === "N" ? searchParams.active : "";
  const per = PER_PAGE_OPTIONS.includes(Number(searchParams.per)) ? Number(searchParams.per) : 10;
  const page = Math.max(1, Math.floor(Number(searchParams.page) || 1));

  let query = supabase
    .from("item_sub_category")
    .select("id, name, description, is_active, sort_order", { count: "exact" })
    .order("sort_order")
    .order("name")
    .range((page - 1) * per, page * per - 1);
  if (name) query = query.ilike("name", `%${name}%`);
  if (desc) query = query.ilike("description", `%${desc}%`);
  if (active) query = query.eq("is_active", active === "Y");
  const [{ data, count }, { data: used }] = await Promise.all([query, supabase.from("item").select("sub_category_id").not("sub_category_id", "is", null).is("deleted_at", null)]);
  const rows = (data ?? []) as { id: string; name: string; description: string | null; is_active: boolean }[];
  const total = count ?? 0;
  const products = new Map<string, number>();
  ((used ?? []) as { sub_category_id: string }[]).forEach((u) => products.set(u.sub_category_id, (products.get(u.sub_category_id) ?? 0) + 1));

  return (
    <div>
      <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-accent">Catalogue</div>
      <h1 className="mb-4 font-archivo text-2xl font-extrabold text-ink">Sub Categories</h1>
      <CatalogueTabs />
      <p className="-mt-2 mb-4 text-sm text-ink/60">
        Groups for laundry products (washing, ironing, dry cleaning): Men, Women, Kids… On the POS they appear as tabs to find products quickly.
      </p>
      {searchParams.saved && <div className="mb-4 rounded-xl bg-[#e2eee7] px-4 py-3 text-[13.5px] text-[#2c6a4e]">{searchParams.saved}</div>}
      {searchParams.error && <div className="mb-4 rounded-xl bg-[#f6e4df] px-4 py-3 text-[13.5px] text-[#9c3326]">{searchParams.error}</div>}

      <section className="grid gap-4 lg:grid-cols-[1fr_280px]">
        <div className="overflow-hidden border-2 border-black/10 bg-white">
          <form id="subcat-filter" />
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b-2 border-black/10 text-left align-top text-[11px] uppercase tracking-wide text-ink/50">
                <th className="w-16 px-4 py-2">Sr No</th>
                <th className="px-4 py-2">
                  Name
                  <input form="subcat-filter" name="name" defaultValue={name} placeholder="Enter name…" className={filter} />
                </th>
                <th className="px-4 py-2">
                  Description
                  <input form="subcat-filter" name="desc" defaultValue={desc} placeholder="Enter description…" className={filter} />
                </th>
                <th className="w-32 px-4 py-2">
                  Is active
                  <select form="subcat-filter" name="active" defaultValue={active} className={filter}>
                    <option value="">All</option>
                    <option value="Y">Y</option>
                    <option value="N">N</option>
                  </select>
                </th>
                <th className="w-28 px-4 py-2 text-right">
                  <input form="subcat-filter" type="hidden" name="per" value={per} />
                  <button form="subcat-filter" type="submit" className="mt-5 rounded-md bg-slate-900 px-3 py-1 text-[12px] font-medium normal-case tracking-normal text-white">
                    Filter
                  </button>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.id} className="border-b border-black/5 last:border-0">
                  <td className="px-4 py-2.5 text-ink/60">{(page - 1) * per + i + 1}</td>
                  <td className="px-4 py-2.5 font-medium text-ink">
                    {r.name}
                    <span className="ml-2 text-[11.5px] font-normal text-ink/40">{products.get(r.id) ?? 0} products</span>
                  </td>
                  <td className="px-4 py-2.5 text-ink/60">{r.description ?? ""}</td>
                  <td className="px-4 py-2.5">{r.is_active ? "Y" : "N"}</td>
                  <td className="px-4 py-2.5 text-right">
                    <details className="relative inline-block text-left">
                      <summary className="cursor-pointer list-none text-[13px] font-semibold text-accent underline-offset-2 hover:underline">Edit</summary>
                      <form action={saveSubCategory} className="absolute right-0 z-10 mt-2 w-72 space-y-2 border-2 border-black/10 bg-white p-4 shadow-lg">
                        <input type="hidden" name="id" value={r.id} />
                        <input name="name" required defaultValue={r.name} className={field} aria-label="Name" />
                        <textarea name="description" rows={2} defaultValue={r.description ?? ""} placeholder="Description" className={field} aria-label="Description" />
                        <ToggleInput name="is_active" defaultChecked={r.is_active} label="Active" />
                        <button type="submit" className="w-full rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white">
                          Save
                        </button>
                      </form>
                    </details>
                  </td>
                </tr>
              ))}
              {!rows.length && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-sm text-ink/40">
                    No sub categories match.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          {total > 0 && <Pager total={total} page={page} per={per} />}
        </div>

        <form action={saveSubCategory} className="space-y-2 self-start border-2 border-black/10 bg-white p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-ink/50">Add sub category</div>
          <input name="name" required placeholder="e.g. Baby" className={field} aria-label="Name" />
          <textarea name="description" rows={2} placeholder="Description (optional)" className={field} aria-label="Description" />
          <button type="submit" className="w-full rounded-md bg-accent px-3 py-2 text-sm font-semibold text-white hover:brightness-110">
            Add
          </button>
        </form>
      </section>
    </div>
  );
}
