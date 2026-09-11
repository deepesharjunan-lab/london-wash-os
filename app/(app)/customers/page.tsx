import { createClient } from "@/lib/supabase/server";
import Link from "next/link";

function formatMinor(minor: number) {
  return `₹${(minor / 100).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

const TIER_STYLES: Record<string, string> = {
  Silver: "bg-black/5 text-ink/60",
  Gold: "bg-warn/10 text-warn",
  Platinum: "bg-info/10 text-info",
};

export default async function CustomersPage() {
  const supabase = createClient();

  const { data: customers, error } = await supabase
    .from("customer")
    .select("id, full_name, phone, tier, wallet_balance_minor, lifetime_spend_minor, is_active")
    .order("created_at", { ascending: false })
    .limit(50);

  return (
    <div>
      <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-accent">Customers</div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="font-archivo text-2xl font-extrabold text-ink">Customers</h1>
        <Link
          href="/customers/new"
          className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:brightness-110"
        >
          + New customer
        </Link>
      </div>

      {error && (
        <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">
          Could not load customers: {error.message}
        </p>
      )}

      <div className="overflow-hidden rounded-lg border border-black/5 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-black/5 bg-black/[0.02] text-left text-[11px] font-semibold uppercase tracking-wide text-ink/50">
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Phone</th>
              <th className="px-4 py-3">Tier</th>
              <th className="px-4 py-3 text-right">Wallet</th>
              <th className="px-4 py-3 text-right">Lifetime spend</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {(customers ?? []).map((c) => (
              <tr key={c.id} className="border-b border-black/5 last:border-0 hover:bg-black/[0.015]">
                <td className="px-4 py-3 font-medium text-ink">
                  <Link href={`/customers/${c.id}`} className="hover:text-accent">
                    {c.full_name}
                  </Link>
                </td>
                <td className="px-4 py-3 text-ink/70">{c.phone}</td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                      TIER_STYLES[c.tier as string] ?? "bg-black/5 text-ink/60"
                    }`}
                  >
                    {c.tier}
                  </span>
                </td>
                <td className="px-4 py-3 text-right text-ink">{formatMinor(Number(c.wallet_balance_minor))}</td>
                <td className="px-4 py-3 text-right text-ink/70">{formatMinor(Number(c.lifetime_spend_minor))}</td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                      c.is_active ? "bg-ok/10 text-ok" : "bg-black/5 text-ink/40"
                    }`}
                  >
                    {c.is_active ? "Active" : "Inactive"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {(customers ?? []).length === 0 && !error && (
          <p className="px-4 py-10 text-center text-sm text-ink/50">
            No customers yet. Add your first customer to get started.
          </p>
        )}
      </div>
    </div>
  );
}
