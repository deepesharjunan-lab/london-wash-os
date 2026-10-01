import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createPriceListProfile, setDefaultPriceList, togglePriceList } from "../actions";
import { CatalogueTabs } from "../CatalogueTabs";

const field = "w-full border border-black/10 px-3 py-2 text-sm outline-none focus:border-accent";

export default async function PriceListsPage() {
  const supabase = createClient();
  const [{ data: profiles }, { data: entries }, { data: customers }] = await Promise.all([
    supabase.from("price_list_profile").select("id, name, description, is_default, is_active").order("is_default", { ascending: false }).order("name"),
    supabase.from("price_list_entry").select("price_list_profile_id, service_id").eq("is_active", true),
    supabase.from("customer").select("price_list_profile_id").not("price_list_profile_id", "is", null),
  ]);
  const count = new Map<string, number>();
  const services = new Map<string, Set<string>>();
  ((entries ?? []) as { price_list_profile_id: string; service_id: string }[]).forEach((e) => {
    count.set(e.price_list_profile_id, (count.get(e.price_list_profile_id) ?? 0) + 1);
    services.set(e.price_list_profile_id, (services.get(e.price_list_profile_id) ?? new Set()).add(e.service_id));
  });
  const users = new Map<string, number>();
  ((customers ?? []) as { price_list_profile_id: string }[]).forEach((c) => users.set(c.price_list_profile_id, (users.get(c.price_list_profile_id) ?? 0) + 1));
  const lists = (profiles ?? []) as { id: string; name: string; description: string | null; is_default: boolean; is_active: boolean }[];

  return (
    <div>
      <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-accent">Catalogue</div>
      <h1 className="mb-4 font-archivo text-2xl font-extrabold text-ink">Price Lists</h1>
      <CatalogueTabs />
      <p className="-mt-2 mb-6 text-sm text-ink/60">
        A price list is a set of prices: for example Standard, Express or a corporate rate. The default list is used at the counter unless a customer has their own.
      </p>

      <section className="grid gap-4 lg:grid-cols-[1fr_300px]">
        <div className="overflow-hidden border-2 border-black/10 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b-2 border-black/10 text-left text-[11px] uppercase tracking-wide text-ink/50">
                <th className="px-4 py-2">Price list</th>
                <th className="px-4 py-2">Prices</th>
                <th className="px-4 py-2">Customers</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {lists.map((p) => (
                <tr key={p.id} className={"border-b border-black/5 last:border-0 " + (p.is_active ? "" : "opacity-50")}>
                  <td className="px-4 py-3">
                    <div className="font-medium text-ink">{p.name}</div>
                    {p.description && <div className="text-[12px] text-ink/50">{p.description}</div>}
                  </td>
                  <td className="px-4 py-3 text-ink/70">
                    {count.get(p.id) ?? 0} prices
                    <div className="text-[12px] text-ink/50">{services.get(p.id)?.size ?? 0} services</div>
                  </td>
                  <td className="px-4 py-3 text-ink/70">{users.get(p.id) ?? 0}</td>
                  <td className="px-4 py-3">
                    {p.is_default ? (
                      <span className="inline-flex bg-ok/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-ok">Default</span>
                    ) : p.is_active ? (
                      <span className="text-[12px] text-ink/50">Active</span>
                    ) : (
                      <span className="text-[12px] text-ink/50">Hidden</span>
                    )}
                  </td>
                  <td className="space-x-3 whitespace-nowrap px-4 py-3 text-right text-xs font-semibold">
                    <Link href={`/services/prices?list=${p.id}`} className="text-accent hover:underline">
                      Add products
                    </Link>
                    {!p.is_default && p.is_active && (
                      <form action={setDefaultPriceList} className="inline">
                        <input type="hidden" name="id" value={p.id} />
                        <button type="submit" className="text-ink/60 hover:underline">
                          Make default
                        </button>
                      </form>
                    )}
                    {!p.is_default && (
                      <form action={togglePriceList} className="inline">
                        <input type="hidden" name="id" value={p.id} />
                        <input type="hidden" name="next_active" value={p.is_active ? "false" : "true"} />
                        <button type="submit" className="text-ink/60 hover:underline">
                          {p.is_active ? "Hide" : "Show"}
                        </button>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
              {lists.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-sm text-ink/40">
                    No price lists yet. Create your first one.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <form action={createPriceListProfile} className="space-y-2 self-start border-2 border-black/10 bg-white p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-ink/50">Create price list</div>
          <input name="name" required placeholder="e.g. Standard, Express" className={field} />
          <input name="description" placeholder="Description (optional)" className={field} />
          <label className="flex items-center gap-2 text-sm text-ink/70">
            <input type="checkbox" name="is_default" className="rounded border-black/20" />
            Make this the default
          </label>
          <button type="submit" className="w-full rounded-md bg-accent px-3 py-2 text-sm font-semibold text-white hover:brightness-110">
            Create and add products
          </button>
        </form>
      </section>
    </div>
  );
}
