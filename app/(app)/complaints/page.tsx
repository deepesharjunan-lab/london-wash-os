import { createClient } from "@/lib/supabase/server";
import { createComplaint, updateComplaintStatus, assignComplaint, createRefund } from "./actions";

function formatMinor(minor: number | null) {
  if (minor === null || minor === undefined) return "-";
  return "\u20B9" + (minor / 100).toFixed(2);
}

const complaintStatuses = ["open", "investigating", "resolved", "closed"];

export default async function ComplaintsPage() {
  const supabase = createClient();

  const [
    { data: complaints },
    { data: customers },
    { data: orders },
    { data: users },
    { data: payments },
    { data: refunds },
  ] = await Promise.all([
    supabase.from("complaint").select("*").order("created_at", { ascending: false }),
    supabase.from("customer").select("id, full_name"),
    supabase.from("order").select("id, order_number"),
    supabase.from("user").select("id, full_name"),
    supabase.from("payment").select("id, order_id, amount_minor, method, created_at"),
    supabase.from("refund").select("*").order("created_at", { ascending: false }),
  ]);

  const customerName = new Map((customers || []).map((c: any) => [c.id, c.full_name]));
  const orderNumber = new Map((orders || []).map((o: any) => [o.id, o.order_number]));
  const userName = new Map((users || []).map((u: any) => [u.id, u.full_name]));
  const paymentLabel = new Map(
    (payments || []).map((p: any) => [
      p.id,
      (orderNumber.get(p.order_id) || "Order") + " - " + formatMinor(p.amount_minor) + " (" + p.method + ")",
    ])
  );
  return (
    <div className="space-y-8">
      <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-accent">Money</div>
      <h1 className="mb-6 font-archivo text-2xl font-extrabold text-ink">Complaints &amp; Refunds</h1>
      <p className="mb-6 -mt-4 text-sm text-ink/60">Customer complaints and payment refunds.</p>

      <section className="border-2 border-black/10 bg-white p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-archivo text-lg font-bold text-ink">Complaints</h2>
          <details className="relative">
            <summary className="cursor-pointer list-none rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white">
              + Log Complaint
            </summary>
            <form
              action={createComplaint}
              className="absolute right-0 z-10 mt-2 w-80 space-y-3 border-2 border-black/10 bg-white p-4"
            >
              <div>
                <label className="block text-xs font-medium text-slate-500">Customer</label>
                <select name="customer_id" required className="mt-1 w-full border border-black/10 px-2 py-1.5 text-[13px]">
                  <option value="">Select customer</option>
                  {(customers || []).map((c: any) => (
                    <option key={c.id} value={c.id}>
                      {c.full_name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500">Order (optional)</label>
                <select name="order_id" className="mt-1 w-full border border-black/10 px-2 py-1.5 text-[13px]">
                  <option value="">No order</option>
                  {(orders || []).map((o: any) => (
                    <option key={o.id} value={o.id}>
                      {o.order_number}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500">Subject</label>
                <input name="subject" required className="mt-1 w-full border border-black/10 px-2 py-1.5 text-[13px]" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500">Description</label>
                <textarea name="description" rows={3} className="mt-1 w-full border border-black/10 px-2 py-1.5 text-[13px]" />
              </div>
              <button type="submit" className="w-full rounded-md bg-slate-900 py-1.5 text-sm font-medium text-white">
                Save Complaint
              </button>
            </form>
          </details>
        </div>        <table className="w-full text-sm">
          <thead>
            <tr className="border-b-2 border-black/10 text-left text-[11px] uppercase tracking-wide text-ink/50">
              <th className="py-2">Customer</th>
              <th className="py-2">Order</th>
              <th className="py-2">Subject</th>
              <th className="py-2">Status</th>
              <th className="py-2">Assigned To</th>
              <th className="py-2">Created</th>
            </tr>
          </thead>
          <tbody>
            {(complaints || []).map((c: any) => (
              <tr key={c.id} className="border-b border-black/5">
                <td className="py-2 font-medium">{customerName.get(c.customer_id) || "-"}</td>
                <td className="py-2 text-slate-600">{c.order_id ? orderNumber.get(c.order_id) : "-"}</td>
                <td className="py-2 text-slate-600">{c.subject}</td>
                <td className="py-2 text-slate-600">
                  <form action={updateComplaintStatus} className="flex items-center gap-2">
                    <input type="hidden" name="id" value={c.id} />
                    <select name="status" defaultValue={c.status} className="border border-black/10 px-2 py-1 text-xs">
                      {complaintStatuses.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                    <button type="submit" className="text-xs font-medium text-blue-600">
                      Update
                    </button>
                  </form>
                </td>
                <td className="py-2 text-slate-600">
                  <form action={assignComplaint} className="flex items-center gap-2">
                    <input type="hidden" name="id" value={c.id} />
                    <select name="assigned_to" defaultValue={c.assigned_to || ""} className="border border-black/10 px-2 py-1 text-xs">
                      <option value="">Unassigned</option>
                      {(users || []).map((u: any) => (
                        <option key={u.id} value={u.id}>
                          {u.full_name}
                        </option>
                      ))}
                    </select>
                    <button type="submit" className="text-xs font-medium text-blue-600">
                      Assign
                    </button>
                  </form>
                </td>
                <td className="py-2 text-slate-500">{new Date(c.created_at).toLocaleDateString()}</td>
              </tr>
            ))}
            {(!complaints || complaints.length === 0) && (
              <tr>
                <td colSpan={6} className="py-4 text-center text-slate-400">
                  No complaints yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
      <section className="border-2 border-black/10 bg-white p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-archivo text-lg font-bold text-ink">Refunds</h2>
          <details className="relative">
            <summary className="cursor-pointer list-none rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white">
              + Add Refund
            </summary>
            <form
              action={createRefund}
              className="absolute right-0 z-10 mt-2 w-80 space-y-3 border-2 border-black/10 bg-white p-4"
            >
              <div>
                <label className="block text-xs font-medium text-slate-500">Payment</label>
                <select name="payment_id" required className="mt-1 w-full border border-black/10 px-2 py-1.5 text-[13px]">
                  <option value="">Select payment</option>
                  {(payments || []).map((p: any) => (
                    <option key={p.id} value={p.id}>
                      {paymentLabel.get(p.id)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500">Amount (\u20B9)</label>
                <input type="number" name="amount" step="0.01" required className="mt-1 w-full border border-black/10 px-2 py-1.5 text-[13px]" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500">Reason</label>
                <textarea name="reason" rows={2} required className="mt-1 w-full border border-black/10 px-2 py-1.5 text-[13px]" />
              </div>
              <button type="submit" className="w-full rounded-md bg-slate-900 py-1.5 text-sm font-medium text-white">
                Save Refund
              </button>
            </form>
          </details>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b-2 border-black/10 text-left text-[11px] uppercase tracking-wide text-ink/50">
              <th className="py-2">Payment</th>
              <th className="py-2">Amount</th>
              <th className="py-2">Reason</th>
              <th className="py-2">Processed By</th>
              <th className="py-2">Created</th>
            </tr>
          </thead>
          <tbody>
            {(refunds || []).map((r: any) => (
              <tr key={r.id} className="border-b border-black/5">
                <td className="py-2 font-medium">{paymentLabel.get(r.payment_id) || "-"}</td>
                <td className="py-2 text-slate-600">{formatMinor(r.amount_minor)}</td>
                <td className="py-2 text-slate-600">{r.reason}</td>
                <td className="py-2 text-slate-600">{r.processed_by ? userName.get(r.processed_by) : "-"}</td>
                <td className="py-2 text-slate-500">{new Date(r.created_at).toLocaleDateString()}</td>
              </tr>
            ))}
            {(!refunds || refunds.length === 0) && (
              <tr>
                <td colSpan={5} className="py-4 text-center text-slate-400">
                  No refunds yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
