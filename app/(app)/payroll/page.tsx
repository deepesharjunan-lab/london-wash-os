import { createClient } from "@/lib/supabase/server";
import {
  createLeaveRequest,
  updateLeaveStatus,
  createPayrollRun,
  updatePayrollStatus,
} from "./actions";

function formatMinor(minor: number, currency: string) {
  const value = (minor / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return currency + " " + value;
}

function badgeClass(status: string) {
  if (status === "approved" || status === "paid") return "bg-emerald-100 text-emerald-700";
  if (status === "rejected" || status === "cancelled") return "bg-red-100 text-red-700";
  return "bg-amber-100 text-amber-700";
}

export default async function PayrollPage() {
  const supabase = createClient();

  const [{ data: employees }, { data: leaves }, { data: payrolls }] = await Promise.all([
    supabase.from("employee").select("id, full_name").order("full_name").limit(500),
    supabase
      .from("leave")
      .select("*, employee:employee_id(full_name)")
      .order("created_at", { ascending: false })
      .limit(100),
    supabase
      .from("payroll")
      .select("*, employee:employee_id(full_name)")
      .order("created_at", { ascending: false })
      .limit(500),
  ]);

  // payroll is an append-only ledger: each status transition (draft -> approved
  // -> paid) is a new row for the same run. Collapse to the latest row per
  // (employee, period) so the UI shows one line per run with its current status.
  const latestByRun = new Map<string, any>();
  for (const row of payrolls || []) {
    const key = row.employee_id + "|" + row.period_start + "|" + row.period_end;
    if (!latestByRun.has(key)) latestByRun.set(key, row);
  }
  const payrollRuns = Array.from(latestByRun.values()).slice(0, 100);

  return (
    <div className="space-y-8">
      <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-accent">Money</div>
      <h1 className="mb-6 font-archivo text-2xl font-extrabold text-ink">Payroll &amp; Leave</h1>
      <p className="mb-6 -mt-4 text-sm text-ink/60">Staff leave requests and payroll runs.</p>

      <section className="border-2 border-black/10 bg-white p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-archivo text-lg font-bold text-ink">Leave Requests</h2>
          <details className="relative">
            <summary className="cursor-pointer list-none rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white">
              + Request Leave
            </summary>
            <form
              action={createLeaveRequest}
              className="absolute right-0 z-10 mt-2 w-80 space-y-3 border-2 border-black/10 bg-white p-4"
            >
              <div>
                <label className="block text-xs font-medium text-slate-500">Employee</label>
                <select name="employee_id" required className="mt-1 w-full border border-black/10 px-2 py-1.5 text-[13px]">
                  <option value="">Select employee</option>
                  {(employees || []).map((e: any) => (
                    <option key={e.id} value={e.id}>
                      {e.full_name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500">Leave type</label>
                <select name="leave_type" required className="mt-1 w-full border border-black/10 px-2 py-1.5 text-[13px]">
                  <option value="">Select type</option>
                  <option value="casual">Casual</option>
                  <option value="sick">Sick</option>
                  <option value="earned">Earned</option>
                  <option value="unpaid">Unpaid</option>
                </select>
              </div>
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="block text-xs font-medium text-slate-500">From</label>
                  <input type="date" name="starts_on" required className="mt-1 w-full border border-black/10 px-2 py-1.5 text-[13px]" />
                </div>
                <div className="flex-1">
                  <label className="block text-xs font-medium text-slate-500">To</label>
                  <input type="date" name="ends_on" required className="mt-1 w-full border border-black/10 px-2 py-1.5 text-[13px]" />
                </div>
              </div>
              <button type="submit" className="w-full rounded-md bg-slate-900 py-1.5 text-sm font-medium text-white">
                Submit Request
              </button>
            </form>
          </details>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b-2 border-black/10 text-left text-[11px] uppercase tracking-wide text-ink/50">
              <th className="py-2">Employee</th>
              <th className="py-2">Type</th>
              <th className="py-2">From</th>
              <th className="py-2">To</th>
              <th className="py-2">Status</th>
              <th className="py-2"></th>
            </tr>
          </thead>
          <tbody>
            {(leaves || []).map((r: any) => (
              <tr key={r.id} className="border-b border-black/5">
                <td className="py-2 font-medium">{r.employee?.full_name || "-"}</td>
                <td className="py-2 text-slate-600 capitalize">{r.leave_type}</td>
                <td className="py-2 text-slate-600">{r.starts_on}</td>
                <td className="py-2 text-slate-600">{r.ends_on}</td>
                <td className="py-2">
                  <span className={"px-2 py-1 text-[11px] font-semibold uppercase tracking-wide " + badgeClass(r.status)}>{r.status}</span>
                </td>
                <td className="py-2">
                  {r.status === "requested" && (
                    <div className="flex gap-2">
                      <form action={updateLeaveStatus}>
                        <input type="hidden" name="id" value={r.id} />
                        <input type="hidden" name="status" value="approved" />
                        <button type="submit" className="text-xs font-medium text-emerald-600">
                          Approve
                        </button>
                      </form>
                      <form action={updateLeaveStatus}>
                        <input type="hidden" name="id" value={r.id} />
                        <input type="hidden" name="status" value="rejected" />
                        <button type="submit" className="text-xs font-medium text-red-600">
                          Reject
                        </button>
                      </form>
                    </div>
                  )}
                </td>
              </tr>
            ))}
            {(!leaves || leaves.length === 0) && (
              <tr>
                <td colSpan={6} className="py-4 text-center text-slate-400">
                  No leave requests yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <section className="border-2 border-black/10 bg-white p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-archivo text-lg font-bold text-ink">Payroll Runs</h2>
          <details className="relative">
            <summary className="cursor-pointer list-none rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white">
              + New Payroll Run
            </summary>
            <form
              action={createPayrollRun}
              className="absolute right-0 z-10 mt-2 w-80 space-y-3 border-2 border-black/10 bg-white p-4"
            >
              <div>
                <label className="block text-xs font-medium text-slate-500">Employee</label>
                <select name="employee_id" required className="mt-1 w-full border border-black/10 px-2 py-1.5 text-[13px]">
                  <option value="">Select employee</option>
                  {(employees || []).map((e: any) => (
                    <option key={e.id} value={e.id}>
                      {e.full_name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="block text-xs font-medium text-slate-500">Period start</label>
                  <input type="date" name="period_start" required className="mt-1 w-full border border-black/10 px-2 py-1.5 text-[13px]" />
                </div>
                <div className="flex-1">
                  <label className="block text-xs font-medium text-slate-500">Period end</label>
                  <input type="date" name="period_end" required className="mt-1 w-full border border-black/10 px-2 py-1.5 text-[13px]" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500">Gross (INR)</label>
                <input name="gross" type="number" step="0.01" min="0" required className="mt-1 w-full border border-black/10 px-2 py-1.5 text-[13px]" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500">Deductions (INR)</label>
                <input name="deductions" type="number" step="0.01" min="0" defaultValue="0" className="mt-1 w-full border border-black/10 px-2 py-1.5 text-[13px]" />
              </div>
              <button type="submit" className="w-full rounded-md bg-slate-900 py-1.5 text-sm font-medium text-white">
                Create Run
              </button>
            </form>
          </details>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b-2 border-black/10 text-left text-[11px] uppercase tracking-wide text-ink/50">
              <th className="py-2">Employee</th>
              <th className="py-2">Period</th>
              <th className="py-2">Gross</th>
              <th className="py-2">Deductions</th>
              <th className="py-2">Net</th>
              <th className="py-2">Status</th>
              <th className="py-2"></th>
            </tr>
          </thead>
          <tbody>
            {payrollRuns.map((p: any) => (
              <tr key={p.id} className="border-b border-black/5">
                <td className="py-2 font-medium">{p.employee?.full_name || "-"}</td>
                <td className="py-2 text-slate-600">
                  {p.period_start} to {p.period_end}
                </td>
                <td className="py-2 text-slate-600">{formatMinor(p.gross_minor, p.currency)}</td>
                <td className="py-2 text-slate-600">{formatMinor(p.deductions_minor, p.currency)}</td>
                <td className="py-2 font-medium">{formatMinor(p.net_minor, p.currency)}</td>
                <td className="py-2">
                  <span className={"px-2 py-1 text-[11px] font-semibold uppercase tracking-wide " + badgeClass(p.status)}>{p.status}</span>
                </td>
                <td className="py-2">
                  {p.status === "draft" && (
                    <form action={updatePayrollStatus}>
                      <input type="hidden" name="id" value={p.id} />
                      <input type="hidden" name="status" value="approved" />
                      <button type="submit" className="text-xs font-medium text-emerald-600">
                        Approve
                      </button>
                    </form>
                  )}
                  {p.status === "approved" && (
                    <form action={updatePayrollStatus}>
                      <input type="hidden" name="id" value={p.id} />
                      <input type="hidden" name="status" value="paid" />
                      <button type="submit" className="text-xs font-medium text-blue-600">
                        Mark Paid
                      </button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
            {payrollRuns.length === 0 && (
              <tr>
                <td colSpan={7} className="py-4 text-center text-slate-400">
                  No payroll runs yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
