import { createClient } from "@/lib/supabase/server";
import { createFamilyAccount, assignCustomerToFamily, createWorkstation, toggleWorkstationActive } from "./actions";

export default async function FamilyPage() {
  const supabase = createClient();

  const [{ data: families }, { data: customers }, { data: workstations }, { data: stages }] =
    await Promise.all([
      supabase.from("family_account").select("*").order("created_at", { ascending: false }),
      supabase.from("customer").select("id, full_name, family_account_id"),
      supabase.from("workstation").select("*").order("created_at", { ascending: false }),
      supabase.from("workflow_stage").select("id, name"),
    ]);

  const customerName = new Map((customers || []).map((c: any) => [c.id, c.full_name]));
  const stageName = new Map((stages || []).map((s: any) => [s.id, s.name]));
  const membersByFamily = new Map<string, any[]>();
  (customers || []).forEach((c: any) => {
    if (!c.family_account_id) return;
    const list = membersByFamily.get(c.family_account_id) || [];
    list.push(c);
    membersByFamily.set(c.family_account_id, list);
  });

  return (
    <div className="space-y-8">
      <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-accent">Operations</div>
      <h1 className="mb-6 font-archivo text-2xl font-extrabold text-ink">Family Accounts & Workstations</h1>
      <p className="mb-6 -mt-4 text-sm text-ink/60">
        Group household customers together and manage production workstations.
      </p>

      <section className="border-2 border-black/10 bg-white p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-archivo text-lg font-bold text-ink">Family Accounts</h2>
          <details className="relative">
            <summary className="cursor-pointer list-none rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white">
              + New Family Account
            </summary>
            <form
              action={createFamilyAccount}
              className="absolute right-0 z-10 mt-2 w-80 space-y-3 border-2 border-black/10 bg-white p-4"
            >
              <div>
                <label className="block text-xs font-medium text-slate-500">Family name</label>
                <input
                  name="name"
                  required
                  placeholder="e.g. The Menon Family"
                  className="mt-1 w-full border border-black/10 px-2 py-1.5 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500">Primary customer</label>
                <select name="primary_customer_id" className="mt-1 w-full border border-black/10 px-2 py-1.5 text-sm">
                  <option value="">Not set</option>
                  {(customers || []).map((c: any) => (
                    <option key={c.id} value={c.id}>
                      {c.full_name}
                    </option>
                  ))}
                </select>
              </div>
              <button type="submit" className="w-full rounded-md bg-slate-900 py-1.5 text-sm font-medium text-white">
                Create Family Account
              </button>
            </form>
          </details>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b-2 border-black/10 text-left text-[11px] uppercase tracking-wide text-ink/50">
              <th className="py-2">Family</th>
              <th className="py-2">Primary Customer</th>
              <th className="py-2">Members</th>
              <th className="py-2">Date</th>
            </tr>
          </thead>
          <tbody>
            {(families || []).map((f: any) => (
              <tr key={f.id} className="border-b border-black/5">
                <td className="py-2 font-medium">{f.name}</td>
                <td className="py-2 text-slate-600">{f.primary_customer_id ? customerName.get(f.primary_customer_id) : "-"}</td>
                <td className="py-2 text-slate-600">
                  {(membersByFamily.get(f.id) || []).map((m: any) => m.full_name).join(", ") || "-"}
                </td>
                <td className="py-2 text-slate-500">{new Date(f.created_at).toLocaleDateString()}</td>
              </tr>
            ))}
            {(!families || families.length === 0) && (
              <tr>
                <td colSpan={4} className="py-4 text-center text-slate-400">
                  No family accounts yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <section className="border-2 border-black/10 bg-white p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-archivo text-lg font-bold text-ink">Assign Customer to Family</h2>
          <details className="relative">
            <summary className="cursor-pointer list-none rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white">
              + Assign
            </summary>
            <form
              action={assignCustomerToFamily}
              className="absolute right-0 z-10 mt-2 w-80 space-y-3 border-2 border-black/10 bg-white p-4"
            >
              <div>
                <label className="block text-xs font-medium text-slate-500">Customer</label>
                <select name="customer_id" required className="mt-1 w-full border border-black/10 px-2 py-1.5 text-sm">
                  <option value="">Select customer</option>
                  {(customers || []).map((c: any) => (
                    <option key={c.id} value={c.id}>
                      {c.full_name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500">Family account</label>
                <select name="family_account_id" required className="mt-1 w-full border border-black/10 px-2 py-1.5 text-sm">
                  <option value="">Select family</option>
                  {(families || []).map((f: any) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                </select>
              </div>
              <button type="submit" className="w-full rounded-md bg-slate-900 py-1.5 text-sm font-medium text-white">
                Assign
              </button>
            </form>
          </details>
        </div>
        <p className="text-sm text-slate-400">Members currently shown per family account above.</p>
      </section>

      <section className="border-2 border-black/10 bg-white p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-archivo text-lg font-bold text-ink">Workstations</h2>
          <details className="relative">
            <summary className="cursor-pointer list-none rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white">
              + New Workstation
            </summary>
            <form
              action={createWorkstation}
              className="absolute right-0 z-10 mt-2 w-80 space-y-3 border-2 border-black/10 bg-white p-4"
            >
              <div>
                <label className="block text-xs font-medium text-slate-500">Workstation name</label>
                <input
                  name="name"
                  required
                  placeholder="e.g. Press Station 1"
                  className="mt-1 w-full border border-black/10 px-2 py-1.5 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500">Workflow stage (optional)</label>
                <select name="workflow_stage_id" className="mt-1 w-full border border-black/10 px-2 py-1.5 text-sm">
                  <option value="">Not linked</option>
                  {(stages || []).map((s: any) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
              <button type="submit" className="w-full rounded-md bg-slate-900 py-1.5 text-sm font-medium text-white">
                Create Workstation
              </button>
            </form>
          </details>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b-2 border-black/10 text-left text-[11px] uppercase tracking-wide text-ink/50">
              <th className="py-2">Name</th>
              <th className="py-2">Workflow Stage</th>
              <th className="py-2">Status</th>
              <th className="py-2"></th>
            </tr>
          </thead>
          <tbody>
            {(workstations || []).map((w: any) => (
              <tr key={w.id} className="border-b border-black/5">
                <td className="py-2 font-medium">{w.name}</td>
                <td className="py-2 text-slate-600">{w.workflow_stage_id ? stageName.get(w.workflow_stage_id) : "-"}</td>
                <td className="py-2 text-slate-600">
                  <span
                    className={
                      "px-2 py-0.5 text-xs font-semibold uppercase tracking-wide " +
                      (w.is_active ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500")
                    }
                  >
                    {w.is_active ? "Active" : "Inactive"}
                  </span>
                </td>
                <td className="py-2">
                  <form action={toggleWorkstationActive}>
                    <input type="hidden" name="id" value={w.id} />
                    <input type="hidden" name="next_active" value={w.is_active ? "false" : "true"} />
                    <button type="submit" className="text-xs font-medium text-blue-600">
                      {w.is_active ? "Deactivate" : "Activate"}
                    </button>
                  </form>
                </td>
              </tr>
            ))}
            {(!workstations || workstations.length === 0) && (
              <tr>
                <td colSpan={4} className="py-4 text-center text-slate-400">
                  No workstations yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
