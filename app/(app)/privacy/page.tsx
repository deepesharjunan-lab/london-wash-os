import { createClient } from "@/lib/supabase/server";
import {
  createConsentRecord,
  createDataRightsRequest,
  updateDataRightsRequestStatus,
  addAnonymisationNote,
} from "./actions";

export default async function PrivacyPage() {
  const supabase = createClient();

  const [{ data: customers }, { data: consentRecords }, { data: dataRightsRequests }] = await Promise.all([
    supabase.from("customer").select("id, full_name, phone").order("full_name").limit(500),
    supabase
      .from("consent_record")
      .select("*, customer:customer_id(full_name, phone)")
      .order("captured_at", { ascending: false })
      .limit(100),
    supabase
      .from("data_rights_request")
      .select("*, customer:customer_id(full_name, phone)")
      .order("requested_at", { ascending: false })
      .limit(100),
  ]);

  return (
    <div className="space-y-8">
      <div>
        <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-accent">Customer-facing</div>
        <h1 className="mb-6 font-archivo text-2xl font-extrabold text-ink">Consent & Data Rights</h1>
        <p className="mb-6 -mt-4 text-sm text-ink/60">Customer consent records and GDPR-style data rights requests.</p>
      </div>

      <section className="border-2 border-black/10 bg-white p-5">
        <div className="mb-4 flex items-center justify-between border-b-2 border-black/10 pb-3">
          <h2 className="font-archivo text-[13.5px] font-bold text-ink">Consent Records</h2>
          <details className="relative">
            <summary className="cursor-pointer list-none rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white">
              + Log Consent
            </summary>
            <form
              action={createConsentRecord}
              className="absolute right-0 z-10 mt-2 w-80 space-y-3 border-2 border-black/10 bg-white p-4"
            >
              <div>
                <label className="block text-xs font-medium text-slate-500">Customer</label>
                <select name="customer_id" required className="mt-1 w-full border border-black/10 px-3 py-2 text-[13px]">
                  <option value="">Select customer</option>
                  {(customers || []).map((c: any) => (
                    <option key={c.id} value={c.id}>
                      {c.full_name} ({c.phone})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500">Consent type</label>
                <select name="consent_type" required className="mt-1 w-full border border-black/10 px-3 py-2 text-[13px]">
                  <option value="">Select type</option>
                  <option value="marketing_whatsapp">Marketing - WhatsApp</option>
                  <option value="marketing_sms">Marketing - SMS</option>
                  <option value="marketing_email">Marketing - Email</option>
                  <option value="photo_capture">Photo Capture</option>
                  <option value="data_processing">Data Processing</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500">Status</label>
                <select name="status" required className="mt-1 w-full border border-black/10 px-3 py-2 text-[13px]">
                  <option value="">Select status</option>
                  <option value="granted">Granted</option>
                  <option value="withdrawn">Withdrawn</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500">Source</label>
                <select name="source" required className="mt-1 w-full border border-black/10 px-3 py-2 text-[13px]">
                  <option value="">Select source</option>
                  <option value="signup_form">Signup Form</option>
                  <option value="portal_settings">Portal Settings</option>
                  <option value="whatsapp_optin">WhatsApp Opt-in</option>
                  <option value="counter_staff_entry">Counter Staff Entry</option>
                </select>
              </div>
              <button type="submit" className="w-full rounded-md bg-slate-900 py-1.5 text-sm font-medium text-white">
                Save Consent Record
              </button>
            </form>
          </details>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b-2 border-black/10 text-left text-[11px] uppercase tracking-wide text-ink/50">
              <th className="py-2">Customer</th>
              <th className="py-2">Consent Type</th>
              <th className="py-2">Status</th>
              <th className="py-2">Source</th>
              <th className="py-2">Captured</th>
            </tr>
          </thead>
          <tbody>
            {(consentRecords || []).map((r: any) => (
              <tr key={r.id} className="border-b border-black/5">
                <td className="py-2 font-medium">{r.customer?.full_name || "-"}</td>
                <td className="py-2 text-slate-600">{r.consent_type}</td>
                <td className="py-2 text-slate-600">
                  <span
                    className={
                      "px-2 py-0.5 text-xs font-medium uppercase tracking-wide " +
                      (r.status === "granted" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500")
                    }
                  >
                    {r.status}
                  </span>
                </td>
                <td className="py-2 text-slate-600">{r.source}</td>
                <td className="py-2 text-slate-600">{new Date(r.captured_at).toLocaleString("en-IN")}</td>
              </tr>
            ))}
            {(!consentRecords || consentRecords.length === 0) && (
              <tr>
                <td colSpan={5} className="py-4 text-center text-slate-400">
                  No consent records yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
      <section className="border-2 border-black/10 bg-white p-5">
        <div className="mb-4 flex items-center justify-between border-b-2 border-black/10 pb-3">
          <h2 className="font-archivo text-[13.5px] font-bold text-ink">Data Rights Requests</h2>
          <details className="relative">
            <summary className="cursor-pointer list-none rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white">
              + New Request
            </summary>
            <form
              action={createDataRightsRequest}
              className="absolute right-0 z-10 mt-2 w-80 space-y-3 border-2 border-black/10 bg-white p-4"
            >
              <div>
                <label className="block text-xs font-medium text-slate-500">Customer</label>
                <select name="customer_id" required className="mt-1 w-full border border-black/10 px-3 py-2 text-[13px]">
                  <option value="">Select customer</option>
                  {(customers || []).map((c: any) => (
                    <option key={c.id} value={c.id}>
                      {c.full_name} ({c.phone})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500">Request type</label>
                <select name="request_type" required className="mt-1 w-full border border-black/10 px-3 py-2 text-[13px]">
                  <option value="">Select type</option>
                  <option value="export">Export my data</option>
                  <option value="delete">Delete my data</option>
                </select>
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
              <th className="py-2">Customer</th>
              <th className="py-2">Type</th>
              <th className="py-2">Status</th>
              <th className="py-2">Requested</th>
              <th className="py-2">Fulfilled</th>
              <th className="py-2">Note</th>
              <th className="py-2"></th>
            </tr>
          </thead>
          <tbody>
            {(dataRightsRequests || []).map((r: any) => (
              <tr key={r.id} className="border-b border-black/5 align-top">
                <td className="py-2 font-medium">{r.customer?.full_name || "-"}</td>
                <td className="py-2 text-slate-600 capitalize">{r.request_type}</td>
                <td className="py-2">
                  <span
                    className={
                      "px-2 py-0.5 text-xs font-medium uppercase tracking-wide " +
                      (r.status === "fulfilled"
                        ? "bg-emerald-100 text-emerald-700"
                        : r.status === "rejected"
                        ? "bg-red-100 text-red-700"
                        : r.status === "in_progress"
                        ? "bg-amber-100 text-amber-700"
                        : "bg-slate-100 text-slate-500")
                    }
                  >
                    {r.status}
                  </span>
                </td>
                <td className="py-2 text-slate-600">{new Date(r.requested_at).toLocaleString("en-IN")}</td>
                <td className="py-2 text-slate-600">
                  {r.fulfilled_at ? new Date(r.fulfilled_at).toLocaleString("en-IN") : "-"}
                </td>
                <td className="py-2 text-slate-600">{r.anonymisation_note || "-"}</td>
                <td className="py-2">
                  <div className="flex flex-col gap-2">
                    <form action={updateDataRightsRequestStatus} className="flex items-center gap-1">
                      <input type="hidden" name="id" value={r.id} />
                      <select
                        name="status"
                        defaultValue={r.status}
                        className="border border-black/10 px-1.5 py-1 text-xs"
                      >
                        <option value="pending">Pending</option>
                        <option value="in_progress">In Progress</option>
                        <option value="fulfilled">Fulfilled</option>
                        <option value="rejected">Rejected</option>
                      </select>
                      <button type="submit" className="text-xs font-medium text-blue-600">
                        Update
                      </button>
                    </form>
                    <form action={addAnonymisationNote} className="flex items-center gap-1">
                      <input type="hidden" name="id" value={r.id} />
                      <input
                        name="anonymisation_note"
                        placeholder="Note"
                        className="w-24 border border-black/10 px-1.5 py-1 text-xs"
                      />
                      <button type="submit" className="text-xs font-medium text-blue-600">
                        Save
                      </button>
                    </form>
                  </div>
                </td>
              </tr>
            ))}
            {(!dataRightsRequests || dataRightsRequests.length === 0) && (
              <tr>
                <td colSpan={7} className="py-4 text-center text-slate-400">
                  No data rights requests yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
