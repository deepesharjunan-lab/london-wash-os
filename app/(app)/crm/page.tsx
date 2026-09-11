import { createClient } from "@/lib/supabase/server";
import {
  createCustomerNote,
  createCustomerPreference,
  deleteCustomerPreference,
  createCustomerTag,
  deleteCustomerTag,
} from "./actions";

export default async function CrmPage() {
  const supabase = createClient();

  const [{ data: customers }, { data: notes }, { data: preferences }, { data: tags }, { data: users }] =
    await Promise.all([
      supabase.from("customer").select("id, full_name"),
      supabase.from("customer_note").select("*").order("created_at", { ascending: false }).limit(30),
      supabase.from("customer_preference").select("*").order("created_at", { ascending: false }),
      supabase.from("customer_tag").select("*").order("id", { ascending: false }),
      supabase.from("user").select("id, full_name"),
    ]);

  const customerName = new Map((customers || []).map((c: any) => [c.id, c.full_name]));
  const userName = new Map((users || []).map((u: any) => [u.id, u.full_name]));

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Customer Notes, Preferences & Tags</h1>
        <p className="text-slate-500">CRM details for personalized customer care.</p>
      </div>

      <section className="rounded-lg border border-slate-200 bg-white p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Notes</h2>
          <details className="relative">
            <summary className="cursor-pointer list-none rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white">
              + Add Note
            </summary>
            <form
              action={createCustomerNote}
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
                <label className="block text-xs font-medium text-slate-500">Note</label>
                <textarea name="note" required rows={3} className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
              </div>
              <button type="submit" className="w-full rounded-md bg-slate-900 py-1.5 text-sm font-medium text-white">
                Save Note
              </button>
            </form>
          </details>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="py-2">Customer</th>
              <th className="py-2">Note</th>
              <th className="py-2">Author</th>
              <th className="py-2">Date</th>
            </tr>
          </thead>
          <tbody>
            {(notes || []).map((n: any) => (
              <tr key={n.id} className="border-b border-slate-100">
                <td className="py-2 font-medium">{customerName.get(n.customer_id) || "-"}</td>
                <td className="py-2 text-slate-600">{n.note}</td>
                <td className="py-2 text-slate-600">{n.author_user_id ? userName.get(n.author_user_id) : "-"}</td>
                <td className="py-2 text-slate-500">{new Date(n.created_at).toLocaleDateString()}</td>
              </tr>
            ))}
            {(!notes || notes.length === 0) && (
              <tr>
                <td colSpan={4} className="py-4 text-center text-slate-400">
                  No notes yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Care Preferences</h2>
          <details className="relative">
            <summary className="cursor-pointer list-none rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white">
              + Add Preference
            </summary>
            <form
              action={createCustomerPreference}
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
                <label className="block text-xs font-medium text-slate-500">Preference key</label>
                <input
                  name="pref_key"
                  required
                  placeholder="e.g. detergent, starch, fold_style"
                  className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500">Value</label>
                <input
                  name="pref_value"
                  required
                  placeholder="e.g. hypoallergenic, no starch"
                  className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                />
              </div>
              <button type="submit" className="w-full rounded-md bg-slate-900 py-1.5 text-sm font-medium text-white">
                Save Preference
              </button>
            </form>
          </details>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="py-2">Customer</th>
              <th className="py-2">Key</th>
              <th className="py-2">Value</th>
              <th className="py-2"></th>
            </tr>
          </thead>
          <tbody>
            {(preferences || []).map((p: any) => (
              <tr key={p.id} className="border-b border-slate-100">
                <td className="py-2 font-medium">{customerName.get(p.customer_id) || "-"}</td>
                <td className="py-2 text-slate-600">{p.pref_key}</td>
                <td className="py-2 text-slate-600">{p.pref_value}</td>
                <td className="py-2">
                  <form action={deleteCustomerPreference}>
                    <input type="hidden" name="id" value={p.id} />
                    <button type="submit" className="text-xs font-medium text-red-600">
                      Remove
                    </button>
                  </form>
                </td>
              </tr>
            ))}
            {(!preferences || preferences.length === 0) && (
              <tr>
                <td colSpan={4} className="py-4 text-center text-slate-400">
                  No preferences yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Tags</h2>
          <details className="relative">
            <summary className="cursor-pointer list-none rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white">
              + Add Tag
            </summary>
            <form
              action={createCustomerTag}
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
                <label className="block text-xs font-medium text-slate-500">Tag</label>
                <input
                  name="tag"
                  required
                  placeholder="e.g. VIP, frequent, sensitive skin"
                  className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                />
              </div>
              <button type="submit" className="w-full rounded-md bg-slate-900 py-1.5 text-sm font-medium text-white">
                Save Tag
              </button>
            </form>
          </details>
        </div>
        <div className="flex flex-wrap gap-2">
          {(tags || []).map((t: any) => (
            <span
              key={t.id}
              className="flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700"
            >
              {customerName.get(t.customer_id) || "-"}: {t.tag}
              <form action={deleteCustomerTag} className="inline">
                <input type="hidden" name="id" value={t.id} />
                <button type="submit" className="text-slate-400 hover:text-red-600">
                  ×
                </button>
              </form>
            </span>
          ))}
          {(!tags || tags.length === 0) && <p className="text-sm text-slate-400">No tags yet.</p>}
        </div>
      </section>
    </div>
  );
}
