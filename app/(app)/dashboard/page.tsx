import { createClient } from "@/lib/supabase/server";

function formatMinor(minor: number) {
  return `₹${(minor / 100).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

function pct(n: number) {
  if (!Number.isFinite(n)) return "0%";
  return `${n >= 0 ? "" : ""}${n.toFixed(0)}%`;
}

function deltaPct(current: number, previous: number) {
  if (previous <= 0) return current > 0 ? 100 : 0;
  return ((current - previous) / previous) * 100;
}

const RANGE_DAYS: Record<string, number> = { today: 1, "7d": 7, "30d": 30, "90d": 90 };
const RANGE_LABELS: Record<string, string> = {
  today: "Today",
  "7d": "7 days",
  "30d": "30 days",
  "90d": "90 days",
};
const SORT_LABELS: Record<string, string> = {
  revenue: "Revenue",
  customers: "Customers",
  orders: "Orders",
  garments: "Garments",
};
const channelLabels: Record<string, string> = {
  pos_counter: "POS Counter",
  portal: "Customer Portal",
  whatsapp: "WhatsApp",
  phone: "Phone",
};
const CHANNEL_COLORS: Record<string, string> = {
  pos_counter: "#201e1d",
  portal: "#ec3013",
  whatsapp: "#7d7979",
  phone: "#bab6b6",
};
const LIVE_STATUSES = ["confirmed", "in_production", "ready", "out_for_delivery"];
const stageLabels: Record<string, string> = {
  confirmed: "Confirmed",
  in_production: "In production",
  ready: "Ready",
  out_for_delivery: "Out for delivery",
};

function timeAgo(iso: string) {
  const ms = Date.now() - new Date(iso).getTime();
  const hours = ms / 3_600_000;
  if (hours < 1) return `${Math.max(1, Math.round(ms / 60_000))}m ago`;
  if (hours < 48) return `${Math.round(hours)}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: { range?: string; sort?: string };
}) {
  const supabase = createClient();

  const range = RANGE_DAYS[searchParams.range || ""] ? (searchParams.range as string) : "30d";
  const days = RANGE_DAYS[range];
  const sort = SORT_LABELS[searchParams.sort || ""] ? (searchParams.sort as string) : "revenue";

  const now = new Date();
  const from = new Date(now);
  from.setDate(from.getDate() - days);
  const prevFrom = new Date(from);
  prevFrom.setDate(prevFrom.getDate() - days);
  const fourteenDaysAgo = new Date(now);
  fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 13);
  fourteenDaysAgo.setHours(0, 0, 0, 0);

  const fromIso = from.toISOString();
  const toIso = now.toISOString();
  const prevFromIso = prevFrom.toISOString();

  const [
    { data: orders, error },
    { data: prevOrders },
    { data: liveOrders },
    { data: productionJobs },
    { data: subs },
    { data: wallets },
    { data: fortnightOrders },
  ] = await Promise.all([
    supabase
      .from("order")
      .select("id, total_minor, status, channel, customer_id, created_at")
      .gte("created_at", fromIso)
      .lte("created_at", toIso)
      .neq("status", "cancelled"),
    supabase
      .from("order")
      .select("id, total_minor, status, customer_id, created_at")
      .gte("created_at", prevFromIso)
      .lt("created_at", fromIso)
      .neq("status", "cancelled"),
    supabase
      .from("order")
      .select(
        "id, order_number, total_minor, status, customer_id, created_at, customer:customer_id(full_name)"
      )
      .in("status", LIVE_STATUSES)
      .order("created_at", { ascending: true })
      .limit(6),
    supabase
      .from("production_job")
      .select("id, status, workflow_stage:workflow_stage_id(name, sort_order)")
      .in("status", ["queued", "in_progress", "blocked"]),
    supabase.from("subscription").select("id, status"),
    supabase.from("customer").select("wallet_balance_minor"),
    supabase
      .from("order")
      .select("total_minor, created_at")
      .gte("created_at", fourteenDaysAgo.toISOString())
      .neq("status", "cancelled"),
  ]);

  const orderIds = (orders ?? []).map((o) => o.id);
  const prevOrderIds = (prevOrders ?? []).map((o) => o.id);
  const allOrderIds = Array.from(new Set([...orderIds, ...prevOrderIds]));

  const { data: items } = allOrderIds.length
    ? await supabase
        .from("order_item")
        .select(
          "id, order_id, item_id, service_id, quantity, line_total_minor, item:item_id(name), service:service_id(name)"
        )
        .in("order_id", allOrderIds)
    : { data: [] as any[] };

  const { data: payments } = orderIds.length
    ? await supabase
        .from("payment")
        .select("order_id, amount_minor, status")
        .in("order_id", orderIds)
        .eq("status", "captured")
    : { data: [] as any[] };

  const customerIds = Array.from(
    new Set([...(orders ?? []), ...(prevOrders ?? [])].map((o) => o.customer_id).filter(Boolean))
  ) as string[];
  const { data: customerRows } = customerIds.length
    ? await supabase.from("customer").select("id, full_name, tier").in("id", customerIds)
    : { data: [] as any[] };
  const customerById = new Map((customerRows ?? []).map((c: any) => [c.id, c]));

  const currentItems = (items ?? []).filter((i: any) => orderIds.includes(i.order_id));
  const prevItems = (items ?? []).filter((i: any) => prevOrderIds.includes(i.order_id));

  // ---- top-line KPIs ----
  const revenueMinor = (orders ?? []).reduce((s, o) => s + Number(o.total_minor || 0), 0);
  const prevRevenueMinor = (prevOrders ?? []).reduce((s, o) => s + Number(o.total_minor || 0), 0);
  const orderCount = orders?.length ?? 0;
  const garmentCount = currentItems.reduce((s: number, i: any) => s + Number(i.quantity || 0), 0);
  const aovMinor = orderCount ? Math.round(revenueMinor / orderCount) : 0;
  const prevAovMinor = (prevOrders?.length ?? 0)
    ? Math.round(prevRevenueMinor / (prevOrders as any[]).length)
    : 0;
  const perGarmentMinor = garmentCount ? Math.round(revenueMinor / garmentCount) : 0;

  const custOrderCounts = new Map<string, number>();
  for (const o of orders ?? []) {
    if (!o.customer_id) continue;
    custOrderCounts.set(o.customer_id, (custOrderCounts.get(o.customer_id) || 0) + 1);
  }
  const uniqueCustomers = custOrderCounts.size;
  const repeatCustomers = Array.from(custOrderCounts.values()).filter((n) => n > 1).length;
  const repeatRate = uniqueCustomers ? (repeatCustomers / uniqueCustomers) * 100 : 0;
  const newCustCount = uniqueCustomers - repeatCustomers;

  const atRiskCount =
    (productionJobs ?? []).filter((j: any) => j.status === "blocked").length +
    (liveOrders ?? []).filter((o: any) => Date.now() - new Date(o.created_at).getTime() > 48 * 3_600_000)
      .length;

  const kpis = [
    {
      label: "Revenue",
      value: formatMinor(revenueMinor),
      note: `${deltaPct(revenueMinor, prevRevenueMinor) >= 0 ? "▲" : "▼"} ${Math.abs(
        deltaPct(revenueMinor, prevRevenueMinor)
      ).toFixed(0)}% vs prev. ${RANGE_LABELS[range].toLowerCase()}`,
      positive: deltaPct(revenueMinor, prevRevenueMinor) >= 0,
    },
    { label: "Orders", value: String(orderCount), note: `${newCustCount} new customers`, positive: true },
    {
      label: "Garments",
      value: String(garmentCount),
      note: `${formatMinor(perGarmentMinor)} per garment`,
      positive: true,
    },
    {
      label: "Avg. order value",
      value: formatMinor(aovMinor),
      note: `${deltaPct(aovMinor, prevAovMinor) >= 0 ? "▲" : "▼"} ${Math.abs(
        deltaPct(aovMinor, prevAovMinor)
      ).toFixed(0)}%`,
      positive: deltaPct(aovMinor, prevAovMinor) >= 0,
    },
    {
      label: "Repeat rate",
      value: `${repeatRate.toFixed(0)}%`,
      note: "of orders from returning",
      positive: true,
    },
  ];

  // ---- service performance ----
  type SvcStat = {
    id: string;
    name: string;
    orders: Set<string>;
    customers: Set<string>;
    garments: number;
    revenue: number;
  };
  function rollupByService(rows: any[], orderCustomer: Map<string, string | null>) {
    const map = new Map<string, SvcStat>();
    for (const it of rows) {
      const key = it.service_id || "none";
      const name = it.service?.name || "Unassigned";
      const existing =
        map.get(key) || { id: key, name, orders: new Set(), customers: new Set(), garments: 0, revenue: 0 };
      existing.orders.add(it.order_id);
      const cust = orderCustomer.get(it.order_id);
      if (cust) existing.customers.add(cust);
      existing.garments += Number(it.quantity || 0);
      existing.revenue += Number(it.line_total_minor || 0);
      map.set(key, existing);
    }
    return map;
  }
  const orderCustomerMap = new Map((orders ?? []).map((o) => [o.id, o.customer_id]));
  const prevOrderCustomerMap = new Map((prevOrders ?? []).map((o) => [o.id, o.customer_id]));
  const svcMap = rollupByService(currentItems, orderCustomerMap);
  const prevSvcMap = rollupByService(prevItems, prevOrderCustomerMap);

  const svcRowsRaw = Array.from(svcMap.values()).map((s) => {
    const prev = prevSvcMap.get(s.id);
    const prevRevenue = prev?.revenue || 0;
    return {
      id: s.id,
      name: s.name,
      orders: s.orders.size,
      customers: s.customers.size,
      garments: s.garments,
      revenue: s.revenue,
      aov: s.orders.size ? Math.round(s.revenue / s.orders.size) : 0,
      share: revenueMinor ? (s.revenue / revenueMinor) * 100 : 0,
      delta: deltaPct(s.revenue, prevRevenue),
      hasPrev: prevRevenue > 0,
    };
  });
  const sortKeyMap: Record<string, (r: any) => number> = {
    revenue: (r) => r.revenue,
    customers: (r) => r.customers,
    orders: (r) => r.orders,
    garments: (r) => r.garments,
  };
  const svcRows = svcRowsRaw.sort((a, b) => sortKeyMap[sort](b) - sortKeyMap[sort](a));
  const maxSvcRevenue = Math.max(1, ...svcRows.map((r) => r.revenue));

  const biggestShare = [...svcRows].sort((a, b) => b.revenue - a.revenue)[0];
  const mostCustomers = [...svcRows].sort((a, b) => b.customers - a.customers)[0];
  const withPrev = svcRows.filter((r) => r.hasPrev);
  const fastestGrowing = [...withPrev].sort((a, b) => b.delta - a.delta)[0];
  const declining = [...withPrev].sort((a, b) => a.delta - b.delta)[0];

  // ---- channels ----
  const channelStats = new Map<string, { count: number; revenue: number }>();
  for (const o of orders ?? []) {
    const key = o.channel || "pos_counter";
    const existing = channelStats.get(key) || { count: 0, revenue: 0 };
    existing.count += 1;
    existing.revenue += Number(o.total_minor || 0);
    channelStats.set(key, existing);
  }
  const channels = Array.from(channelStats.entries())
    .map(([key, s]) => ({
      key,
      name: channelLabels[key] || key,
      color: CHANNEL_COLORS[key] || "#9b9797",
      pct: orderCount ? (s.count / orderCount) * 100 : 0,
      revenue: s.revenue,
    }))
    .sort((a, b) => b.revenue - a.revenue);

  // ---- customer segments (by tier) ----
  const segMap = new Map<string, { count: number; revenue: number }>();
  for (const [custId, orderN] of custOrderCounts.entries()) {
    const tier = customerById.get(custId)?.tier || "Unclassified";
    const custOrders = (orders ?? []).filter((o) => o.customer_id === custId);
    const custRevenue = custOrders.reduce((s, o) => s + Number(o.total_minor || 0), 0);
    const existing = segMap.get(tier) || { count: 0, revenue: 0 };
    existing.count += 1;
    existing.revenue += custRevenue;
    segMap.set(tier, existing);
  }
  const segments = Array.from(segMap.entries())
    .map(([name, s]) => ({
      name: name.charAt(0).toUpperCase() + name.slice(1),
      count: s.count,
      revenue: s.revenue,
      pct: revenueMinor ? (s.revenue / revenueMinor) * 100 : 0,
      aov: s.count ? Math.round(s.revenue / s.count) : 0,
    }))
    .sort((a, b) => b.revenue - a.revenue);

  // ---- top items ----
  const itemStats = new Map<string, { name: string; service: string; quantity: number; revenue: number }>();
  for (const it of currentItems) {
    if (!it.item_id) continue;
    const key = it.item_id;
    const existing = itemStats.get(key) || {
      name: it.item?.name || "Unknown item",
      service: it.service?.name || "-",
      quantity: 0,
      revenue: 0,
    };
    existing.quantity += Number(it.quantity || 0);
    existing.revenue += Number(it.line_total_minor || 0);
    itemStats.set(key, existing);
  }
  const topItems = Array.from(itemStats.entries())
    .map(([id, s]) => ({ id, ...s }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 8);
  const maxItemRevenue = Math.max(1, ...topItems.map((i) => i.revenue));

  // ---- production load ----
  const stageStats = new Map<string, { count: number; sort: number }>();
  for (const j of productionJobs ?? []) {
    const stage = (j as any).workflow_stage;
    const name = stage?.name || "Unassigned";
    const sortOrder = stage?.sort_order ?? 999;
    const existing = stageStats.get(name) || { count: 0, sort: sortOrder };
    existing.count += 1;
    stageStats.set(name, existing);
  }
  const loadRows = Array.from(stageStats.entries())
    .map(([name, s]) => ({ name, count: s.count, sort: s.sort }))
    .sort((a, b) => a.sort - b.sort);
  const maxLoad = Math.max(1, ...loadRows.map((r) => r.count));
  const bottleneck = [...loadRows].sort((a, b) => b.count - a.count)[0];

  // ---- 14-day revenue chart ----
  const dayBuckets: { date: string; revenue: number }[] = [];
  for (let i = 0; i < 14; i++) {
    const d = new Date(fourteenDaysAgo);
    d.setDate(d.getDate() + i);
    dayBuckets.push({ date: d.toISOString().slice(0, 10), revenue: 0 });
  }
  const bucketByDate = new Map(dayBuckets.map((b) => [b.date, b]));
  for (const o of fortnightOrders ?? []) {
    const key = new Date(o.created_at).toISOString().slice(0, 10);
    const bucket = bucketByDate.get(key);
    if (bucket) bucket.revenue += Number(o.total_minor || 0);
  }
  const maxDayRevenue = Math.max(1, ...dayBuckets.map((b) => b.revenue));
  const todayRevenue = dayBuckets[dayBuckets.length - 1]?.revenue || 0;

  // ---- money mini stats ----
  const walletFloatMinor = (wallets ?? []).reduce((s: number, w: any) => s + Number(w.wallet_balance_minor || 0), 0);
  const paidByOrder = new Map<string, number>();
  for (const p of payments ?? []) {
    paidByOrder.set(p.order_id, (paidByOrder.get(p.order_id) || 0) + Number(p.amount_minor || 0));
  }
  const unpaidMinor = (orders ?? []).reduce((s, o) => {
    const paid = paidByOrder.get(o.id) || 0;
    return s + Math.max(0, Number(o.total_minor || 0) - paid);
  }, 0);
  const plansActive = (subs ?? []).filter((s: any) => s.status === "active").length;

  function rangeHref(nextRange: string) {
    return `/dashboard?range=${nextRange}&sort=${sort}`;
  }
  function sortHref(nextSort: string) {
    return `/dashboard?range=${range}&sort=${nextSort}`;
  }

  return (
    <div>
      <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-accent">Overview</div>
      <h1 className="mb-6 font-archivo text-2xl font-extrabold text-ink">Dashboard</h1>

      <div className="mb-6 flex flex-wrap items-center gap-3 border-b-2 border-black/10 pb-3.5">
        <div className="flex border border-black/10">
          {Object.keys(RANGE_DAYS).map((r) => (
            <a
              key={r}
              href={rangeHref(r)}
              className={
                "border-r border-black/10 px-3.5 py-2 font-archivo text-[13px] font-extrabold last:border-r-0 " +
                (r === range ? "bg-ink text-white" : "bg-white text-ink/70 hover:bg-black/5")
              }
            >
              {RANGE_LABELS[r]}
            </a>
          ))}
        </div>
        <span className="text-xs text-ink/50">
          compared with previous {RANGE_LABELS[range].toLowerCase()}
        </span>
      </div>

      {error && (
        <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">
          Could not load orders: {error.message}
        </p>
      )}

      <div className="grid grid-cols-2 gap-0 border-2 border-black/10 bg-white md:grid-cols-5">
        {kpis.map((k, idx) => (
          <div
            key={k.label}
            className={"p-4" + (idx < kpis.length - 1 ? " border-r border-black/10" : "")}
          >
            <div className="text-[10px] font-semibold uppercase tracking-wide text-ink/50">{k.label}</div>
            <div className="mt-2 font-archivo text-[28px] font-extrabold leading-none tracking-tight text-ink">
              {k.value}
            </div>
            <div className={"mt-1 text-[11.5px] " + (k.positive ? "text-accent" : "text-ink/60")}>
              {k.note}
            </div>
          </div>
        ))}
        <div className="bg-accent p-4 text-white">
          <div className="text-[10px] font-semibold uppercase tracking-wide opacity-90">
            At risk / delayed
          </div>
          <div className="mt-2 font-archivo text-[28px] font-extrabold leading-none tracking-tight">
            {atRiskCount}
          </div>
          <div className="mt-1 text-[11.5px] opacity-95">needs attention now</div>
        </div>
      </div>

      <section className="mt-8">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-black/10 pb-2">
          <h2 className="font-archivo text-[15px] font-bold text-ink">
            Service performance · {RANGE_LABELS[range]}
          </h2>
          <div className="flex items-center gap-2">
            <span className="text-[11px] uppercase tracking-wide text-ink/50">Sort by</span>
            <div className="flex border border-black/10">
              {Object.entries(SORT_LABELS).map(([key, label]) => (
                <a
                  key={key}
                  href={sortHref(key)}
                  className={
                    "border-r border-black/10 px-2.5 py-1.5 text-xs last:border-r-0 " +
                    (key === sort ? "bg-ink text-white" : "bg-white text-ink/70 hover:bg-black/5")
                  }
                >
                  {label}
                </a>
              ))}
            </div>
          </div>
        </div>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b-2 border-black/10 text-left text-[11px] uppercase tracking-wide text-ink/50">
                <th className="py-2">Service</th>
                <th className="py-2 text-right">Orders</th>
                <th className="py-2 text-right">Customers</th>
                <th className="py-2 text-right">Garments</th>
                <th className="py-2 text-right">Avg / order</th>
                <th className="py-2 text-right">Revenue</th>
                <th className="w-52 py-2">Share of revenue</th>
                <th className="py-2 text-right">vs prev.</th>
              </tr>
            </thead>
            <tbody>
              {svcRows.map((r) => (
                <tr key={r.id} className="border-b border-black/5">
                  <td className="py-2 font-semibold">{r.name}</td>
                  <td className="py-2 text-right">{r.orders}</td>
                  <td className="py-2 text-right">{r.customers}</td>
                  <td className="py-2 text-right">{r.garments}</td>
                  <td className="py-2 text-right">{formatMinor(r.aov)}</td>
                  <td className="py-2 text-right font-semibold">{formatMinor(r.revenue)}</td>
                  <td className="py-2">
                    <div className="flex items-center gap-2">
                      <div className="h-2.5 min-w-[60px] flex-1 bg-black/10">
                        <div
                          className="h-full bg-ink"
                          style={{ width: `${Math.max(2, (r.revenue / maxSvcRevenue) * 100)}%` }}
                        />
                      </div>
                      <span className="w-11 text-right text-xs font-semibold">{pct(r.share)}</span>
                    </div>
                  </td>
                  <td className={"py-2 text-right text-xs " + (r.hasPrev ? (r.delta >= 0 ? "text-accent" : "text-ink/50") : "text-ink/30")}>
                    {r.hasPrev ? `${r.delta >= 0 ? "▲" : "▼"} ${Math.abs(r.delta).toFixed(0)}%` : "—"}
                  </td>
                </tr>
              ))}
              {svcRows.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-6 text-center text-ink/40">
                    No service activity in this range.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {svcRows.length > 0 && (
          <div className="mt-4 grid grid-cols-1 border border-black/10 sm:grid-cols-2 lg:grid-cols-4">
            <div className="border-b border-black/10 p-3 sm:border-b-0 sm:border-r lg:border-b-0">
              <div className="text-[10px] uppercase tracking-wide text-ink/50">Biggest revenue share</div>
              <div className="mt-1 font-archivo text-base font-extrabold text-ink">{biggestShare?.name}</div>
              <div className="text-xs text-ink/50">{pct(biggestShare?.share || 0)} of revenue</div>
            </div>
            <div className="border-b border-black/10 p-3 sm:border-b-0 sm:border-r lg:border-b-0">
              <div className="text-[10px] uppercase tracking-wide text-ink/50">Most customers</div>
              <div className="mt-1 font-archivo text-base font-extrabold text-ink">{mostCustomers?.name}</div>
              <div className="text-xs text-ink/50">{mostCustomers?.customers} customers used it</div>
            </div>
            <div className="border-b border-black/10 p-3 sm:border-r lg:border-b-0">
              <div className="text-[10px] uppercase tracking-wide text-ink/50">Fastest growing</div>
              <div className="mt-1 font-archivo text-base font-extrabold text-ink">
                {fastestGrowing ? fastestGrowing.name : "—"}
              </div>
              <div className="text-xs text-ink/50">
                {fastestGrowing ? `▲ ${fastestGrowing.delta.toFixed(0)}% vs prev.` : "not enough history yet"}
              </div>
            </div>
            <div className="p-3">
              <div className="text-[10px] uppercase tracking-wide text-ink/50">Declining</div>
              <div className="mt-1 font-archivo text-base font-extrabold text-ink">
                {declining && declining.delta < 0 ? declining.name : "—"}
              </div>
              <div className="text-xs text-ink/50">
                {declining && declining.delta < 0 ? `▼ ${Math.abs(declining.delta).toFixed(0)}% vs prev.` : "nothing declining"}
              </div>
            </div>
          </div>
        )}
      </section>

      <div className="mt-9 grid grid-cols-1 gap-7 lg:grid-cols-2">
        <section>
          <div className="flex items-baseline justify-between gap-3 border-b-2 border-black/10 pb-2">
            <h2 className="font-archivo text-[15px] font-bold text-ink">Where orders come from</h2>
            <span className="text-[11px] uppercase tracking-wide text-ink/50">Channel</span>
          </div>
          <div className="mt-4 flex h-6 border border-black/10">
            {channels.map((c) => (
              <div key={c.key} style={{ width: `${Math.max(c.pct, orderCount ? 1 : 0)}%`, background: c.color }} />
            ))}
            {orderCount === 0 && <div className="w-full bg-black/5" />}
          </div>
          <div className="mt-3.5 flex flex-col gap-2">
            {channels.map((c) => (
              <div key={c.key} className="flex items-center justify-between gap-2.5 text-sm">
                <span className="flex min-w-0 items-center gap-2">
                  <i className="block h-2.5 w-2.5 shrink-0" style={{ background: c.color }} />
                  {c.name}
                </span>
                <span className="whitespace-nowrap font-semibold">
                  {pct(c.pct)} · {formatMinor(c.revenue)}
                </span>
              </div>
            ))}
            {channels.length === 0 && <div className="text-sm text-ink/40">No orders in this range.</div>}
          </div>

          <div className="mt-7 flex items-baseline justify-between gap-3 border-b-2 border-black/10 pb-2">
            <h2 className="font-archivo text-[15px] font-bold text-ink">Customer segments</h2>
            <span className="text-[11px] uppercase tracking-wide text-ink/50">Share of revenue</span>
          </div>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[420px] text-sm">
              <thead>
                <tr className="border-b-2 border-black/10 text-left text-[11px] uppercase tracking-wide text-ink/50">
                  <th className="py-2">Segment</th>
                  <th className="py-2 text-right">Customers</th>
                  <th className="w-32 py-2">Revenue</th>
                  <th className="py-2 text-right">Avg / order</th>
                </tr>
              </thead>
              <tbody>
                {segments.map((g) => (
                  <tr key={g.name} className="border-b border-black/5">
                    <td className="py-2 font-semibold">{g.name}</td>
                    <td className="py-2 text-right">{g.count}</td>
                    <td className="py-2">
                      <div className="flex items-center gap-2">
                        <div className="h-2.5 min-w-[40px] flex-1 bg-black/10">
                          <div className="h-full bg-ink" style={{ width: `${Math.max(2, g.pct)}%` }} />
                        </div>
                        <span className="text-xs font-semibold">{pct(g.pct)}</span>
                      </div>
                    </td>
                    <td className="py-2 text-right">{formatMinor(g.aov)}</td>
                  </tr>
                ))}
                {segments.length === 0 && (
                  <tr>
                    <td colSpan={4} className="py-4 text-center text-ink/40">
                      No customer activity in this range.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section>
          <div className="flex items-baseline justify-between gap-3 border-b-2 border-black/10 pb-2">
            <h2 className="font-archivo text-[15px] font-bold text-ink">Top items by revenue</h2>
            <span className="text-[11px] uppercase tracking-wide text-ink/50">{RANGE_LABELS[range]}</span>
          </div>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[440px] text-sm">
              <thead>
                <tr className="border-b-2 border-black/10 text-left text-[11px] uppercase tracking-wide text-ink/50">
                  <th className="py-2">Item</th>
                  <th className="py-2">Service</th>
                  <th className="py-2 text-right">Qty</th>
                  <th className="w-28 py-2">Revenue</th>
                </tr>
              </thead>
              <tbody>
                {topItems.map((it) => (
                  <tr key={it.id} className="border-b border-black/5">
                    <td className="py-2 font-semibold">{it.name}</td>
                    <td className="py-2 text-ink/50">{it.service}</td>
                    <td className="py-2 text-right">{it.quantity}</td>
                    <td className="py-2">
                      <div className="flex items-center gap-2">
                        <div className="h-2.5 min-w-[34px] flex-1 bg-black/10">
                          <div
                            className="h-full bg-ink"
                            style={{ width: `${Math.max(2, (it.revenue / maxItemRevenue) * 100)}%` }}
                          />
                        </div>
                        <span className="whitespace-nowrap text-xs font-semibold">{formatMinor(it.revenue)}</span>
                      </div>
                    </td>
                  </tr>
                ))}
                {topItems.length === 0 && (
                  <tr>
                    <td colSpan={4} className="py-4 text-center text-ink/40">
                      No item sales in this range.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-6 border-2 border-black/10">
            <div className="border-b-2 border-black/10 px-3.5 py-2.5 font-archivo text-[13.5px] font-extrabold">
              Read of the period
            </div>
            <div className="flex flex-col gap-2.5 px-3.5 py-3 text-sm">
              {svcRows.length === 0 ? (
                <div className="text-ink/40">Not enough orders yet in this range to summarize.</div>
              ) : (
                <>
                  {biggestShare && (
                    <div>
                      {biggestShare.name} carries {pct(biggestShare.share)} of revenue from{" "}
                      {biggestShare.customers} customer{biggestShare.customers === 1 ? "" : "s"} —{" "}
                      {biggestShare.customers <= 3
                        ? "a small base worth watching for concentration risk."
                        : "a healthy, diversified base."}
                    </div>
                  )}
                  {fastestGrowing && (
                    <div>
                      {fastestGrowing.name} is up {fastestGrowing.delta.toFixed(0)}% on the previous period.
                    </div>
                  )}
                  {declining && declining.delta < 0 && (
                    <div>
                      {declining.name} is down {Math.abs(declining.delta).toFixed(0)}% — worth a closer look.
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </section>
      </div>

      <div className="mt-8 grid grid-cols-1 gap-7 lg:grid-cols-3">
        <section>
          <div className="flex items-baseline justify-between gap-3 border-b-2 border-black/10 pb-2">
            <h2 className="font-archivo text-[15px] font-bold text-ink">Orders needing attention</h2>
            <a href="/orders" className="text-[11px] uppercase tracking-wide text-ink/50 hover:text-accent">
              All orders →
            </a>
          </div>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[380px] text-sm">
              <thead>
                <tr className="border-b-2 border-black/10 text-left text-[11px] uppercase tracking-wide text-ink/50">
                  <th className="py-2">Order</th>
                  <th className="py-2">Customer</th>
                  <th className="py-2">Stage</th>
                  <th className="py-2">Open</th>
                </tr>
              </thead>
              <tbody>
                {(liveOrders ?? []).map((o: any) => (
                  <tr key={o.id} className="border-b border-black/5">
                    <td className="py-2 font-semibold">{o.order_number}</td>
                    <td className="py-2">{o.customer?.full_name || "-"}</td>
                    <td className="py-2">
                      <span className="bg-black/5 px-2 py-0.5 text-xs">{stageLabels[o.status] || o.status}</span>
                    </td>
                    <td className="py-2 text-ink/60">{timeAgo(o.created_at)}</td>
                  </tr>
                ))}
                {(liveOrders ?? []).length === 0 && (
                  <tr>
                    <td colSpan={4} className="py-4 text-center text-ink/40">
                      Nothing in the pipeline right now.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section>
          <div className="flex items-baseline justify-between gap-3 border-b-2 border-black/10 pb-2">
            <h2 className="font-archivo text-[15px] font-bold text-ink">Load through the plant</h2>
            <span className="text-[11px] uppercase tracking-wide text-ink/50">Garments · live</span>
          </div>
          <div className="flex flex-col gap-3 pt-3.5">
            {loadRows.map((r) => (
              <div key={r.name}>
                <div className="mb-1 flex justify-between text-[12.5px]">
                  <span>
                    {r.name}
                    {bottleneck && r.name === bottleneck.name && loadRows.length > 1 && (
                      <span className="text-accent"> · bottleneck</span>
                    )}
                  </span>
                  <span className="font-semibold">{r.count}</span>
                </div>
                <div className="h-3 bg-black/10">
                  <div
                    className={"h-full " + (bottleneck && r.name === bottleneck.name && loadRows.length > 1 ? "bg-accent" : "bg-ink")}
                    style={{ width: `${Math.max(4, (r.count / maxLoad) * 100)}%` }}
                  />
                </div>
              </div>
            ))}
            {loadRows.length === 0 && <div className="text-sm text-ink/40">No jobs in production right now.</div>}
          </div>
        </section>

        <section>
          <div className="flex items-baseline justify-between gap-3 border-b-2 border-black/10 pb-2">
            <h2 className="font-archivo text-[15px] font-bold text-ink">Revenue · last 14 days</h2>
            <span className="text-[11px] uppercase tracking-wide text-ink/50">₹</span>
          </div>
          <div className="flex h-[150px] items-end gap-1.5 pt-4">
            {dayBuckets.map((b, idx) => (
              <div
                key={b.date}
                className={"flex-1 " + (idx === dayBuckets.length - 1 ? "bg-accent" : "bg-black/15")}
                style={{ height: `${Math.max(2, (b.revenue / maxDayRevenue) * 100)}%` }}
                title={`${b.date}: ${formatMinor(b.revenue)}`}
              />
            ))}
          </div>
          <div className="mt-1.5 flex justify-between border-t-2 border-black/10 pt-1.5 text-[10.5px] text-ink/50">
            <span>{dayBuckets[0]?.date}</span>
            <span>Today {formatMinor(todayRevenue)}</span>
          </div>
          <div className="mt-4 flex border border-black/10">
            <div className="flex-1 border-r border-black/10 p-2.5">
              <div className="text-[10px] uppercase tracking-wide text-ink/50">Wallet float</div>
              <div className="font-archivo text-[19px] font-extrabold">{formatMinor(walletFloatMinor)}</div>
            </div>
            <div className="flex-1 border-r border-black/10 p-2.5">
              <div className="text-[10px] uppercase tracking-wide text-ink/50">Unpaid</div>
              <div className="font-archivo text-[19px] font-extrabold">{formatMinor(unpaidMinor)}</div>
            </div>
            <div className="flex-1 p-2.5">
              <div className="text-[10px] uppercase tracking-wide text-ink/50">Plans active</div>
              <div className="font-archivo text-[19px] font-extrabold">{plansActive}</div>
            </div>
          </div>
        </section>
      </div>

      {orderCount === 0 && !error && (
        <p className="mt-8 text-sm text-ink/50">
          No orders in this range yet — once staff start taking orders through the POS, real numbers will
          show up here automatically.
        </p>
      )}
    </div>
  );
}
