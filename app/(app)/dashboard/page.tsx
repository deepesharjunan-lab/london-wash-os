import { createClient } from "@/lib/supabase/server";

function formatMinor(minor: number) {
  return `₹${(minor / 100).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

export default async function DashboardPage() {
  const supabase = createClient();

  const since = new Date();
  since.setDate(since.getDate() - 30);

  const { data: orders, error } = await supabase
    .from("order")
    .select("id, total_minor, status, created_at")
    .gte("created_at", since.toISOString())
    .neq("status", "cancelled");

  const orderIds = (orders ?? []).map((o) => o.id);
  const { data: items } = orderIds.length
    ? await supabase.from("order_item").select("id, order_id, quantity").in("order_id", orderIds)
    : { data: [] as { id: string; order_id: string; quantity: number }[] };

  const revenueMinor = (orders ?? []).reduce((sum, o) => sum + Number(o.total_minor || 0), 0);
  const orderCount = orders?.length ?? 0;
  const garmentCount = (items ?? []).reduce((sum, i) => sum + Number(i.quantity || 0), 0);
  const aovMinor = orderCount ? Math.round(revenueMinor / orderCount) : 0;

  const kpis = [
    { label: "Revenue (30d)", value: formatMinor(revenueMinor) },
    { label: "Orders (30d)", value: String(orderCount) },
    { label: "Garments (30d)", value: String(garmentCount) },
    { label: "Avg. order value", value: formatMinor(aovMinor) },
  ];

  return (
    <div>
      <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-accent">
        Overview
      </div>
      <h1 className="mb-6 font-archivo text-2xl font-extrabold text-ink">Dashboard</h1>

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

      {orderCount === 0 && !error && (
        <p className="mt-8 text-sm text-ink/50">
          No orders in the last 30 days yet, once staff start taking orders through the POS,
          real numbers will show up here automatically.
        </p>
      )}
    </div>
  );
}
