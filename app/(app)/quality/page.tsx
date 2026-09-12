import { createClient } from "@/lib/supabase/server";
import { createQualityCheck, createReprocess } from "./actions";

function resultBadge(result: string) {
  if (result === "pass") return "bg-emerald-100 text-emerald-700";
  if (result === "fail") return "bg-red-100 text-red-700";
  return "bg-amber-100 text-amber-700";
}

function jobLabel(job: any) {
  const orderNumber = job?.order_item?.order?.order_number;
  const itemName = job?.order_item?.item?.name;
  const parts = [];
  if (orderNumber) parts.push(orderNumber);
  if (itemName) parts.push(itemName);
  if (parts.length === 0) return job?.id ? "Job " + String(job.id).slice(0, 8) : "-";
  return parts.join(" - ");
}

export default async function QualityControlPage() {
  const supabase = createClient();

  const [{ data: jobs }, { data: checks }, { data: reprocesses }] = await Promise.all([
    supabase
      .from("production_job")
      .select("id, status, order_item:order_item_id(item:item_id(name), order:order_id(order_number))")
      .order("created_at", { ascending: false })
      .limit(100),
    supabase
      .from("quality_check")
      .select(
        "*, production_job:production_job_id(id, status, order_item:order_item_id(item:item_id(name), order:order_id(order_number))), checked_by_user:checked_by(full_name)"
      )
      .order("created_at", { ascending: false })
      .limit(100),
    supabase
      .from("reprocess")
      .select("*, quality_check:quality_check_id(production_job:production_job_id(id, order_item:order_item_id(item:item_id(name), order:order_id(order_number))))")
      .order("created_at", { ascending: false })
      .limit(100),
  ]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Quality Control</h1>
        <p className="text-slate-500">Log inspection results for production jobs and track reprocessing.</p>
      </div>

      <section className="rounded-lg border border-slate-200 bg-white p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">QC Log</h2>
          <details className="relative">
            <summary className="cursor-pointer list-none rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white">
              + Log QC Result
            </summary>
            <form
              action={createQualityCheck}
              className="absolute right-0 z-10 mt-2 w-80 space-y-3 rounded-md border border-slate-200 bg-white p-4 shadow-lg"
            >
              <div>
                <label className="block text-xs font-medium text-slate-500">Production job</label>
                <select name="production_job_id" required className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm">
                  <option value="">Select job</option>
                  {(jobs || []).map((j: any) => (
                    <option key={j.id} value={j.id}>
                      {jobLabel(j)} ({j.status})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500">Result</label>
                <select name="result" required className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm">
                  <option value="">Select result</option>
                  <option value="pass">Pass</option>
                  <option value="fail">Fail</option>
                  <option value="reprocess">Reprocess</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500">Notes</label>
                <textarea name="notes" rows={3} className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm" placeholder="e.g. Stain remains on collar" />
              </div>
              <button type="submit" className="w-full rounded-md bg-slate-900 py-1.5 text-sm font-medium text-white">
                Log Result
              </button>
            </form>
          </details>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="py-2">Job</th>
              <th className="py-2">Result</th>
              <th className="py-2">Notes</th>
              <th className="py-2">Checked By</th>
              <th className="py-2">Date</th>
              <th className="py-2"></th>
            </tr>
          </thead>
          <tbody>
            {(checks || []).map((c: any) => (
              <tr key={c.id} className="border-b border-slate-100">
                <td className="py-2 font-medium">{jobLabel(c.production_job)}</td>
                <td className="py-2">
                  <span className={"rounded-full px-2 py-0.5 text-xs font-medium " + resultBadge(c.result)}>{c.result}</span>
                </td>
                <td className="py-2 text-slate-600">{c.notes || "-"}</td>
                <td className="py-2 text-slate-600">{c.checked_by_user?.full_name || "-"}</td>
                <td className="py-2 text-slate-600">{new Date(c.created_at).toLocaleString("en-IN")}</td>
                <td className="py-2">
                  {(c.result === "fail" || c.result === "reprocess") && (
                    <details className="relative">
                      <summary className="cursor-pointer list-none text-xs font-medium text-blue-600">+ Reprocess</summary>
                      <form
                        action={createReprocess}
                        className="absolute right-0 z-10 mt-2 w-72 space-y-3 rounded-md border border-slate-200 bg-white p-4 shadow-lg"
                      >
                        <input type="hidden" name="quality_check_id" value={c.id} />
                        <div>
                          <label className="block text-xs font-medium text-slate-500">Reason</label>
                          <textarea name="reason" required rows={2} className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm" placeholder="e.g. Re-wash required for stain" />
                        </div>
                        <button type="submit" className="w-full rounded-md bg-slate-900 py-1.5 text-sm font-medium text-white">
                          Create Reprocess Entry
                        </button>
                      </form>
                    </details>
                  )}
                </td>
              </tr>
            ))}
            {(!checks || checks.length === 0) && (
              <tr>
                <td colSpan={6} className="py-4 text-center text-slate-400">
                  No QC entries yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-5">
        <h2 className="mb-4 text-lg font-semibold">Reprocess Log</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="py-2">Job</th>
              <th className="py-2">Reason</th>
              <th className="py-2">Logged</th>
            </tr>
          </thead>
          <tbody>
            {(reprocesses || []).map((r: any) => (
              <tr key={r.id} className="border-b border-slate-100">
                <td className="py-2 font-medium">{jobLabel(r.quality_check?.production_job)}</td>
                <td className="py-2 text-slate-600">{r.reason}</td>
                <td className="py-2 text-slate-600">{new Date(r.created_at).toLocaleString("en-IN")}</td>
              </tr>
            ))}
            {(!reprocesses || reprocesses.length === 0) && (
              <tr>
                <td colSpan={3} className="py-4 text-center text-slate-400">
                  No reprocess entries yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
