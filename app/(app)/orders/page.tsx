import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { PrintPreviewButton } from "@/lib/print/PrintPreviewButton";

const STATUS_STYLES: Record<string, string> = {
  draft: "bg-black/5 text-ink/60",
  confirmed: "bg-info/10 text-info",
  in_production: "bg-warn/10 text-warn",
  ready: "bg-ok/10 text-ok",
  out_for_delivery: "bg-info/10 text-info",
  delivered: "bg-ok/10 text-ok",
  cancelled: "bg-danger/10 text-danger",
};

function formatMinor(minor: number) {
  return `₹${(minor / 100).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

function formatStatus(status: string) {
  return status.replace(/_/g, " ");
}

export default async function OrdersPage() {
  const supabase = createClient();

  const { data: orders, error } = await supabase
    .from("order")
    .select("id, order_number, status, total_minor, channel, created_at, customer:customer_id(full_name, phone)")
    .order("created_at", { ascending: false })
    .limit(50);

  return (
    <div>
      <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-accent">Sales</div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="font-archivo text-2xl font-extrabold text-ink">Orders</h1>
        <Link
          href="/orders/new"
          className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:brightness-110"
        >
          + New order
        </Link>
      </div>

      {error && (
        <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">
          Could not load orders: {error.message}
        </p>
      )}

      <div className="overflow-hidden border-2 border-black/10 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b-2 border-black/10 text-left text-[11px] uppercase tracking-wide text-ink/50">
              <th className="px-4 py-3">Order</th>
              <th className="px-4 py-3">Customer</th>
              <th className="px-4 py-3">Channel</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Total</th>
              <th className="px-4 py-3">Placed</th>
              <th className="px-4 py-3">Print</th>
            </tr>
          </thead>
          <tbody>
            {(orders ?? []).map((o) => {
              const customer = Array.isArray(o.customer) ? o.customer[0] : o.customer;
              return (
                <tr key={o.id} className="border-b border-black/5 last:border-0 hover:bg-black/[0.015]">
                  <td className="px-4 py-3 font-medium text-ink">
                    <Link href={`/orders/${o.id}`} className="hover:text-accent">
                      {o.order_number}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-ink/70">{customer?.full_name ?? "-"}</td>
                  <td className="px-4 py-3 capitalize text-ink/70">{String(o.channel).replace(/_/g, " ")}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide capitalize ${
                        STATUS_STYLES[o.status as string] ?? "bg-black/5 text-ink/60"
                      }`}
                    >
                      {formatStatus(o.status as string)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-ink">{formatMinor(Number(o.total_minor))}</td>
                  <td className="px-4 py-3 text-ink/50">
                    {new Date(o.created_at as string).toLocaleDateString("en-IN", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                    })}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 whitespace-nowrap text-xs font-semibold">
                      <PrintPreviewButton
                        label="Invoice"
                        url={`/orders/${o.id}/print/invoice`}
                        className="text-accent hover:underline"
                      />
                      <span className="text-ink/20">|</span>
                      <PrintPreviewButton
                        label="Tags"
                        url={`/orders/${o.id}/print/tags`}
                        className="text-accent hover:underline"
                      />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {(orders ?? []).length === 0 && !error && (
          <p className="px-4 py-10 text-center text-sm text-ink/50">
            No orders yet. Once staff create orders through the POS, they will show up here.
          </p>
        )}
      </div>
    </div>
  );
}
