import { createClient } from "@/lib/supabase/server";
import { createInventoryItem, recordStockMovement } from "./actions";

const TYPE_OPTIONS = ["receipt", "consumption", "adjustment", "transfer_in", "transfer_out"];

function formatQty(n: number, unit: string) {
  return Number(n).toLocaleString("en-IN", { maximumFractionDigits: 2 }) + " " + unit;
}

export default async function InventoryPage() {
  const supabase = createClient();

  const { data: items, error } = await supabase
    .from("inventory_item")
    .select("id, name, unit, reorder_level, quantity_on_hand")
    .is("deleted_at", null)
    .order("name", { ascending: true });

  return (
    <div>
      <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-accent">Inventory</div>
      <h1 className="mb-6 font-archivo text-2xl font-extrabold text-ink">Inventory</h1>

      {error && (
        <p className="mb-4 bg-red-50 px-3 py-2 text-sm text-red-600">
          Could not load inventory: {error.message}
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="overflow-hidden border-2 border-black/10 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b-2 border-black/10 text-left text-[11px] uppercase tracking-wide text-ink/50">
                <th className="px-4 py-3">Item</th>
                <th className="px-4 py-3 text-right">On hand</th>
                <th className="px-4 py-3 text-right">Reorder level</th>
                <th className="px-4 py-3">Record movement</th>
              </tr>
            </thead>
            <tbody>
              {(items ?? []).map((it: any) => {
                const low = Number(it.quantity_on_hand) <= Number(it.reorder_level);
                return (
                  <tr key={it.id} className="border-b border-black/5 last:border-0">
                    <td className="px-4 py-3 font-medium text-ink">
                      {it.name}
                      {low && (
                        <span className="ml-2 inline-flex bg-danger/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-danger">
                          Low stock
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-ink">{formatQty(it.quantity_on_hand, it.unit)}</td>
                    <td className="px-4 py-3 text-right text-ink/60">{formatQty(it.reorder_level, it.unit)}</td>
                    <td className="px-4 py-3">
                      <form action={recordStockMovement} className="flex flex-wrap items-center gap-2">
                        <input type="hidden" name="item_id" value={it.id} />
                        <select
                          name="type"
                          defaultValue="receipt"
                          className="border border-black/10 px-2 py-1.5 text-xs capitalize outline-none focus:border-accent"
                        >
                          {TYPE_OPTIONS.map((t) => (
                            <option key={t} value={t} className="capitalize">
                              {t.replace(/_/g, " ")}
                            </option>
                          ))}
                        </select>
                        <input
                          type="number"
                          name="quantity"
                          step="any"
                          placeholder="Qty"
                          required
                          className="w-20 border border-black/10 px-2 py-1.5 text-xs outline-none focus:border-accent"
                        />
                        <input
                          type="text"
                          name="note"
                          placeholder="Note (optional)"
                          className="w-32 border border-black/10 px-2 py-1.5 text-xs outline-none focus:border-accent"
                        />
                        <button
                          type="submit"
                          className="rounded-md bg-accent px-3 py-1.5 text-xs font-semibold text-white hover:brightness-110"
                        >
                          Save
                        </button>
                      </form>
                    </td>
                  </tr>
                );
              })}
              {(items ?? []).length === 0 && !error && (
                <tr>
                  <td colSpan={4} className="px-4 py-10 text-center text-sm text-ink/50">
                    No inventory items yet. Add your first item to start tracking stock.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="border-2 border-black/10 bg-white p-4">
          <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink/50">Add item</div>
          <form action={createInventoryItem} className="space-y-3">
            <div>
              <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-ink/50">
                Name
              </label>
              <input
                name="name"
                required
                placeholder="e.g. Detergent (5L)"
                className="w-full border border-black/10 px-3 py-2 text-sm outline-none focus:border-accent"
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-ink/50">
                Unit
              </label>
              <input
                name="unit"
                defaultValue="unit"
                placeholder="e.g. litre, kg, piece"
                className="w-full border border-black/10 px-3 py-2 text-sm outline-none focus:border-accent"
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-ink/50">
                Reorder level
              </label>
              <input
                type="number"
                name="reorder_level"
                step="any"
                defaultValue={0}
                className="w-full border border-black/10 px-3 py-2 text-sm outline-none focus:border-accent"
              />
            </div>
            <button
              type="submit"
              className="w-full rounded-md bg-accent px-3 py-2 text-sm font-semibold text-white hover:brightness-110"
            >
              Add item
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
