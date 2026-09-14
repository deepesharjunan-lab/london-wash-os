import { createClient } from "@/lib/supabase/server";
import { createExpense, createMachine, toggleMachineActive } from "./actions";

function formatMinor(minor: number | null) {
  if (minor === null || minor === undefined) return "-";
  return "\u20B9" + (minor / 100).toFixed(2);
}

export default async function ExpensesPage() {
  const supabase = createClient();

  const [
    { data: expenses },
    { data: financialAccounts },
    { data: users },
    { data: machines },
    { data: workstations },
  ] = await Promise.all([
    supabase.from("expense").select("*").order("created_at", { ascending: false }),
    supabase.from("financial_account").select("id, name, account_type").is("deleted_at", null),
    supabase.from("user").select("id, full_name"),
    supabase.from("machine").select("*").is("deleted_at", null).order("created_at", { ascending: false }),
    supabase.from("workstation").select("id, name").is("deleted_at", null),
  ]);

  const accountName = new Map((financialAccounts || []).map((a: any) => [a.id, a.name]));
  const userName = new Map((users || []).map((u: any) => [u.id, u.full_name]));
  const workstationName = new Map((workstations || []).map((w: any) => [w.id, w.name]));

  const totalExpenseMinor = (expenses || []).reduce((sum: number, e: any) => sum + Number(e.amount_minor || 0), 0);

  return (
    <div className="space-y-8">
      <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-accent">Money</div>
      <h1 className="mb-6 font-archivo text-2xl font-extrabold text-ink">Expenses &amp; Machines</h1>
      <p className="mb-6 -mt-4 text-sm text-ink/60">Business expenses and washing/drying equipment.</p>

      <section className="border-2 border-black/10 bg-white p-5">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="font-archivo text-lg font-bold text-ink">Expenses</h2>
            <p className="text-xs text-slate-500">Total: {formatMinor(totalExpenseMinor)}</p>
          </div>
          <details className="relative">
            <summary className="cursor-pointer list-none rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white">
              + Log Expense
            </summary>
            <form
              action={createExpense}
              className="absolute right-0 z-10 mt-2 w-80 space-y-3 border-2 border-black/10 bg-white p-4"
            >
              <div>
                <label className="block text-xs font-medium text-slate-500">Category</label>
                <input
                  name="category"
                  required
                  placeholder="e.g. Utilities, Rent, Supplies"
                  className="mt-1 w-full border border-black/10 px-2 py-1.5 text-[13px]"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500">Amount (\u20B9)</label>
                <input
                  type="number"
                  name="amount"
                  step="0.01"
                  required
                  className="mt-1 w-full border border-black/10 px-2 py-1.5 text-[13px]"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500">Financial account (optional)</label>
                <select
                  name="financial_account_id"
                  className="mt-1 w-full border border-black/10 px-2 py-1.5 text-[13px]"
                >
                  <option value="">None</option>
                  {(financialAccounts || []).map((a: any) => (
                    <option key={a.id} value={a.id}>
                      {a.name} ({a.account_type})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500">Note</label>
                <textarea name="note" rows={2} className="mt-1 w-full border border-black/10 px-2 py-1.5 text-[13px]" />
              </div>
              <button type="submit" className="w-full rounded-md bg-slate-900 py-1.5 text-sm font-medium text-white">
                Save Expense
              </button>
            </form>
          </details>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b-2 border-black/10 text-left text-[11px] uppercase tracking-wide text-ink/50">
              <th className="py-2">Category</th>
              <th className="py-2">Amount</th>
              <th className="py-2">Account</th>
              <th className="py-2">Note</th>
              <th className="py-2">Recorded By</th>
              <th className="py-2">Date</th>
            </tr>
          </thead>
          <tbody>
            {(expenses || []).map((e: any) => (
              <tr key={e.id} className="border-b border-black/5">
                <td className="py-2 font-medium">{e.category}</td>
                <td className="py-2 text-slate-600">{formatMinor(e.amount_minor)}</td>
                <td className="py-2 text-slate-600">{e.financial_account_id ? accountName.get(e.financial_account_id) : "-"}</td>
                <td className="py-2 text-slate-600">{e.note || "-"}</td>
                <td className="py-2 text-slate-600">{e.recorded_by ? userName.get(e.recorded_by) : "-"}</td>
                <td className="py-2 text-slate-500">{new Date(e.created_at).toLocaleDateString()}</td>
              </tr>
            ))}
            {(!expenses || expenses.length === 0) && (
              <tr>
                <td colSpan={6} className="py-4 text-center text-slate-400">
                  No expenses logged yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <section className="border-2 border-black/10 bg-white p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-archivo text-lg font-bold text-ink">Machines</h2>
          <details className="relative">
            <summary className="cursor-pointer list-none rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white">
              + Add Machine
            </summary>
            <form
              action={createMachine}
              className="absolute right-0 z-10 mt-2 w-80 space-y-3 border-2 border-black/10 bg-white p-4"
            >
              <div>
                <label className="block text-xs font-medium text-slate-500">Name</label>
                <input
                  name="name"
                  required
                  placeholder="e.g. Washer 1, Dryer 2"
                  className="mt-1 w-full border border-black/10 px-2 py-1.5 text-[13px]"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500">Type</label>
                <input
                  name="machine_type"
                  placeholder="e.g. washer, dryer, presser"
                  className="mt-1 w-full border border-black/10 px-2 py-1.5 text-[13px]"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500">Workstation (optional)</label>
                <select
                  name="workstation_id"
                  className="mt-1 w-full border border-black/10 px-2 py-1.5 text-[13px]"
                >
                  <option value="">None</option>
                  {(workstations || []).map((w: any) => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                    </option>
                  ))}
                </select>
              </div>
              <button type="submit" className="w-full rounded-md bg-slate-900 py-1.5 text-sm font-medium text-white">
                Save Machine
              </button>
            </form>
          </details>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b-2 border-black/10 text-left text-[11px] uppercase tracking-wide text-ink/50">
              <th className="py-2">Name</th>
              <th className="py-2">Type</th>
              <th className="py-2">Workstation</th>
              <th className="py-2">Status</th>
              <th className="py-2"></th>
            </tr>
          </thead>
          <tbody>
            {(machines || []).map((m: any) => (
              <tr key={m.id} className="border-b border-black/5">
                <td className="py-2 font-medium">{m.name}</td>
                <td className="py-2 text-slate-600">{m.machine_type || "-"}</td>
                <td className="py-2 text-slate-600">{m.workstation_id ? workstationName.get(m.workstation_id) : "-"}</td>
                <td className="py-2 text-slate-600">
                  <span
                    className={
                      "px-2 py-1 text-[11px] font-semibold uppercase tracking-wide " +
                      (m.is_active ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500")
                    }
                  >
                    {m.is_active ? "Active" : "Inactive"}
                  </span>
                </td>
                <td className="py-2">
                  <form action={toggleMachineActive}>
                    <input type="hidden" name="id" value={m.id} />
                    <input type="hidden" name="next_active" value={m.is_active ? "false" : "true"} />
                    <button type="submit" className="text-xs font-medium text-blue-600">
                      {m.is_active ? "Deactivate" : "Activate"}
                    </button>
                  </form>
                </td>
              </tr>
            ))}
            {(!machines || machines.length === 0) && (
              <tr>
                <td colSpan={5} className="py-4 text-center text-slate-400">
                  No machines registered yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
