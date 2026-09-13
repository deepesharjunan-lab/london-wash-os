import { createClient } from "@/lib/supabase/server";
import { createCorporateAccount, toggleCorporateActive, createCorporateAddress, createCorporateContact } from "./actions";

export default async function CorporatePage() {
  const supabase = createClient();

  const [{ data: accounts }, { data: addresses }, { data: contacts }] = await Promise.all([
    supabase.from("corporate_account").select("*").order("created_at", { ascending: false }),
    supabase.from("corporate_address").select("*").order("created_at", { ascending: false }),
    supabase.from("corporate_contact").select("*").order("created_at", { ascending: false }),
  ]);

  const accountName = new Map((accounts || []).map((a: any) => [a.id, a.name]));

  return (
    <div className="space-y-8">
      <div>
        <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-accent">Sales</div>
        <h1 className="mb-6 font-archivo text-2xl font-extrabold text-ink">Corporate Accounts</h1>
        <p className="mb-6 -mt-4 text-sm text-ink/60">B2B customer accounts, billing addresses, and contacts.</p>
      </div>

      <section className="border-2 border-black/10 bg-white p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Accounts</h2>
          <details className="relative">
            <summary className="cursor-pointer list-none rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white">
              + Add Account
            </summary>
            <form
              action={createCorporateAccount}
              className="absolute right-0 z-10 mt-2 w-80 space-y-3 border-2 border-black/10 bg-white p-4"
            >
              <div>
                <label className="block text-xs font-medium text-slate-500">Company name</label>
                <input
                  name="name"
                  required
                  placeholder="e.g. Taj Hotels Kochi"
                  className="mt-1 w-full border border-black/10 px-2 py-1.5 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500">GSTIN (optional)</label>
                <input name="gstin" className="mt-1 w-full border border-black/10 px-2 py-1.5 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500">Billing cycle (optional)</label>
                <input
                  name="billing_cycle"
                  placeholder="e.g. weekly, monthly"
                  className="mt-1 w-full border border-black/10 px-2 py-1.5 text-sm"
                />
              </div>
              <button type="submit" className="w-full rounded-md bg-slate-900 py-1.5 text-sm font-medium text-white">
                Save Account
              </button>
            </form>
          </details>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b-2 border-black/10 text-left text-[11px] uppercase tracking-wide text-ink/50">
              <th className="py-2">Name</th>
              <th className="py-2">GSTIN</th>
              <th className="py-2">Billing Cycle</th>
              <th className="py-2">Status</th>
              <th className="py-2"></th>
            </tr>
          </thead>
          <tbody>
            {(accounts || []).map((a: any) => (
              <tr key={a.id} className="border-b border-black/5">
                <td className="py-2 font-medium">{a.name}</td>
                <td className="py-2 text-slate-600">{a.gstin || "-"}</td>
                <td className="py-2 text-slate-600">{a.billing_cycle || "-"}</td>
                <td className="py-2 text-slate-600">
                  <span
                    className={
                      "px-2 py-0.5 text-xs font-medium uppercase tracking-wide " +
                      (a.is_active ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500")
                    }
                  >
                    {a.is_active ? "Active" : "Inactive"}
                  </span>
                </td>
                <td className="py-2">
                  <form action={toggleCorporateActive}>
                    <input type="hidden" name="id" value={a.id} />
                    <input type="hidden" name="next_active" value={a.is_active ? "false" : "true"} />
                    <button type="submit" className="text-xs font-medium text-blue-600">
                      {a.is_active ? "Deactivate" : "Activate"}
                    </button>
                  </form>
                </td>
              </tr>
            ))}
            {(!accounts || accounts.length === 0) && (
              <tr>
                <td colSpan={5} className="py-4 text-center text-slate-400">
                  No corporate accounts yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <section className="border-2 border-black/10 bg-white p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Billing Addresses</h2>
          <details className="relative">
            <summary className="cursor-pointer list-none rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white">
              + Add Address
            </summary>
            <form
              action={createCorporateAddress}
              className="absolute right-0 z-10 mt-2 w-80 space-y-3 border-2 border-black/10 bg-white p-4"
            >
              <div>
                <label className="block text-xs font-medium text-slate-500">Account</label>
                <select name="corporate_account_id" required className="mt-1 w-full border border-black/10 px-2 py-1.5 text-sm">
                  <option value="">Select account</option>
                  {(accounts || []).map((a: any) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500">Label (optional)</label>
                <input name="label" placeholder="e.g. Head Office" className="mt-1 w-full border border-black/10 px-2 py-1.5 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500">Address line</label>
                <textarea name="address_line" required rows={2} className="mt-1 w-full border border-black/10 px-2 py-1.5 text-sm" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-medium text-slate-500">City</label>
                  <input name="city" className="mt-1 w-full border border-black/10 px-2 py-1.5 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500">State</label>
                  <input name="state" className="mt-1 w-full border border-black/10 px-2 py-1.5 text-sm" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500">Pincode</label>
                <input name="pincode" className="mt-1 w-full border border-black/10 px-2 py-1.5 text-sm" />
              </div>
              <button type="submit" className="w-full rounded-md bg-slate-900 py-1.5 text-sm font-medium text-white">
                Save Address
              </button>
            </form>
          </details>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b-2 border-black/10 text-left text-[11px] uppercase tracking-wide text-ink/50">
              <th className="py-2">Account</th>
              <th className="py-2">Label</th>
              <th className="py-2">Address</th>
              <th className="py-2">City</th>
              <th className="py-2">State</th>
              <th className="py-2">Pincode</th>
            </tr>
          </thead>
          <tbody>
            {(addresses || []).map((ad: any) => (
              <tr key={ad.id} className="border-b border-black/5">
                <td className="py-2 font-medium">{accountName.get(ad.corporate_account_id) || "-"}</td>
                <td className="py-2 text-slate-600">{ad.label || "-"}</td>
                <td className="py-2 text-slate-600">{ad.address_line}</td>
                <td className="py-2 text-slate-600">{ad.city || "-"}</td>
                <td className="py-2 text-slate-600">{ad.state || "-"}</td>
                <td className="py-2 text-slate-600">{ad.pincode || "-"}</td>
              </tr>
            ))}
            {(!addresses || addresses.length === 0) && (
              <tr>
                <td colSpan={6} className="py-4 text-center text-slate-400">
                  No addresses yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <section className="border-2 border-black/10 bg-white p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Contacts</h2>
          <details className="relative">
            <summary className="cursor-pointer list-none rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white">
              + Add Contact
            </summary>
            <form
              action={createCorporateContact}
              className="absolute right-0 z-10 mt-2 w-80 space-y-3 border-2 border-black/10 bg-white p-4"
            >
              <div>
                <label className="block text-xs font-medium text-slate-500">Account</label>
                <select name="corporate_account_id" required className="mt-1 w-full border border-black/10 px-2 py-1.5 text-sm">
                  <option value="">Select account</option>
                  {(accounts || []).map((a: any) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500">Full name</label>
                <input name="full_name" required className="mt-1 w-full border border-black/10 px-2 py-1.5 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500">Phone</label>
                <input name="phone" className="mt-1 w-full border border-black/10 px-2 py-1.5 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500">Email</label>
                <input type="email" name="email" className="mt-1 w-full border border-black/10 px-2 py-1.5 text-sm" />
              </div>
              <div className="flex items-center gap-2">
                <input type="checkbox" name="is_primary" value="true" id="is_primary" className="rounded" />
                <label htmlFor="is_primary" className="text-xs font-medium text-slate-500">
                  Primary contact
                </label>
              </div>
              <button type="submit" className="w-full rounded-md bg-slate-900 py-1.5 text-sm font-medium text-white">
                Save Contact
              </button>
            </form>
          </details>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b-2 border-black/10 text-left text-[11px] uppercase tracking-wide text-ink/50">
              <th className="py-2">Account</th>
              <th className="py-2">Name</th>
              <th className="py-2">Phone</th>
              <th className="py-2">Email</th>
              <th className="py-2">Primary</th>
            </tr>
          </thead>
          <tbody>
            {(contacts || []).map((c: any) => (
              <tr key={c.id} className="border-b border-black/5">
                <td className="py-2 font-medium">{accountName.get(c.corporate_account_id) || "-"}</td>
                <td className="py-2 text-slate-600">{c.full_name}</td>
                <td className="py-2 text-slate-600">{c.phone || "-"}</td>
                <td className="py-2 text-slate-600">{c.email || "-"}</td>
                <td className="py-2 text-slate-600">{c.is_primary ? "Yes" : "-"}</td>
              </tr>
            ))}
            {(!contacts || contacts.length === 0) && (
              <tr>
                <td colSpan={5} className="py-4 text-center text-slate-400">
                  No contacts yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
