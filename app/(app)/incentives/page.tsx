import { createClient } from "@/lib/supabase/server";
import { createIncentive, deleteIncentive } from "./actions";

function formatAmount(minor: number, currency: string) {
  const value = (minor / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return currency + " " + value;
}

export default async function IncentivesPage() {
  const supabase = createClient();

  const [{ data: staff }, { data: incentives }] = await Promise.all([
    supabase.from("employee").select("id, full_name").order("full_name").limit(500),
    supabase
      .from("incentive")
      .select("*, employee:employee_id(full_name)")
      .order("created_at", { ascending: false })
      .limit(200),
  ]);

  const totalMinor = (incentives || []).reduce((sum: number, r: any) => sum + (r.amount_minor || 0), 0);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Staff Incentives</h1>
        <p className="text-slate-500">Bonus and incentive payments awarded to staff.</p>
      </div>

      <section className="rounded-lg border border-slate-200 bg-white p-5">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Incentive Log</h2>
            <p className="text-sm text-slate-500">
              Total awarded: {formatAmount(totalMinor, "INR")} across {(incentives || []).length} entries
            </p>
          </div>
          <details className="relative">
            <summary className="cursor-pointer list-none rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white">
              + Award Incentive
            </summary>
            <form
              action={createIncentive}
              className="absolute right-0 z-10 mt-2 w-80 space-y-3 rounded-md border border-slate-200 bg-white p-4 shadow-lg"
            >
              <div>
                <label className="block text-xs font-medium text-slate-500">Employee</label>
                <select name="employee_id" required className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm">
                  <option value="">Select employee</option>
                  {(staff || []).map((s: any) => (
                    <option key={s.id} value={s.id}>
                      {s.full_name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500">Amount (INR)</label>
                <input
                  name="amount"
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  placeholder="e.g. 500"
                  className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500">Currency</label>
                <input
                  name="currency"
                  defaultValue="INR"
                  className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500">Reason</label>
                <input
                  name="reason"
                  placeholder="e.g. Top performer this month"
                  className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                />
              </div>
              <button type="submit" className="w-full rounded-md bg-slate-900 py-1.5 text-sm font-medium text-white">
                Award Incentive
              </button>
            </form>
          </details>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="py-2">Employee</th>
              <th className="py-2">Amount</th>
              <th className="py-2">Reason</th>
              <th className="py-2">Awarded</th>
              <th className="py-2"></th>
            </tr>
          </thead>
          <tbody>
            {(incentives || []).map((r: any) => (
              <tr key={r.id} className="border-b border-slate-100">
                <td className="py-2 font-medium">{r.employee?.full_name || "-"}</td>
                <td className="py-2 text-slate-600">{formatAmount(r.amount_minor, r.currency)}</td>
                <td className="py-2 text-slate-600">{r.reason || "-"}</td>
                <td className="py-2 text-slate-600">{new Date(r.created_at).toLocaleString("en-IN")}</td>
                <td className="py-2">
                  <form action={deleteIncentive}>
                    <input type="hidden" name="id" value={r.id} />
                    <button type="submit" className="text-xs font-medium text-red-600">
                      Remove
                    </button>
                  </form>
                </td>
              </tr>
            ))}
            {(!incentives || incentives.length === 0) && (
              <tr>
                <td colSpan={5} className="py-4 text-center text-slate-400">
                  No incentives awarded yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
