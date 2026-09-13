import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { updateOrderStatus, recordPayment } from "./actions";

const STATUS_STYLES: Record<string, string> = {
  draft: "bg-black/5 text-ink/60",
  confirmed: "bg-info/10 text-info",
  in_production: "bg-warn/10 text-warn",
  ready: "bg-ok/10 text-ok",
  out_for_delivery: "bg-info/10 text-info",
  delivered: "bg-ok/10 text-ok",
  cancelled: "bg-danger/10 text-danger",
};

const STATUS_OPTIONS = [
  "draft",
  "confirmed",
  "in_production",
  "ready",
  "out_for_delivery",
  "delivered",
  "cancelled",
];

const PAYMENT_METHODS = ["cash", "card", "upi", "bank_transfer", "wallet"];

const PAYMENT_STATUS_STYLES: Record<string, string> = {
  captured: "bg-ok/10 text-ok",
  failed: "bg-danger/10 text-danger",
  refunded: "bg-black/5 text-ink/60",
  partially_refunded: "bg-warn/10 text-warn",
};

function formatMinor(minor: number) {
  return `₹${(minor / 100).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

function formatStatus(status: string) {
  return status.replace(/_/g, " ");
}

export default async function OrderDetailPage({ params }: { params: { id: string } }) {
  const supabase = createClient();

  const { data: order } = await supabase
    .from("order")
    .select(
      "id, order_number, status, channel, subtotal_minor, discount_minor, tax_minor, total_minor, currency, created_at, customer:customer_id(id, full_name, phone, email), price_list_profile:price_list_profile_id(name)"
    )
    .eq("id", params.id)
    .single();

  if (!order) {
    notFound();
  }

  const { data: items } = await supabase
    .from("order_item")
    .select(
      "id, quantity, unit_price_minor, line_total_minor, notes, service:service_id(name), item:item_id(name)"
    )
    .eq("order_id", params.id)
    .order("created_at", { ascending: true });

  const { data: payments } = await supabase
    .from("payment")
    .select("id, method, amount_minor, status, created_at")
    .eq("order_id", params.id)
    .order("created_at", { ascending: true });

  const customer: any = Array.isArray(order.customer) ? order.customer[0] : order.customer;
  const priceListProfile: any = Array.isArray(order.price_list_profile)
    ? order.price_list_profile[0]
    : order.price_list_profile;

  const paidMinor = (payments ?? [])
    .filter((p: any) => p.status !== "failed" && p.status !== "refunded")
    .reduce((sum: number, p: any) => sum + Number(p.amount_minor), 0);
  const balanceMinor = Number(order.total_minor) - paidMinor;

  async function updateStatus(formData: FormData) {
    "use server";
    const status = String(formData.get("status") || "");
    if (!status) return;
    await updateOrderStatus(params.id, status);
  }

  async function addPayment(formData: FormData) {
    "use server";
    const method = String(formData.get("method") || "");
    const amount = Number(formData.get("amount") || 0);
    if (!method || !amount) return;
    await recordPayment(params.id, method, amount);
  }

  return (
    <div>
      <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-accent">
        <Link href="/orders" className="hover:underline">
          Orders
        </Link>{" "}
        / {order.order_number}
      </div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-archivo text-2xl font-extrabold text-ink">{order.order_number}</h1>
        <span
          className={`inline-flex px-3 py-1.5 text-xs font-semibold uppercase tracking-wide capitalize ${
            STATUS_STYLES[order.status as string] ?? "bg-black/5 text-ink/60"
          }`}
        >
          {formatStatus(order.status as string)}
        </span>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          <div className="overflow-hidden border-2 border-black/10 bg-white">
            <div className="border-b-2 border-black/10 px-4 py-3 font-archivo text-[13.5px] font-bold text-ink">Items</div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b-2 border-black/10 text-left text-[11px] uppercase tracking-wide text-ink/50">
                  <th className="px-4 py-2">Service</th>
                  <th className="px-4 py-2">Item</th>
                  <th className="px-4 py-2">Qty</th>
                  <th className="px-4 py-2 text-right">Unit price</th>
                  <th className="px-4 py-2 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {(items ?? []).map((it: any) => {
                  const service = Array.isArray(it.service) ? it.service[0] : it.service;
                  const item = Array.isArray(it.item) ? it.item[0] : it.item;
                  return (
                    <tr key={it.id} className="border-b border-black/5 last:border-0">
                      <td className="px-4 py-2.5 font-medium text-ink">{service?.name ?? "-"}</td>
                      <td className="px-4 py-2.5 text-ink/60">{item?.name ?? "Any item"}</td>
                      <td className="px-4 py-2.5 text-ink/60">{it.quantity}</td>
                      <td className="px-4 py-2.5 text-right text-ink/60">
                        {formatMinor(Number(it.unit_price_minor))}
                      </td>
                      <td className="px-4 py-2.5 text-right font-medium text-ink">
                        {formatMinor(Number(it.line_total_minor))}
                      </td>
                    </tr>
                  );
                })}
                {(items ?? []).length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-sm text-ink/40">
                      No items on this order.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="border-2 border-black/10 bg-white p-4">
            <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink/50">Totals</div>
            <div className="space-y-1.5 text-sm">
              <div className="flex items-center justify-between text-ink/60">
                <span>Subtotal</span>
                <span>{formatMinor(Number(order.subtotal_minor))}</span>
              </div>
              <div className="flex items-center justify-between text-ink/60">
                <span>Discount</span>
                <span>-{formatMinor(Number(order.discount_minor))}</span>
              </div>
              <div className="flex items-center justify-between text-ink/60">
                <span>Tax</span>
                <span>{formatMinor(Number(order.tax_minor))}</span>
              </div>
              <div className="flex items-center justify-between border-t border-black/5 pt-2 text-base font-bold text-ink">
                <span>Total</span>
                <span>{formatMinor(Number(order.total_minor))}</span>
              </div>
            </div>
          </div>

          <div className="overflow-hidden border-2 border-black/10 bg-white">
            <div className="flex items-center justify-between border-b-2 border-black/10 px-4 py-3">
              <span className="font-archivo text-[13.5px] font-bold text-ink">Payments</span>
              <span
                className={`inline-flex px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ${
                  balanceMinor > 0 ? "bg-warn/10 text-warn" : "bg-ok/10 text-ok"
                }`}
              >
                {balanceMinor > 0 ? `${formatMinor(balanceMinor)} due` : "Fully paid"}
              </span>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b-2 border-black/10 text-left text-[11px] uppercase tracking-wide text-ink/50">
                  <th className="px-4 py-2">Method</th>
                  <th className="px-4 py-2">Status</th>
                  <th className="px-4 py-2">Date</th>
                  <th className="px-4 py-2 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {(payments ?? []).map((p: any) => (
                  <tr key={p.id} className="border-b border-black/5 last:border-0">
                    <td className="px-4 py-2.5 font-medium capitalize text-ink">
                      {String(p.method).replace(/_/g, " ")}
                    </td>
                    <td className="px-4 py-2.5">
                      <span
                        className={`inline-flex px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide capitalize ${
                          PAYMENT_STATUS_STYLES[p.status as string] ?? "bg-black/5 text-ink/60"
                        }`}
                      >
                        {formatStatus(p.status as string)}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-ink/60">
                      {new Date(p.created_at as string).toLocaleDateString("en-IN", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      })}
                    </td>
                    <td className="px-4 py-2.5 text-right font-medium text-ink">
                      {formatMinor(Number(p.amount_minor))}
                    </td>
                  </tr>
                ))}
                {(payments ?? []).length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-6 text-center text-sm text-ink/40">
                      No payments recorded yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            <form action={addPayment} className="flex flex-wrap items-end gap-3 border-t border-black/5 px-4 py-3">
              <div>
                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-ink/50">
                  Method
                </label>
                <select
                  name="method"
                  defaultValue="cash"
                  className="border border-black/10 px-3 py-2 text-sm capitalize outline-none focus:border-accent"
                >
                  {PAYMENT_METHODS.map((m) => (
                    <option key={m} value={m} className="capitalize">
                      {m.replace(/_/g, " ")}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-ink/50">
                  Amount (₹)
                </label>
                <input
                  type="number"
                  name="amount"
                  min="1"
                  step="1"
                  defaultValue={balanceMinor > 0 ? Math.round(balanceMinor / 100) : undefined}
                  className="w-28 border border-black/10 px-3 py-2 text-sm outline-none focus:border-accent"
                />
              </div>
              <button
                type="submit"
                className="rounded-md bg-accent px-3 py-2 text-sm font-semibold text-white hover:brightness-110"
              >
                Record payment
              </button>
            </form>
          </div>
        </div>

        <div className="space-y-4">
          <div className="border-2 border-black/10 bg-white p-4">
            <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink/50">Customer</div>
            {customer ? (
              <>
                <Link
                  href={`/customers/${customer.id}`}
                  className="font-semibold text-ink hover:text-accent"
                >
                  {customer.full_name}
                </Link>
                <div className="mt-1 text-sm text-ink/60">{customer.phone}</div>
                {customer.email && <div className="text-sm text-ink/60">{customer.email}</div>}
              </>
            ) : (
              <p className="text-sm text-ink/40">No customer linked.</p>
            )}
          </div>

          <div className="border-2 border-black/10 bg-white p-4">
            <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink/50">Order info</div>
            <dl className="space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <dt className="text-ink/50">Channel</dt>
                <dd className="capitalize text-ink">{String(order.channel).replace(/_/g, " ")}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-ink/50">Price list</dt>
                <dd className="text-ink">{priceListProfile?.name ?? "-"}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-ink/50">Placed</dt>
                <dd className="text-ink">
                  {new Date(order.created_at as string).toLocaleDateString("en-IN", {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                  })}
                </dd>
              </div>
            </dl>
          </div>

          <form action={updateStatus} className="border-2 border-black/10 bg-white p-4">
            <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink/50">
              Update status
            </div>
            <select
              name="status"
              defaultValue={order.status as string}
              className="mb-3 w-full border border-black/10 px-3 py-2 text-sm capitalize outline-none focus:border-accent"
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s} className="capitalize">
                  {formatStatus(s)}
                </option>
              ))}
            </select>
            <button
              type="submit"
              className="w-full rounded-md bg-accent px-3 py-2 text-sm font-semibold text-white hover:brightness-110"
            >
              Save status
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
