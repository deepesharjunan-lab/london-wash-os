import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PrintPreviewButton } from "@/lib/print/PrintPreviewButton";
import { istDate, istDayStart } from "@/lib/time";
import { handOverAtCounter } from "../actions";

export const dynamic = "force-dynamic";

const rupees = (minor: number) => `₹${(minor / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const one = (x: any) => (Array.isArray(x) ? x[0] : x);
const when = (iso: string) => new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });
const STATUS: Record<string, [string, string]> = {
  draft: ["New", "bg-[#efe6d3] text-[#6f5c36]"],
  confirmed: ["Received", "bg-[#e2e9f2] text-[#2b5584]"],
  in_production: ["In production", "bg-[#f5ebd9] text-[#8a5a12]"],
  ready: ["Ready", "bg-[#e2eee7] text-[#2c6a4e]"],
  out_for_delivery: ["Out for delivery", "bg-[#e2e9f2] text-[#2b5584]"],
  delivered: ["Delivered", "bg-black/5 text-ink-2"],
  cancelled: ["Cancelled", "bg-[#f6e4df] text-[#9c3326]"],
};
const ORDER_COLS = "id, order_number, status, total_minor, created_at, customer:customer_id(full_name, phone), items:order_item(quantity), payments:payment(amount_minor, status)";
const paidOf = (o: any) => ((o.payments ?? []) as any[]).filter((p) => p.status !== "failed" && p.status !== "refunded").reduce((a, p) => a + Number(p.amount_minor), 0);

export default async function PosOrdersPage({ searchParams }: { searchParams: { view?: string; q?: string; done?: string; error?: string } }) {
  const supabase = createClient();
  const view = ["today", "ready", "pickups", "all"].includes(searchParams.view ?? "") ? searchParams.view! : "today";
  const q = String(searchParams.q ?? "").trim().slice(0, 40);

  let orders: any[] = [];
  let pickups: any[] = [];
  if (view === "pickups") {
    const { data } = await supabase
      .from("pickup")
      .select("id, status, scheduled_window_start, services, notes, source, customer:customer_id(id, full_name, phone), address:customer_address_id(address_line), driver:driver_id(full_name)")
      .in("status", ["scheduled", "en_route"])
      .order("scheduled_window_start", { ascending: true })
      .limit(100);
    pickups = (data ?? []) as any[];
  } else {
    let query = supabase.from("order").select(ORDER_COLS).limit(150);
    if (view === "ready") query = query.eq("status", "ready").order("created_at", { ascending: true });
    else if (view === "today") query = query.gte("created_at", istDayStart(istDate())).order("created_at", { ascending: false });
    else {
      // Search: order number, garment tag, or customer phone/name.
      const digits = q.replace(/\D/g, "");
      let ids: string[] | null = null;
      if (digits && digits.length <= 8 && digits === q) {
        const { data: g } = await supabase.from("garment").select("order_item:order_item_id(order_id)").eq("tag_code", digits.replace(/^0+(?=\d)/, "")).maybeSingle();
        const oid = one((g as any)?.order_item)?.order_id;
        if (oid) ids = [oid];
      }
      if (!ids && q) {
        const safe = q.replace(/[%,()]/g, "");
        const { data: cs } = await supabase
          .from("customer")
          .select("id")
          .or(digits.length >= 4 ? `phone.ilike.%${digits.slice(-10)}%` : `full_name.ilike.%${safe}%`)
          .limit(20);
        const cids = ((cs ?? []) as { id: string }[]).map((c) => c.id);
        query = cids.length ? query.or(`order_number.ilike.%${safe}%,customer_id.in.(${cids.join(",")})`) : query.ilike("order_number", `%${safe}%`);
      } else if (ids) query = query.in("id", ids);
      query = query.order("created_at", { ascending: false });
    }
    const { data } = await query;
    orders = (data ?? []) as any[];
  }

  const title = { today: "Today's orders", ready: "Ready to collect", pickups: "Pickup requests", all: q ? `Results for “${q}”` : "Search" }[view];

  return (
    <div className="h-full overflow-y-auto p-5">
      <div className="mx-auto max-w-[1100px]">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <h1 className="text-[22px] font-semibold">{title}</h1>
          <form className="flex gap-2" role="search">
            <input type="hidden" name="view" value="all" />
            <input name="q" defaultValue={q} placeholder="Order no., tag or phone" aria-label="Search orders" className="h-10 w-60 rounded-xl border border-hair bg-white px-3 text-[14px] outline-none focus:border-brass" />
            <button type="submit" className="h-10 rounded-xl bg-navy px-4 text-[13.5px] font-semibold text-white">
              Find
            </button>
          </form>
        </div>
        {searchParams.done && <div className="mb-4 rounded-xl bg-[#e2eee7] px-4 py-3 text-[14px] text-[#2c6a4e]">{searchParams.done}</div>}
        {searchParams.error && <div className="mb-4 rounded-xl bg-[#f6e4df] px-4 py-3 text-[14px] text-[#9c3326]">{searchParams.error}</div>}

        {view === "pickups" ? (
          pickups.length ? (
            <div className="grid gap-3 md:grid-cols-2">
              {pickups.map((p) => {
                const c = one(p.customer);
                const d = one(p.driver);
                return (
                  <div key={p.id} className="rounded-2xl border border-hair bg-white p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <b className="text-[15px]">{c?.full_name ?? "Customer"}</b>
                        <div className="text-[12.5px] text-ink-2">{c?.phone}</div>
                      </div>
                      <span className={"rounded-full px-2.5 py-0.5 text-[11.5px] font-semibold " + (d ? "bg-[#e2e9f2] text-[#2b5584]" : "bg-[#f5ebd9] text-[#8a5a12]")}>
                        {d ? (p.status === "en_route" ? `${d.full_name} on the way` : d.full_name) : "Needs a driver"}
                      </span>
                    </div>
                    <div className="mt-2 text-[13px] text-ink-2">
                      {p.scheduled_window_start ? when(p.scheduled_window_start) : "No time set"} · {one(p.address)?.address_line ?? "No address"}
                    </div>
                    {(p.services ?? []).length > 0 && <div className="mt-1 text-[12.5px] text-ink-3">{(p.services as string[]).join(", ")}</div>}
                    {p.notes && <div className="mt-1 text-[12.5px] text-[#8a5a12]">{p.notes}</div>}
                    <div className="mt-3 flex gap-2">
                      {!d && (
                        <Link href="/delivery" className="rounded-lg bg-navy px-3 py-1.5 text-[12.5px] font-semibold text-white">
                          Assign driver
                        </Link>
                      )}
                      {c?.id && (
                        <Link href={`/pos?customer=${c.id}`} className="rounded-lg border border-hair px-3 py-1.5 text-[12.5px] font-semibold">
                          Create order
                        </Link>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <Empty text="No pickup requests waiting." />
          )
        ) : orders.length ? (
          <div className="overflow-hidden rounded-2xl border border-hair bg-white">
            <table className="w-full text-[13.5px]">
              <thead>
                <tr className="border-b border-hair text-left text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-3">
                  <th className="px-4 py-2.5">Order</th>
                  <th className="px-4 py-2.5">Customer</th>
                  <th className="px-4 py-2.5">Items</th>
                  <th className="px-4 py-2.5 text-right">Total</th>
                  <th className="px-4 py-2.5 text-right">Due</th>
                  <th className="px-4 py-2.5">Status</th>
                  <th className="px-4 py-2.5"></th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => {
                  const c = one(o.customer);
                  const pcs = ((o.items ?? []) as any[]).reduce((a, i) => a + Number(i.quantity || 0), 0);
                  const due = Math.max(0, Number(o.total_minor) - paidOf(o));
                  const [label, cls] = STATUS[o.status] ?? [o.status, "bg-black/5"];
                  return (
                    <tr key={o.id} className="border-b border-hair align-top last:border-0">
                      <td className="px-4 py-3">
                        <b>{o.order_number}</b>
                        <div className="text-[12px] text-ink-3">{when(o.created_at)}</div>
                      </td>
                      <td className="px-4 py-3">
                        {c?.full_name ?? "—"}
                        <div className="text-[12px] text-ink-3">{c?.phone}</div>
                      </td>
                      <td className="px-4 py-3 tabular-nums">{pcs}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{rupees(Number(o.total_minor))}</td>
                      <td className={"px-4 py-3 text-right tabular-nums " + (due ? "font-semibold text-[#8a5a12]" : "text-[#2c6a4e]")}>{due ? rupees(due) : "Paid"}</td>
                      <td className="px-4 py-3">
                        <span className={"rounded-full px-2.5 py-0.5 text-[11.5px] font-semibold " + cls}>{label}</span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap justify-end gap-1.5">
                          {o.status === "ready" ? (
                            <form action={handOverAtCounter} className="flex items-center gap-1.5">
                              <input type="hidden" name="order_id" value={o.id} />
                              {due > 0 && (
                                <>
                                  <select name="method" defaultValue="cash" aria-label="Payment method" className="h-8 rounded-lg border border-hair px-1.5 text-[12.5px]">
                                    <option value="cash">Cash</option>
                                    <option value="upi">UPI</option>
                                    <option value="card">Card</option>
                                  </select>
                                  <input name="amount" defaultValue={due / 100} inputMode="decimal" aria-label="Amount received" className="h-8 w-20 rounded-lg border border-hair px-2 text-right text-[12.5px]" />
                                </>
                              )}
                              <button type="submit" className="h-8 rounded-lg bg-[#2c6a4e] px-3 text-[12.5px] font-semibold text-white">
                                {due > 0 ? "Collect & hand over" : "Hand over"}
                              </button>
                            </form>
                          ) : (
                            <>
                              <PrintPreviewButton label="Tags" url={`/orders/${o.id}/print/tags`} className="h-8 rounded-lg border border-hair px-2.5 text-[12.5px] font-semibold" />
                              <PrintPreviewButton label="Invoice" url={`/orders/${o.id}/print/invoice`} className="h-8 rounded-lg border border-hair px-2.5 text-[12.5px] font-semibold" />
                            </>
                          )}
                          <Link href={`/orders/${o.id}`} className="grid h-8 place-items-center rounded-lg px-2 text-[12.5px] font-semibold text-accent hover:underline">
                            Open
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty text={view === "ready" ? "No orders waiting for collection." : view === "today" ? "No orders yet today." : "No orders match."} />
        )}
      </div>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="grid h-40 place-items-center rounded-2xl border border-dashed border-hair-2 bg-white text-[14px] text-ink-3">{text}</div>;
}
