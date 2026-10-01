import { createClient } from "@/lib/supabase/server";
import { createServiceCategory, createService, toggleService, toggleServiceSubCategories } from "./actions";
import { CatalogueTabs } from "./CatalogueTabs";

const field = "w-full border border-black/10 px-3 py-2 text-sm outline-none focus:border-accent";
const addBtn = "w-full rounded-md bg-accent px-3 py-2 text-sm font-semibold text-white hover:brightness-110";

export default async function ServicesPage() {
  const supabase = createClient();

  const [{ data: categories }, { data: services }] = await Promise.all([
    supabase.from("service_category").select("id, name").is("deleted_at", null).order("sort_order", { ascending: true }),
    supabase
      .from("service")
      .select("id, name, default_unit, is_active, uses_sub_categories, service_category:service_category_id(name)")
      .is("deleted_at", null)
      .order("name"),
  ]);

  return (
    <div>
      <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-accent">Catalogue</div>
      <h1 className="mb-4 font-archivo text-2xl font-extrabold text-ink">Services</h1>
      <CatalogueTabs />
      <p className="-mt-2 mb-6 text-sm text-ink/60">What you do to a garment: wash, dry clean, iron… grouped into categories. Prices are set per price list.</p>

      <div className="space-y-8">
        <section className="grid gap-4 sm:grid-cols-[1fr_280px]">
          <div className="overflow-hidden border-2 border-black/10 bg-white">
            <div className="border-b-2 border-black/10 px-4 py-3 font-archivo text-[13.5px] font-bold text-ink">Services</div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b-2 border-black/10 text-left text-[11px] uppercase tracking-wide text-ink/50">
                  <th className="px-4 py-2">Name</th>
                  <th className="px-4 py-2">Category</th>
                  <th className="px-4 py-2">Unit</th>
                  <th className="px-4 py-2">Sub categories</th>
                  <th className="px-4 py-2">Status</th>
                  <th className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {(services ?? []).map((s: any) => {
                  const cat = Array.isArray(s.service_category) ? s.service_category[0] : s.service_category;
                  return (
                    <tr key={s.id} className="border-b border-black/5 last:border-0">
                      <td className="px-4 py-2.5 font-medium text-ink">{s.name}</td>
                      <td className="px-4 py-2.5 text-ink/60">{cat?.name ?? "—"}</td>
                      <td className="px-4 py-2.5 text-ink/60">{String(s.default_unit).replace("per_", "per ")}</td>
                      <td className="px-4 py-2.5">
                        <form action={toggleServiceSubCategories} className="inline">
                          <input type="hidden" name="id" value={s.id} />
                          <input type="hidden" name="next" value={s.uses_sub_categories ? "false" : "true"} />
                          <button
                            type="submit"
                            title={s.uses_sub_categories ? "Products of this service are grouped by Men, Women, Kids… Click to turn off." : "Click to group this service's products by Men, Women, Kids…"}
                            className={"rounded-full px-2.5 py-0.5 text-[11px] font-semibold " + (s.uses_sub_categories ? "bg-navy text-[#f8f5ef]" : "border border-black/10 text-ink/50")}
                          >
                            {s.uses_sub_categories ? "On" : "Off"}
                          </button>
                        </form>
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={"px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide " + (s.is_active ? "bg-ok/10 text-ok" : "bg-black/5 text-ink/50")}>
                          {s.is_active ? "Active" : "Hidden"}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <form action={toggleService}>
                          <input type="hidden" name="id" value={s.id} />
                          <input type="hidden" name="next_active" value={s.is_active ? "false" : "true"} />
                          <button type="submit" className="text-xs font-semibold text-accent hover:underline">
                            {s.is_active ? "Hide" : "Show"}
                          </button>
                        </form>
                      </td>
                    </tr>
                  );
                })}
                {(services ?? []).length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-6 text-center text-sm text-ink/40">
                      No services yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <form action={createService} className="space-y-2 self-start border-2 border-black/10 bg-white p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-ink/50">Add service</div>
            <input name="name" required placeholder="e.g. Wash & Iron" className={field} />
            <select name="service_category_id" required defaultValue="" className={field}>
              <option value="" disabled>
                Category...
              </option>
              {(categories ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <select name="default_unit" defaultValue="per_piece" className={field}>
              <option value="per_piece">Per piece</option>
              <option value="per_kg">Per kg</option>
              <option value="per_set">Per set</option>
            </select>
            <label className="flex items-center gap-2 text-sm text-ink/70">
              <input type="checkbox" name="uses_sub_categories" /> Uses sub categories (Men, Women…)
            </label>
            <button type="submit" className={addBtn}>
              Add
            </button>
          </form>
        </section>

        <section className="grid gap-4 sm:grid-cols-[1fr_280px]">
          <div className="overflow-hidden border-2 border-black/10 bg-white">
            <div className="border-b-2 border-black/10 px-4 py-3 font-archivo text-[13.5px] font-bold text-ink">Service categories</div>
            <table className="w-full text-sm">
              <tbody>
                {(categories ?? []).map((c) => (
                  <tr key={c.id} className="border-b border-black/5 last:border-0">
                    <td className="px-4 py-2.5 text-ink">{c.name}</td>
                    <td className="px-4 py-2.5 text-right text-ink/50">
                      {(services ?? []).filter((s: any) => (Array.isArray(s.service_category) ? s.service_category[0] : s.service_category)?.name === c.name).length} services
                    </td>
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
          <form action={createServiceCategory} className="space-y-2 self-start border-2 border-black/10 bg-white p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-ink/50">Add category</div>
            <input name="name" required placeholder="e.g. Laundry" className={field} />
            <button type="submit" className={addBtn}>
              Add
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}
