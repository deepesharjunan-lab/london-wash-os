import { createClient } from "@/lib/supabase/server";
import { updateOrganization, createSystemSetting, deleteSystemSetting } from "./actions";

export default async function SystemSettingsPage() {
  const supabase = createClient();

  const { data: organizations } = await supabase.from("organization").select("*").limit(1);
  const org = organizations && organizations[0];

  const { data: settings } = await supabase
    .from("system_setting")
    .select("*")
    .order("created_at", { ascending: false });

  return (
    <div className="space-y-8">
      <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-accent">System</div>
      <h1 className="mb-6 font-archivo text-2xl font-extrabold text-ink">System Settings & Organization</h1>
      <p className="mb-6 -mt-4 text-sm text-ink/60">Organization profile and key/value configuration flags.</p>

      <section className="border-2 border-black/10 bg-white p-5">
        <h2 className="mb-4 border-b-2 border-black/10 pb-3 font-archivo text-[13.5px] font-bold text-ink">Organization Profile</h2>
        {org ? (
          <form action={updateOrganization} className="grid max-w-xl grid-cols-2 gap-3">
            <input type="hidden" name="id" value={org.id} />
            <div>
              <label className="block text-xs font-medium text-slate-500">Name</label>
              <input
                name="name"
                required
                defaultValue={org.name}
                className="mt-1 w-full border border-black/10 px-3 py-2 text-[13px]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500">Legal name</label>
              <input
                name="legal_name"
                defaultValue={org.legal_name || ""}
                className="mt-1 w-full border border-black/10 px-3 py-2 text-[13px]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500">GSTIN</label>
              <input
                name="gstin"
                defaultValue={org.gstin || ""}
                className="mt-1 w-full border border-black/10 px-3 py-2 text-[13px]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500">Default currency</label>
              <input
                name="default_currency"
                required
                maxLength={3}
                defaultValue={org.default_currency}
                className="mt-1 w-full border border-black/10 px-3 py-2 text-[13px]"
              />
            </div>
            <div className="col-span-2">
              <button type="submit" className="rounded-md bg-slate-900 px-4 py-1.5 text-sm font-medium text-white">
                Save Organization
              </button>
            </div>
          </form>
        ) : (
          <p className="text-sm text-slate-400">No organization record found.</p>
        )}
      </section>

      <section className="border-2 border-black/10 bg-white p-5">
        <div className="mb-4 flex items-center justify-between border-b-2 border-black/10 pb-3">
          <h2 className="font-archivo text-[13.5px] font-bold text-ink">System Settings</h2>
          <details className="relative">
            <summary className="cursor-pointer list-none rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white">
              + Add Setting
            </summary>
            <form
              action={createSystemSetting}
              className="absolute right-0 z-10 mt-2 w-80 space-y-3 border-2 border-black/10 bg-white p-4"
            >
              <div>
                <label className="block text-xs font-medium text-slate-500">Key</label>
                <input
                  name="key"
                  required
                  placeholder="e.g. invoice_prefix, sms_enabled"
                  className="mt-1 w-full border border-black/10 px-3 py-2 text-[13px]"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500">Value</label>
                <input
                  name="value"
                  required
                  placeholder='e.g. TLW- or true or 42'
                  className="mt-1 w-full border border-black/10 px-3 py-2 text-[13px]"
                />
                <p className="mt-1 text-xs text-slate-400">Plain text is stored as a string; valid JSON is parsed automatically.</p>
              </div>
              <button type="submit" className="w-full rounded-md bg-slate-900 py-1.5 text-sm font-medium text-white">
                Save Setting
              </button>
            </form>
          </details>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b-2 border-black/10 text-left text-[11px] uppercase tracking-wide text-ink/50">
              <th className="py-2">Key</th>
              <th className="py-2">Value</th>
              <th className="py-2">Scope</th>
              <th className="py-2"></th>
            </tr>
          </thead>
          <tbody>
            {(settings || []).map((s: any) => (
              <tr key={s.id} className="border-b border-black/5">
                <td className="py-2 font-medium">{s.key}</td>
                <td className="py-2 text-slate-600">{JSON.stringify(s.value)}</td>
                <td className="py-2 text-slate-600">{s.branch_id ? "Branch" : "Organization"}</td>
                <td className="py-2">
                  <form action={deleteSystemSetting}>
                    <input type="hidden" name="id" value={s.id} />
                    <button type="submit" className="text-xs font-medium text-red-600">
                      Remove
                    </button>
                  </form>
                </td>
              </tr>
            ))}
            {(!settings || settings.length === 0) && (
              <tr>
                <td colSpan={4} className="py-4 text-center text-slate-400">
                  No settings configured yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
