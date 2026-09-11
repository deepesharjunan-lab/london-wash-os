import { createClient } from "@/lib/supabase/server";
import { createMembership, toggleMembershipActive, createWallet, createWalletTransaction } from "./actions";

function formatMinor(minor: number | null) {
  if (minor === null || minor === undefined) return "-";
  return "₹" + (minor / 100).toFixed(2);
}

const txnTypes = ["credit", "debit", "refund_credit", "adjustment"];

export default async function WalletPage() {
  const supabase = createClient();

  const [
    { data: memberships },
    { data: wallets },
    { data: customers },
    { data: transactions },
  ] = await Promise.all([
    supabase.from("membership").select("*").order("created_at", { ascending: false }),
    supabase.from("wallet").select("*").order("created_at", { ascending: false }),
    supabase.from("customer").select("id, full_name"),
    supabase.from("wallet_transaction").select("*").order("created_at", { ascending: false }).limit(30),
  ]);

  const customerName = new Map((customers || []).map((c: any) => [c.id, c.full_name]));
  const walletCustomer = new Map((wallets || []).map((w: any) => [w.id, w.customer_id]));

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Memberships & Wallet</h1>
        <p className="text-slate-500">Membership plans and customer store-credit wallets.</p>
      </div>

      <section className="rounded-lg border border-slate-200 bg-white p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Memberships</h2>
          <details className="relative">
            <summary className="cursor-pointer list-none rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white">
              + Add Membership
            </summary>
            <form
              action={createMembership}
              className="absolute right-0 z-10 mt-2 w-80 space-y-3 rounded-md border border-slate-200 bg-white p-4 shadow-lg"
            >
              <div>
                <label className="block text-xs font-medium text-slate-500">Customer</label>
                <select name="customer_id" required className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm">
                  <option value="">Select customer</option>
                  {(customers || []).map((c: any) => (
                    <option key={c.id} value={c.id}>
                      {c.full_name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500">Plan name</label>
                <input
                  name="plan_name"
                  required
                  placeholder="e.g. Gold Membership"
                  className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-medium text-slate-500">Starts</label>
                  <input type="date" name="starts_at" className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500">Ends (optional)</label>
                  <input type="date" name="ends_at" className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
                </div>
              </div>
              <button type="submit" className="w-full rounded-md bg-slate-900 py-1.5 text-sm font-medium text-white">
                Save Membership
              </button>
            </form>
          </details>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="py-2">Customer</th>
              <th className="py-2">Plan</th>
              <th className="py-2">Starts</th>
              <th className="py-2">Ends</th>
              <th className="py-2">Status</th>
              <th className="py-2"></th>
            </tr>
          </thead>
          <tbody>
            {(memberships || []).map((m: any) => (
              <tr key={m.id} className="border-b border-slate-100">
                <td className="py-2 font-medium">{customerName.get(m.customer_id) || "-"}</td>
                <td className="py-2 text-slate-600">{m.plan_name}</td>
                <td className="py-2 text-slate-600">{m.starts_at ? new Date(m.starts_at).toLocaleDateString() : "-"}</td>
                <td className="py-2 text-slate-600">{m.ends_at ? new Date(m.ends_at).toLocaleDateString() : "-"}</td>
                <td className="py-2 text-slate-600">
                  <span
                    className={
                      "rounded-full px-2 py-0.5 text-xs font-medium " +
                      (m.is_active ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500")
                    }
                  >
                    {m.is_active ? "Active" : "Inactive"}
                  </span>
                </td>
                <td className="py-2">
                  <form action={toggleMembershipActive}>
                    <input type="hidden" name="id" value={m.id} />
                    <input type="hidden" name="next_active" value={m.is_active ? "false" : "true"} />
                    <button type="submit" className="text-xs font-medium text-blue-600">
                      {m.is_active ? "Deactivate" : "Activate"}
                    </button>
                  </form>
                </td>
              </tr>
            ))}
            {(!memberships || memberships.length === 0) && (
              <tr>
                <td colSpan={6} className="py-4 text-center text-slate-400">
                  No memberships yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Customer Wallets</h2>
          <details className="relative">
            <summary className="cursor-pointer list-none rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white">
              + Open Wallet
            </summary>
            <form
              action={createWallet}
              className="absolute right-0 z-10 mt-2 w-80 space-y-3 rounded-md border border-slate-200 bg-white p-4 shadow-lg"
            >
              <div>
                <label className="block text-xs font-medium text-slate-500">Customer</label>
                <select name="customer_id" required className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm">
                  <option value="">Select customer</option>
                  {(customers || []).map((c: any) => (
                    <option key={c.id} value={c.id}>
                      {c.full_name}
                    </option>
                  ))}
                </select>
              </div>
              <button type="submit" className="w-full rounded-md bg-slate-900 py-1.5 text-sm font-medium text-white">
                Open Wallet
              </button>
            </form>
          </details>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="py-2">Customer</th>
              <th className="py-2">Balance</th>
            </tr>
          </thead>
          <tbody>
            {(wallets || []).map((w: any) => (
              <tr key={w.id} className="border-b border-slate-100">
                <td className="py-2 font-medium">{customerName.get(w.customer_id) || "-"}</td>
                <td className="py-2 text-slate-600">{formatMinor(w.balance_minor)}</td>
              </tr>
            ))}
            {(!wallets || wallets.length === 0) && (
              <tr>
                <td colSpan={2} className="py-4 text-center text-slate-400">
                  No wallets yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Wallet Transactions</h2>
          <details className="relative">
            <summary className="cursor-pointer list-none rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white">
              + Add Transaction
            </summary>
            <form
              action={createWalletTransaction}
              className="absolute right-0 z-10 mt-2 w-80 space-y-3 rounded-md border border-slate-200 bg-white p-4 shadow-lg"
            >
              <div>
                <label className="block text-xs font-medium text-slate-500">Wallet</label>
                <select name="wallet_id" required className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm">
                  <option value="">Select wallet</option>
                  {(wallets || []).map((w: any) => (
                    <option key={w.id} value={w.id}>
                      {customerName.get(w.customer_id) || "Wallet"} ({formatMinor(w.balance_minor)})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500">Type</label>
                <select name="type" required className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm">
                  {txnTypes.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500">Amount (₹)</label>
                <input type="number" name="amount" step="0.01" required className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500">Note</label>
                <textarea name="note" rows={2} className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
              </div>
              <button type="submit" className="w-full rounded-md bg-slate-900 py-1.5 text-sm font-medium text-white">
                Save Transaction
              </button>
            </form>
          </details>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="py-2">Customer</th>
              <th className="py-2">Type</th>
              <th className="py-2">Amount</th>
              <th className="py-2">Balance After</th>
              <th className="py-2">Note</th>
              <th className="py-2">Date</th>
            </tr>
          </thead>
          <tbody>
            {(transactions || []).map((t: any) => (
              <tr key={t.id} className="border-b border-slate-100">
                <td className="py-2 font-medium">{customerName.get(walletCustomer.get(t.wallet_id) || "") || "-"}</td>
                <td className="py-2 text-slate-600">{t.type}</td>
                <td className="py-2 text-slate-600">{formatMinor(t.amount_minor)}</td>
                <td className="py-2 text-slate-600">{formatMinor(t.balance_after_minor)}</td>
                <td className="py-2 text-slate-600">{t.note || "-"}</td>
                <td className="py-2 text-slate-500">{new Date(t.created_at).toLocaleDateString()}</td>
              </tr>
            ))}
            {(!transactions || transactions.length === 0) && (
              <tr>
                <td colSpan={6} className="py-4 text-center text-slate-400">
                  No wallet transactions yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
