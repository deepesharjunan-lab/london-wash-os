import { createClient } from "@/lib/supabase/server";
import {
  addSupplier,
  createPurchaseOrder,
  addPurchaseOrderItem,
  updatePurchaseOrderStatus,
} from "./actions";

function formatMinor(minor: number | null) {
  if (minor === null || minor === undefined) return "-";
  return "\u20B9" + (minor / 100).toFixed(2);
}

export default async function PurchasingPage() {
  const supabase = createClient();

  const [
    { data: suppliers },
    { data: purchaseOrders },
    { data: poItems },
    { data: inventoryItems },
  ] = await Promise.all([
    supabase.from("supplier").select("*").is("deleted_at", null).order("name"),
    supabase.from("purchase_order").select("*").order("created_at", { ascending: false }),
    supabase.from("purchase_order_item").select("*").order("created_at", { ascending: false }),
    supabase.from("inventory_item").select("*").is("deleted_at", null).order("name"),
  ]);

  const supplierName = new Map((suppliers || []).map((s) => [s.id, s.name]));
  const itemName = new Map((inventoryItems || []).map((i) => [i.id, i.name]));
  const itemUnit = new Map((inventoryItems || []).map((i) => [i.id, i.unit]));
  const poLabel = new Map(
    (purchaseOrders || []).map((po) => [
      po.id,
      (supplierName.get(po.supplier_id) || "-") + " (" + po.status + ")",
    ])
  );

  const poStatuses = ["draft", "submitted", "received", "cancelled"];

  return (
    <div className="space-y-8">
      <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-accent">Operations</div>
      <h1 className="mb-6 font-archivo text-2xl font-extrabold text-ink">Purchasing</h1>
      <p className="mb-6 -mt-4 text-sm text-ink/60">Suppliers and purchase orders for inventory restocking.</p>
      <section className="border-2 border-black/10 bg-white p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-archivo text-lg font-bold text-ink">Suppliers</h2>
          <details className="relative">
            <summary className="cursor-pointer list-none rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white">
              + Add Supplier
            </summary>
            <form
              action={addSupplier}
              className="absolute right-0 z-10 mt-2 w-72 space-y-3 border-2 border-black/10 bg-white p-4"
            >
              <div>
                <label className="block text-xs font-medium text-slate-600">Supplier Name</label>
                <input name="name" required className="mt-1 w-full border border-black/10 px-2 py-1.5 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600">Contact Phone</label>
                <input name="contact_phone" className="mt-1 w-full border border-black/10 px-2 py-1.5 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600">Contact Email</label>
                <input type="email" name="contact_email" className="mt-1 w-full border border-black/10 px-2 py-1.5 text-sm" />
              </div>
              <button type="submit" className="w-full rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white">
                Save Supplier
              </button>
            </form>
          </details>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b-2 border-black/10 text-left text-[11px] uppercase tracking-wide text-ink/50">
              <th className="py-2">Name</th>
              <th className="py-2">Phone</th>
              <th className="py-2">Email</th>
            </tr>
          </thead>
          <tbody>
            {(suppliers || []).map((s) => (
              <tr key={s.id} className="border-b border-black/5">
                <td className="py-2 font-medium text-slate-900">{s.name}</td>
                <td className="py-2 text-slate-600">{s.contact_phone || "-"}</td>
                <td className="py-2 text-slate-600">{s.contact_email || "-"}</td>
              </tr>
            ))}
            {(!suppliers || suppliers.length === 0) && (
              <tr>
                <td colSpan={3} className="py-4 text-center text-slate-400">
                  No suppliers yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
      <section className="border-2 border-black/10 bg-white p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-archivo text-lg font-bold text-ink">Purchase Orders</h2>
          <details className="relative">
            <summary className="cursor-pointer list-none rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white">
              + Create Purchase Order
            </summary>
            <form
              action={createPurchaseOrder}
              className="absolute right-0 z-10 mt-2 w-72 space-y-3 border-2 border-black/10 bg-white p-4"
            >
              <div>
                <label className="block text-xs font-medium text-slate-600">Supplier</label>
                <select name="supplier_id" required className="mt-1 w-full border border-black/10 px-2 py-1.5 text-sm">
                  <option value="">Select supplier</option>
                  {(suppliers || []).map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
              <button type="submit" className="w-full rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white">
                Create PO
              </button>
            </form>
          </details>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b-2 border-black/10 text-left text-[11px] uppercase tracking-wide text-ink/50">
              <th className="py-2">Supplier</th>
              <th className="py-2">Status</th>
              <th className="py-2">Total</th>
              <th className="py-2">Created</th>
              <th className="py-2"></th>
            </tr>
          </thead>
          <tbody>
            {(purchaseOrders || []).map((po) => (
              <tr key={po.id} className="border-b border-black/5">
                <td className="py-2 font-medium text-slate-900">{supplierName.get(po.supplier_id) || "-"}</td>
                <td className="py-2 text-slate-600">{po.status}</td>
                <td className="py-2 text-slate-600">{formatMinor(po.total_minor)}</td>
                <td className="py-2 text-slate-600">{new Date(po.created_at).toLocaleDateString()}</td>
                <td className="py-2 text-right">
                  <form action={updatePurchaseOrderStatus} className="inline-flex items-center gap-2">
                    <input type="hidden" name="id" value={po.id} />
                    <select name="status" defaultValue={po.status} className="border border-black/10 px-1.5 py-1 text-xs">
                      {poStatuses.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                    <button type="submit" className="text-xs font-medium text-blue-600 hover:underline">
                      Update
                    </button>
                  </form>
                </td>
              </tr>
            ))}
            {(!purchaseOrders || purchaseOrders.length === 0) && (
              <tr>
                <td colSpan={5} className="py-4 text-center text-slate-400">
                  No purchase orders yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
      <section className="border-2 border-black/10 bg-white p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-archivo text-lg font-bold text-ink">Purchase Order Items</h2>
          <details className="relative">
            <summary className="cursor-pointer list-none rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white">
              + Add Item
            </summary>
            <form
              action={addPurchaseOrderItem}
              className="absolute right-0 z-10 mt-2 w-72 space-y-3 border-2 border-black/10 bg-white p-4"
            >
              <div>
                <label className="block text-xs font-medium text-slate-600">Purchase Order</label>
                <select name="purchase_order_id" required className="mt-1 w-full border border-black/10 px-2 py-1.5 text-sm">
                  <option value="">Select PO</option>
                  {(purchaseOrders || []).map((po) => (
                    <option key={po.id} value={po.id}>
                      {poLabel.get(po.id)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600">Item</label>
                <select name="inventory_item_id" required className="mt-1 w-full border border-black/10 px-2 py-1.5 text-sm">
                  <option value="">Select item</option>
                  {(inventoryItems || []).map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.name} ({i.unit})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600">Quantity</label>
                <input type="number" step="0.01" name="quantity" required className="mt-1 w-full border border-black/10 px-2 py-1.5 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600">Unit Price (\u20B9)</label>
                <input type="number" step="0.01" name="unit_price" required className="mt-1 w-full border border-black/10 px-2 py-1.5 text-sm" />
              </div>
              <button type="submit" className="w-full rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white">
                Add Item
              </button>
            </form>
          </details>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b-2 border-black/10 text-left text-[11px] uppercase tracking-wide text-ink/50">
              <th className="py-2">Purchase Order</th>
              <th className="py-2">Item</th>
              <th className="py-2">Quantity</th>
              <th className="py-2">Unit Price</th>
              <th className="py-2">Line Total</th>
            </tr>
          </thead>
          <tbody>
            {(poItems || []).map((it) => (
              <tr key={it.id} className="border-b border-black/5">
                <td className="py-2 font-medium text-slate-900">{poLabel.get(it.purchase_order_id) || "-"}</td>
                <td className="py-2 text-slate-600">
                  {itemName.get(it.inventory_item_id) || "-"} ({itemUnit.get(it.inventory_item_id) || "-"})
                </td>
                <td className="py-2 text-slate-600">{it.quantity}</td>
                <td className="py-2 text-slate-600">{formatMinor(it.unit_price_minor)}</td>
                <td className="py-2 text-slate-600">{formatMinor(it.line_total_minor)}</td>
              </tr>
            ))}
            {(!poItems || poItems.length === 0) && (
              <tr>
                <td colSpan={5} className="py-4 text-center text-slate-400">
                  No purchase order items yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
