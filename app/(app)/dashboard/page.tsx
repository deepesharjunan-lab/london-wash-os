import { createClient } from "@/lib/supabase/server";

function formatMinor(minor: number) {
  return `₹${(minor / 100).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

function toDateInputValue(d: Date) {
  return d.toISOString().slice(0, 10);
}

const channelLabels: Record<string, string> = {
  pos_counter: "POS Counter",
  portal: "Customer Portal",
  whatsapp: "WhatsApp",
  phone: "Phone",
};

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: { from?: string; to?: string; channel?: string };
}) {
  const supabase = createClient();

  const defaultTo = new Date();
  const defaultFrom = new Date();
  defaultFrom.setDate(defaultFrom.getDate() - 30);

  const fromStr = searchParams.from || toDateInputValue(defaultFrom);
  const toStr = searchParams.to || toDateInputValue(defaultTo);
  const channel = searchParams.channel || "";

  const fromIso = new Date(fromStr + "T00:00:00.000Z").toISOString();
  const toIso = new Date(toStr + "T23:59:59.999Z").toISOString();

  let orderQuery = supabase
    .from("order")
    .select("id, total_minor, status, channel, customer_id, created_at")
    .gte("created_at", fromIso)
    .lte("created_at", toIso)
    .neq("status", "cancelled");

  if (channel) {
    orderQuery = orderQuery.eq("channel", channel);
  }

  const { data: orders, error } = await orderQuery;

  const orderIds = (orders ?? []).map((o) => o.id);
  const { data: items } = orderIds.length
    ? await supabase
        .from("order_item")
        .select("id, order_id, item_id, quantity, line_total_minor")
        .in("order_id", orderIds)
    : { data: [] as { id: string; order_id: string; item_id: string | null; quantity: number; line_total_minor: number }[] };

  const itemIds = Array.from(new Set((items ?? []).map((i) => i.item_id).filter(Boolean))) as string[];
  const { data: itemRows } = itemIds.length
    ? await supabase.from("item").select("id, name").in("id", itemIds)
    : { data: [] as { id: string; name: string }[] };
  const itemName = new Map((itemRows ?? []).map((i) => [i.id, i.name]));

  const customerIds = Array.from(new Set((orders ?? []).map((o) => o.customer_id).filter(Boolean))) as string[];
  const { data: customerRows } = customerIds.length
    ? await supabase.from("customer").select("id, full_name").in("id", customerIds)
    : { data: [] as { id: string; full_name: string }[] };
  const customerName = new Map((customerRows ?? []).map((c) => [c.id, c.full_name]));

  const revenueMinor = (orders ?? []).reduce((sum, o) => sum + Number(o.total_minor || 0), 0);
  const orderCount = orders?.length ?? 0;
  const garmentCount = (items ?? []).reduce((sum, i) => sum + Number(i.quantity || 0), 0);
  const aovMinor = orderCount ? Math.round(revenueMinor / orderCount) : 0;

  const kpis = [
    { label: "Revenue", value: formatMinor(revenueMinor) },
    { label: "Orders", value: String(orderCount) },
    { label: "Garments", value: String(garmentCount) },
    { label: "Avg. order value", value: formatMinor(aovMinor) },
  ];

  const itemStats = new Map<string, { quantity: number; revenue: number }>();
  for (const it of items ?? []) {
    if (!it.item_id) continue;
    const key = it.item_id;
    const existing = itemStats.get(key) || { quantity: 0, revenue: 0 };
    existing.quantity += Number(it.quantity || 0);
    existing.revenue += Number(it.line_total_minor || 0);
    itemStats.set(key, existing);
  }
  const topItems = Array.from(itemStats.entries())
    .map(([id, stats]) => ({ id, name: itemName.get(id) || "Unknown item", ...stats }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 8);

  const customerStats = new Map<string, { orderCount: number; revenue: number }>();
  for (const o of orders ?? []) {
    if (!o.customer_id) continue;
    const key = o.customer_id;
    const existing = customerStats.get(key) || { orderCount: 0, revenue: 0 };
    existing.orderCount += 1;
    existing.revenue += Number(o.total_minor || 0);
    customerStats.set(key, existing);
  }
  const topCustomers = Array.from(customerStats.entries())
    .map(([id, stats]) => ({ id, name: customerName.get(id) || "Unknown customer", ...stats }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 8);
  return (
    <div>
      <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-accent">
        Overview
      </div>
      <h1 className="mb-6 font-archivo text-2xl font-extrabold text-ink">Dashboard</h1>

      <form
        method="get"
        className="mb-6 flex flex-wrap items-end gap-3 rounded-lg border border-black/5 bg-white p-4 shadow-sm"
      >
        <div>
          <label className="block text-[10px] font-semibold uppercase tracking-wide text-ink/50">From</label>
          <input
            type="date"
            name="from"
            defaultValue={fromStr}
            className="mt-1 rounded-md border border-slate-300 px-2 py-1.5 text-sm"
          />
        </div>
        <div>
          <label className="block text-[10px] font-semibold uppercase tracking-wide text-ink/50">To</label>
          <input
            type="date"
            name="to"
            defaultValue={toStr}
            className="mt-1 rounded-md border border-slate-300 px-2 py-1.5 text-sm"
          />
        </div>
        <div>
          <label className="block text-[10px] font-semibold uppercase tracking-wide text-ink/50">
            Order type
          </label>
          <select
            name="channel"
            defaultValue={channel}
            className="mt-1 rounded-md border border-slate-300 px-2 py-1.5 text-sm"
          >
            <option value="">All channels</option>
            <option value="pos_counter">POS Counter</option>
            <option value="portal">Customer Portal</option>
            <option value="whatsapp">WhatsApp</option>
            <option value="phone">Phone</option>
          </select>
        </div>
        <button type="submit" className="rounded-md bg-slate-900 px-4 py-1.5 text-sm font-medium text-white">
          Apply
        </button>
        <a href="/dashboard" className="text-sm font-medium text-blue-600">
          Reset to last 30 days
        </a>
      </form>

      {error && (
        <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">
          Could not load orders: {error.message}
        </p>
      )}

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {kpis.map((k) => (
          <div key={k.label} className="rounded-lg border border-black/5 bg-white p-4 shadow-sm">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-ink/50">
              {k.label}
            </div>
            <div className="mt-1 font-archivo text-2xl font-extrabold text-ink">{k.value}</div>
          </div>
        ))}
      </div>
      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-lg border border-black/5 bg-white p-5 shadow-sm">
          <h2 className="mb-3 font-archivo text-lg font-bold text-ink">Top performing items</h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="py-2">Item</th>
                <th className="py-2">Qty</th>
                <th className="py-2">Revenue</th>
              </tr>
            </thead>
            <tbody>
              {topItems.map((it) => (
                <tr key={it.id} className="border-b border-slate-100">
                  <td className="py-2 font-medium">{it.name}</td>
                  <td className="py-2 text-slate-600">{it.quantity}</td>
                  <td className="py-2 text-slate-600">{formatMinor(it.revenue)}</td>
                </tr>
              ))}
              {topItems.length === 0 && (
                <tr>
                  <td colSpan={3} className="py-4 text-center text-slate-400">
                    No item sales in this range.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="rounded-lg border border-black/5 bg-white p-5 shadow-sm">
          <h2 className="mb-3 font-archivo text-lg font-bold text-ink">Top customers</h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="py-2">Customer</th>
                <th className="py-2">Orders</th>
                <th className="py-2">Revenue</th>
              </tr>
            </thead>
            <tbody>
              {topCustomers.map((c) => (
                <tr key={c.id} className="border-b border-slate-100">
                  <td className="py-2 font-medium">{c.name}</td>
                  <td className="py-2 text-slate-600">{c.orderCount}</td>
                  <td className="py-2 text-slate-600">{formatMinor(c.revenue)}</td>
                </tr>
              ))}
              {topCustomers.length === 0 && (
                <tr>
                  <td colSpan={3} className="py-4 text-center text-slate-400">
                    No customer orders in this range.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {orderCount === 0 && !error && (
        <p className="mt-8 text-sm text-ink/50">
          No orders in this range yet, once staff start taking orders through the POS,
          real numbers will show up here automatically.
        </p>
      )}
    </div>
  );
}
