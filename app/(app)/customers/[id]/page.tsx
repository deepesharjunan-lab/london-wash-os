import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { notFound } from "next/navigation";

function formatMinor(minor: number) {
  return `₹${(minor / 100).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

const TIER_STYLES: Record<string, string> = {
  Silver: "bg-black/5 text-ink/60",
  Gold: "bg-warn/10 text-warn",
  Platinum: "bg-info/10 text-info",
};

const STATUS_STYLES: Record<string, string> = {
  placed: "bg-info/10 text-info",
  in_progress: "bg-warn/10 text-warn",
  ready: "bg-ok/10 text-ok",
  delivered: "bg-ok/10 text-ok",
  cancelled: "bg-red-50 text-red-600",
};

export default async function CustomerDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = createClient();

  const { data: customer, error } = await supabase
    .from("customer")
    .select(
      "id, full_name, phone, email, tier, wallet_balance_minor, lifetime_spend_minor, is_active, fold_preference, detergent_preference, created_at"
    )
    .eq("id", params.id)
    .single();

  if (error && error.code === "PGRST116") {
    notFound();
  }

  if (!customer) {
    return (
      <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">
        Could not load customer{error ? `: ${error.message}` : "."}
      </p>
    );
  }

  const { data: orders } = await supabase
    .from("order")
    .select("id, order_number, status, total_minor, created_at")
    .eq("customer_id", params.id)
    .order("created_at", { ascending: false })
    .limit(20);

  return (
    <div>
      <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-accent">Customers</div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-archivo text-2xl font-extrabold text-ink">{customer.full_name}</h1>
          <p className="mt-1 text-sm text-ink/50">{customer.phone}{customer.email ? ` · ${customer.email}` : ""}</p>
        </div>
        <Link href="/customers" className="text-sm font-medium text-ink/60 hover:text-accent">
          &larr; Back to customers
        </Link>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-lg border border-black/5 bg-white p-4 shadow-sm">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-ink/40">Tier</div>
          <span
            className={`mt-2 inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${
              TIER_STYLES[customer.tier as string] ?? "bg-black/5 text-ink/60"
            }`}
          >
            {customer.tier}
          </span>
        </div>
        <div className="rounded-lg border border-black/5 bg-white p-4 shadow-sm">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-ink/40">Wallet balance</div>
          <div className="mt-1 text-lg font-bold text-ink">{formatMinor(Number(customer.wallet_balance_minor))}</div>
        </div>
        <div className="rounded-lg border border-black/5 bg-white p-4 shadow-sm">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-ink/40">Lifetime spend</div>
          <div className="mt-1 text-lg font-bold text-ink">{formatMinor(Number(customer.lifetime_spend_minor))}</div>
        </div>
        <div className="rounded-lg border border-black/5 bg-white p-4 shadow-sm">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-ink/40">Status</div>
          <span
            className={`mt-2 inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${
              customer.is_active ? "bg-ok/10 text-ok" : "bg-black/5 text-ink/40"
            }`}
          >
            {customer.is_active ? "Active" : "Inactive"}
          </span>
        </div>
      </div>

      {(customer.fold_preference || customer.detergent_preference) && (
        <div className="mb-6 rounded-lg border border-black/5 bg-white p-4 shadow-sm">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-ink/40">Care preferences</div>
          <div className="flex flex-wrap gap-4 text-sm text-ink/70">
            {customer.fold_preference && <span>Fold: {customer.fold_preference}</span>}
            {customer.detergent_preference && <span>Detergent: {customer.detergent_preference}</span>}
          </div>
        </div>
      )}

      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-archivo text-lg font-bold text-ink">Orders</h2>
        <Link
          href={`/orders/new?customer=${customer.id}`}
          className="rounded-md bg-accent px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:brightness-110"
        >
          + New order
        </Link>
      </div>

      <div className="overflow-hidden rounded-lg border border-black/5 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-black/5 bg-black/[0.02] text-left text-[11px] font-semibold uppercase tracking-wide text-ink/50">
              <th className="px-4 py-3">Order</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Total</th>
              <th className="px-4 py-3">Placed</th>
            </tr>
          </thead>
          <tbody>
            {(orders ?? []).map((o) => (
              <tr key={o.id} className="border-b border-black/5 last:border-0 hover:bg-black/[0.015]">
                <td className="px-4 py-3 font-medium text-ink">
                  <Link href={`/orders/${o.id}`} className="hover:text-accent">
                    {o.order_number}
                  </Link>
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                      STATUS_STYLES[o.status as string] ?? "bg-black/5 text-ink/60"
                    }`}
                  >
                    {o.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-right text-ink">{formatMinor(Number(o.total_minor))}</td>
                <td className="px-4 py-3 text-ink/70">
                  {new Date(o.created_at as string).toLocaleDateString("en-IN")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {(orders ?? []).length === 0 && (
          <p className="px-4 py-10 text-center text-sm text-ink/50">
            No orders yet for this customer.
          </p>
        )}
      </div>
    </div>
  );
}
