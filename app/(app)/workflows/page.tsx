import { createClient } from "@/lib/supabase/server";
import { createWorkflow, toggleWorkflowActive, createWorkflowStage, deleteWorkflowStage } from "./actions";

export default async function WorkflowsPage() {
  const supabase = createClient();

  const [{ data: workflows }, { data: stages }, { data: services }] = await Promise.all([
    supabase.from("workflow").select("*").order("created_at", { ascending: false }),
    supabase.from("workflow_stage").select("*").order("sort_order", { ascending: true }),
    supabase.from("service").select("id, name"),
  ]);

  const serviceName = new Map((services || []).map((s: any) => [s.id, s.name]));
  const workflowName = new Map((workflows || []).map((w: any) => [w.id, w.name]));
  const stagesByWorkflow = new Map<string, any[]>();
  (stages || []).forEach((s: any) => {
    const list = stagesByWorkflow.get(s.workflow_id) || [];
    list.push(s);
    stagesByWorkflow.set(s.workflow_id, list);
  });

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Workflow & Stages</h1>
        <p className="text-slate-500">Define production workflows and their processing stages.</p>
      </div>

      <section className="rounded-lg border border-slate-200 bg-white p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Workflows</h2>
          <details className="relative">
            <summary className="cursor-pointer list-none rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white">
              + New Workflow
            </summary>
            <form
              action={createWorkflow}
              className="absolute right-0 z-10 mt-2 w-80 space-y-3 rounded-md border border-slate-200 bg-white p-4 shadow-lg"
            >
              <div>
                <label className="block text-xs font-medium text-slate-500">Workflow name</label>
                <input
                  name="name"
                  required
                  placeholder="e.g. Standard Wash & Fold"
                  className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500">Service (optional)</label>
                <select name="service_id" className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm">
                  <option value="">Not linked</option>
                  {(services || []).map((s: any) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
              <button type="submit" className="w-full rounded-md bg-slate-900 py-1.5 text-sm font-medium text-white">
                Create Workflow
              </button>
            </form>
          </details>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="py-2">Name</th>
              <th className="py-2">Service</th>
              <th className="py-2">Stages</th>
              <th className="py-2">Status</th>
              <th className="py-2"></th>
            </tr>
          </thead>
          <tbody>
            {(workflows || []).map((w: any) => (
              <tr key={w.id} className="border-b border-slate-100">
                <td className="py-2 font-medium">{w.name}</td>
                <td className="py-2 text-slate-600">{w.service_id ? serviceName.get(w.service_id) : "-"}</td>
                <td className="py-2 text-slate-600">{(stagesByWorkflow.get(w.id) || []).length}</td>
                <td className="py-2 text-slate-600">
                  <span
                    className={
                      "rounded-full px-2 py-0.5 text-xs font-medium " +
                      (w.is_active ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500")
                    }
                  >
                    {w.is_active ? "Active" : "Inactive"}
                  </span>
                </td>
                <td className="py-2">
                  <form action={toggleWorkflowActive}>
                    <input type="hidden" name="id" value={w.id} />
                    <input type="hidden" name="next_active" value={w.is_active ? "false" : "true"} />
                    <button type="submit" className="text-xs font-medium text-blue-600">
                      {w.is_active ? "Deactivate" : "Activate"}
                    </button>
                  </form>
                </td>
              </tr>
            ))}
            {(!workflows || workflows.length === 0) && (
              <tr>
                <td colSpan={5} className="py-4 text-center text-slate-400">
                  No workflows yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Workflow Stages</h2>
          <details className="relative">
            <summary className="cursor-pointer list-none rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white">
              + New Stage
            </summary>
            <form
              action={createWorkflowStage}
              className="absolute right-0 z-10 mt-2 w-80 space-y-3 rounded-md border border-slate-200 bg-white p-4 shadow-lg"
            >
              <div>
                <label className="block text-xs font-medium text-slate-500">Workflow</label>
                <select name="workflow_id" required className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm">
                  <option value="">Select workflow</option>
                  {(workflows || []).map((w: any) => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500">Stage name</label>
                <input
                  name="name"
                  required
                  placeholder="e.g. Sorting, Washing, Pressing"
                  className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-medium text-slate-500">Sort order</label>
                  <input
                    type="number"
                    name="sort_order"
                    defaultValue={0}
                    className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500">SLA (minutes)</label>
                  <input
                    type="number"
                    name="sla_minutes"
                    placeholder="optional"
                    className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                  />
                </div>
              </div>
              <button type="submit" className="w-full rounded-md bg-slate-900 py-1.5 text-sm font-medium text-white">
                Add Stage
              </button>
            </form>
          </details>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="py-2">Workflow</th>
              <th className="py-2">Stage</th>
              <th className="py-2">Order</th>
              <th className="py-2">SLA</th>
              <th className="py-2"></th>
            </tr>
          </thead>
          <tbody>
            {(stages || []).map((s: any) => (
              <tr key={s.id} className="border-b border-slate-100">
                <td className="py-2 font-medium">{workflowName.get(s.workflow_id) || "-"}</td>
                <td className="py-2 text-slate-600">{s.name}</td>
                <td className="py-2 text-slate-600">{s.sort_order}</td>
                <td className="py-2 text-slate-600">{s.sla_minutes ? s.sla_minutes + " min" : "-"}</td>
                <td className="py-2">
                  <form action={deleteWorkflowStage}>
                    <input type="hidden" name="id" value={s.id} />
                    <button type="submit" className="text-xs font-medium text-red-600">
                      Remove
                    </button>
                  </form>
                </td>
              </tr>
            ))}
            {(!stages || stages.length === 0) && (
              <tr>
                <td colSpan={5} className="py-4 text-center text-slate-400">
                  No stages defined yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
