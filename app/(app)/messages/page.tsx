import { createClient } from "@/lib/supabase/server";
import { logMessage, sendNotification, updateNotificationStatus } from "./actions";

const channels = ["whatsapp", "sms", "email", "push"];
const directions = ["inbound", "outbound"];
const statuses = ["queued", "sent", "delivered", "failed"];

export default async function MessagesPage() {
  const supabase = createClient();

  const [{ data: messages }, { data: notifications }, { data: customers }, { data: users }] =
    await Promise.all([
      supabase.from("message").select("*").order("created_at", { ascending: false }).limit(50),
      supabase.from("notification").select("*").order("id", { ascending: false }).limit(50),
      supabase.from("customer").select("id, full_name"),
      supabase.from("user").select("id, full_name"),
    ]);

  const customerName = new Map((customers || []).map((c: any) => [c.id, c.full_name]));
  const userName = new Map((users || []).map((u: any) => [u.id, u.full_name]));

  return (
    <div className="space-y-8">
      <div>
        <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-accent">Customer-facing</div>
        <h1 className="mb-6 font-archivo text-2xl font-extrabold text-ink">Messages & Notifications</h1>
        <p className="mb-6 -mt-4 text-sm text-ink/60">Customer conversation log and system notification queue.</p>
      </div>

      <section className="border-2 border-black/10 bg-white p-5">
        <div className="mb-4 flex items-center justify-between border-b-2 border-black/10 pb-3">
          <h2 className="font-archivo text-[13.5px] font-bold text-ink">Messages</h2>
          <details className="relative">
            <summary className="cursor-pointer list-none rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white">
              + Log Message
            </summary>
            <form
              action={logMessage}
              className="absolute right-0 z-10 mt-2 w-80 space-y-3 border-2 border-black/10 bg-white p-4"
            >
              <div>
                <label className="block text-xs font-medium text-slate-500">Customer</label>
                <select name="customer_id" required className="mt-1 w-full border border-black/10 px-3 py-2 text-[13px]">
                  <option value="">Select customer</option>
                  {(customers || []).map((c: any) => (
                    <option key={c.id} value={c.id}>
                      {c.full_name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-medium text-slate-500">Channel</label>
                  <select name="channel" required className="mt-1 w-full border border-black/10 px-3 py-2 text-[13px]">
                    {channels.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500">Direction</label>
                  <select name="direction" required className="mt-1 w-full border border-black/10 px-3 py-2 text-[13px]">
                    {directions.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500">Message</label>
                <textarea name="body" required rows={3} className="mt-1 w-full border border-black/10 px-3 py-2 text-[13px]" />
              </div>
              <button type="submit" className="w-full rounded-md bg-slate-900 py-1.5 text-sm font-medium text-white">
                Save Message
              </button>
            </form>
          </details>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b-2 border-black/10 text-left text-[11px] uppercase tracking-wide text-ink/50">
              <th className="py-2">Customer</th>
              <th className="py-2">Channel</th>
              <th className="py-2">Direction</th>
              <th className="py-2">Message</th>
              <th className="py-2">Date</th>
            </tr>
          </thead>
          <tbody>
            {(messages || []).map((m: any) => (
              <tr key={m.id} className="border-b border-black/5">
                <td className="py-2 font-medium">{customerName.get(m.customer_id) || "-"}</td>
                <td className="py-2 text-slate-600 capitalize">{m.channel}</td>
                <td className="py-2 text-slate-600 capitalize">{m.direction}</td>
                <td className="py-2 text-slate-600">{m.body}</td>
                <td className="py-2 text-slate-500">{new Date(m.created_at).toLocaleString()}</td>
              </tr>
            ))}
            {(!messages || messages.length === 0) && (
              <tr>
                <td colSpan={5} className="py-4 text-center text-slate-400">
                  No messages logged yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <section className="border-2 border-black/10 bg-white p-5">
        <div className="mb-4 flex items-center justify-between border-b-2 border-black/10 pb-3">
          <h2 className="font-archivo text-[13.5px] font-bold text-ink">Notifications</h2>
          <details className="relative">
            <summary className="cursor-pointer list-none rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white">
              + Send Notification
            </summary>
            <form
              action={sendNotification}
              className="absolute right-0 z-10 mt-2 w-80 space-y-3 border-2 border-black/10 bg-white p-4"
            >
              <div>
                <label className="block text-xs font-medium text-slate-500">Customer (optional)</label>
                <select name="customer_id" className="mt-1 w-full border border-black/10 px-3 py-2 text-[13px]">
                  <option value="">None</option>
                  {(customers || []).map((c: any) => (
                    <option key={c.id} value={c.id}>
                      {c.full_name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500">Staff user (optional)</label>
                <select name="user_id" className="mt-1 w-full border border-black/10 px-3 py-2 text-[13px]">
                  <option value="">None</option>
                  {(users || []).map((u: any) => (
                    <option key={u.id} value={u.id}>
                      {u.full_name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500">Channel</label>
                <select name="channel" required className="mt-1 w-full border border-black/10 px-3 py-2 text-[13px]">
                  {channels.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500">Template code</label>
                <input
                  name="template_code"
                  required
                  placeholder="e.g. order_ready, pickup_reminder"
                  className="mt-1 w-full border border-black/10 px-3 py-2 text-[13px]"
                />
              </div>
              <button type="submit" className="w-full rounded-md bg-slate-900 py-1.5 text-sm font-medium text-white">
                Queue Notification
              </button>
            </form>
          </details>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b-2 border-black/10 text-left text-[11px] uppercase tracking-wide text-ink/50">
              <th className="py-2">Recipient</th>
              <th className="py-2">Channel</th>
              <th className="py-2">Template</th>
              <th className="py-2">Status</th>
              <th className="py-2">Update</th>
            </tr>
          </thead>
          <tbody>
            {(notifications || []).map((n: any) => (
              <tr key={n.id} className="border-b border-black/5">
                <td className="py-2 font-medium">
                  {n.customer_id ? customerName.get(n.customer_id) : n.user_id ? userName.get(n.user_id) : "-"}
                </td>
                <td className="py-2 text-slate-600 capitalize">{n.channel}</td>
                <td className="py-2 text-slate-600">{n.template_code}</td>
                <td className="py-2 text-slate-600">
                  <span
                    className={
                      "px-2 py-0.5 text-xs font-medium uppercase tracking-wide " +
                      (n.status === "delivered"
                        ? "bg-emerald-100 text-emerald-700"
                        : n.status === "failed"
                        ? "bg-red-100 text-red-700"
                        : n.status === "sent"
                        ? "bg-blue-100 text-blue-700"
                        : "bg-amber-100 text-amber-700")
                    }
                  >
                    {n.status}
                  </span>
                </td>
                <td className="py-2">
                  <form action={updateNotificationStatus} className="flex items-center gap-1">
                    <input type="hidden" name="id" value={n.id} />
                    <select name="status" defaultValue={n.status} className="border border-black/10 px-1 py-1 text-xs">
                      {statuses.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                    <button type="submit" className="text-xs font-medium text-blue-600">
                      Save
                    </button>
                  </form>
                </td>
              </tr>
            ))}
            {(!notifications || notifications.length === 0) && (
              <tr>
                <td colSpan={5} className="py-4 text-center text-slate-400">
                  No notifications yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
