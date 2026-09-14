import { createClient } from "@/lib/supabase/server";
import {
  createAuditLogEntry,
  createAutomationRule,
  toggleAutomationRule,
  deleteAutomationRule,
  createFinancialAccount,
  deleteFinancialAccount,
} from "./actions";

function toDateInputValue(d: Date) {
  return d.toISOString().slice(0, 10);
}

export default async function SysOpsPage({
  searchParams,
}: {
  searchParams: { from?: string; to?: string; entity_type?: string };
}) {
  const supabase = createClient();

  const defaultTo = new Date();
  const defaultFrom = new Date();
  defaultFrom.setDate(defaultFrom.getDate() - 30);

  const fromStr = searchParams.from || toDateInputValue(defaultFrom);
  const toStr = searchParams.to || toDateInputValue(defaultTo);
  const entityType = searchParams.entity_type || "";

  const fromIso = new Date(fromStr + "T00:00:00.000Z").toISOString();
  const toIso = new Date(toStr + "T23:59:59.999Z").toISOString();

  let auditQuery = supabase
    .from("audit_log")
    .select("*")
    .gte("created_at", fromIso)
    .lte("created_at", toIso)
    .order("created_at", { ascending: false });

  if (entityType) {
    auditQuery = auditQuery.eq("entity_type", entityType);
  }

  const [{ data: auditLogs }, { data: entityTypes }, { data: automationRules }, { data: financialAccounts }] =
    await Promise.all([
      auditQuery,
      supabase.from("audit_log").select("entity_type"),
      supabase.from("automation_rule").select("*").order("created_at", { ascending: false }),
      supabase.from("financial_account").select("*").is("deleted_at", null).order("created_at", { ascending: false }),
    ]);

  const distinctEntityTypes = Array.from(new Set((entityTypes || []).map((e: any) => e.entity_type))).filter(Boolean);

  return (
    <div className="space-y-8">
      <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-accent">System</div>
      <h1 className="mb-6 font-archivo text-2xl font-extrabold text-ink">System Operations</h1>
      <p className="mb-6 -mt-4 text-sm text-ink/60">Audit trail, automation rules, and financial accounts.</p>

      <section className="border-2 border-black/10 bg-white p-5">
        <div className="mb-4 flex items-center justify-between border-b-2 border-black/10 pb-3">
          <h2 className="font-archivo text-[13.5px] font-bold text-ink">Audit Log</h2>
          <details className="relative">
            <summary className="cursor-pointer list-none rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white">
              + Log Entry
            </summary>
            <form
              action={createAuditLogEntry}
              className="absolute right-0 z-10 mt-2 w-80 space-y-3 border-2 border-black/10 bg-white p-4"
            >
              <div>
                <label className="block text-xs font-medium text-slate-500">Action</label>
                <input
                  name="action"
                  required
                  placeholder="e.g. manual_price_override"
                  className="mt-1 w-full border border-black/10 px-3 py-2 text-[13px]"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500">Entity type</label>
                <input
                  name="entity_type"
                  required
                  placeholder="e.g. order, customer, price_list"
                  className="mt-1 w-full border border-black/10 px-3 py-2 text-[13px]"
                />
              </div>
              <button type="submit" className="w-full rounded-md bg-slate-900 py-1.5 text-sm font-medium text-white">
                Save Entry
              </button>
            </form>
          </details>
        </div>

        <form method="get" className="mb-4 flex flex-wrap items-end gap-3 border border-slate-100 bg-slate-50 p-3">
          <div>
            <label className="block text-[10px] font-semibold uppercase tracking-wide text-slate-500">From</label>
            <input
              type="date"
              name="from"
              defaultValue={fromStr}
              className="mt-1 border border-black/10 px-3 py-2 text-[13px]"
            />
          </div>
          <div>
            <label className="block text-[10px] font-semibold uppercase tracking-wide text-slate-500">To</label>
            <input
              type="date"
              name="to"
              defaultValue={toStr}
              className="mt-1 border border-black/10 px-3 py-2 text-[13px]"
            />
          </div>
          <div>
            <label className="block text-[10px] font-semibold uppercase tracking-wide text-slate-500">Entity type</label>
            <select name="entity_type" defaultValue={entityType} className="mt-1 border border-black/10 px-3 py-2 text-[13px]">
              <option value="">All types</option>
              {distinctEntityTypes.map((t: any) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <button type="submit" className="rounded-md bg-slate-900 px-4 py-1.5 text-sm font-medium text-white">
            Apply
          </button>
          <a href="/sysops" className="text-sm font-medium text-blue-600">
            Reset to last 30 days
          </a>
        </form>

        <table className="w-full text-sm">
          <thead>
            <tr className="border-b-2 border-black/10 text-left text-[11px] uppercase tracking-wide text-ink/50">
              <th className="py-2">Action</th>
              <th className="py-2">Entity Type</th>
              <th className="py-2">When</th>
            </tr>
          </thead>
          <tbody>
            {(auditLogs || []).map((a: any) => (
              <tr key={a.id} className="border-b border-black/5">
                <td className="py-2 font-medium">{a.action}</td>
                <td className="py-2 text-slate-600">{a.entity_type}</td>
                <td className="py-2 text-slate-600">{new Date(a.created_at).toLocaleString("en-IN")}</td>
              </tr>
            ))}
            {(!auditLogs || auditLogs.length === 0) && (
              <tr>
                <td colSpan={3} className="py-4 text-center text-slate-400">
                  No audit entries in this range.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
      <section className="border-2 border-black/10 bg-white p-5">
        <div className="mb-4 flex items-center justify-between border-b-2 border-black/10 pb-3">
          <h2 className="font-archivo text-[13.5px] font-bold text-ink">Automation Rules</h2>
          <details className="relative">
            <summary className="cursor-pointer list-none rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white">
              + New Rule
            </summary>
            <form
              action={createAutomationRule}
              className="absolute right-0 z-10 mt-2 w-80 space-y-3 border-2 border-black/10 bg-white p-4"
            >
              <div>
                <label className="block text-xs font-medium text-slate-500">Rule name</label>
                <input
                  name="name"
                  required
                  placeholder="e.g. Notify on order delay"
                  className="mt-1 w-full border border-black/10 px-3 py-2 text-[13px]"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500">Trigger event</label>
                <input
                  name="trigger_event"
                  required
                  placeholder="e.g. order.sla_breached"
                  className="mt-1 w-full border border-black/10 px-3 py-2 text-[13px]"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500">Condition (JSON, optional)</label>
                <input
                  name="condition"
                  placeholder='e.g. {"minutes_late": 30}'
                  className="mt-1 w-full border border-black/10 px-3 py-2 text-[13px]"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500">Action (JSON, optional)</label>
                <input
                  name="action"
                  placeholder='e.g. {"notify": "branch_manager"}'
                  className="mt-1 w-full border border-black/10 px-3 py-2 text-[13px]"
                />
              </div>
              <button type="submit" className="w-full rounded-md bg-slate-900 py-1.5 text-sm font-medium text-white">
                Create Rule
              </button>
            </form>
          </details>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b-2 border-black/10 text-left text-[11px] uppercase tracking-wide text-ink/50">
              <th className="py-2">Name</th>
              <th className="py-2">Trigger</th>
              <th className="py-2">Status</th>
              <th className="py-2"></th>
            </tr>
          </thead>
          <tbody>
            {(automationRules || []).map((r: any) => (
              <tr key={r.id} className="border-b border-black/5">
                <td className="py-2 font-medium">{r.name}</td>
                <td className="py-2 text-slate-600">{r.trigger_event}</td>
                <td className="py-2 text-slate-600">
                  <span
                    className={
                      "px-2 py-0.5 text-xs font-medium uppercase tracking-wide " +
                      (r.is_active ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500")
                    }
                  >
                    {r.is_active ? "Active" : "Inactive"}
                  </span>
                </td>
                <td className="py-2">
                  <div className="flex items-center gap-2">
                    <form action={toggleAutomationRule}>
                      <input type="hidden" name="id" value={r.id} />
                      <input type="hidden" name="next_active" value={r.is_active ? "false" : "true"} />
                      <button type="submit" className="text-xs font-medium text-blue-600">
                        {r.is_active ? "Deactivate" : "Activate"}
                      </button>
                    </form>
                    <form action={deleteAutomationRule}>
                      <input type="hidden" name="id" value={r.id} />
                      <button type="submit" className="text-xs font-medium text-red-600">
                        Remove
                      </button>
                    </form>
                  </div>
                </td>
              </tr>
            ))}
            {(!automationRules || automationRules.length === 0) && (
              <tr>
                <td colSpan={4} className="py-4 text-center text-slate-400">
                  No automation rules yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <section className="border-2 border-black/10 bg-white p-5">
        <div className="mb-4 flex items-center justify-between border-b-2 border-black/10 pb-3">
          <h2 className="font-archivo text-[13.5px] font-bold text-ink">Financial Accounts</h2>
          <details className="relative">
            <summary className="cursor-pointer list-none rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white">
              + New Account
            </summary>
            <form
              action={createFinancialAccount}
              className="absolute right-0 z-10 mt-2 w-80 space-y-3 border-2 border-black/10 bg-white p-4"
            >
              <div>
                <label className="block text-xs font-medium text-slate-500">Account name</label>
                <input
                  name="name"
                  required
                  placeholder="e.g. HDFC Current Account"
                  className="mt-1 w-full border border-black/10 px-3 py-2 text-[13px]"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500">Account type</label>
                <select name="account_type" required className="mt-1 w-full border border-black/10 px-3 py-2 text-[13px]">
                  <option value="">Select type</option>
                  <option value="cash">Cash</option>
                  <option value="bank">Bank</option>
                  <option value="upi">UPI</option>
                  <option value="wallet">Wallet</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <button type="submit" className="w-full rounded-md bg-slate-900 py-1.5 text-sm font-medium text-white">
                Create Account
              </button>
            </form>
          </details>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b-2 border-black/10 text-left text-[11px] uppercase tracking-wide text-ink/50">
              <th className="py-2">Name</th>
              <th className="py-2">Type</th>
              <th className="py-2"></th>
            </tr>
          </thead>
          <tbody>
            {(financialAccounts || []).map((f: any) => (
              <tr key={f.id} className="border-b border-black/5">
                <td className="py-2 font-medium">{f.name}</td>
                <td className="py-2 text-slate-600 capitalize">{f.account_type}</td>
                <td className="py-2">
                  <form action={deleteFinancialAccount}>
                    <input type="hidden" name="id" value={f.id} />
                    <button type="submit" className="text-xs font-medium text-red-600">
                      Remove
                    </button>
                  </form>
                </td>
              </tr>
            ))}
            {(!financialAccounts || financialAccounts.length === 0) && (
              <tr>
                <td colSpan={3} className="py-4 text-center text-slate-400">
                  No financial accounts yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
