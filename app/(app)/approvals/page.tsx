import { createClient } from "@/lib/supabase/server";
import { addApprovalRule, toggleApprovalRule } from "./actions";

const ACTION_TYPES = [
  "refund",
  "price_override",
  "order_void",
  "inventory_adjustment",
  "payroll_adjustment",
  "customer_compensation",
  "wallet_adjustment",
];

function formatMinor(minor: number | null) {
  if (minor === null || minor === undefined) return "—";
  return `₹${(minor / 100).toLocaleString("en-IN")}`;
}

function formatDateTime(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Kolkata",
  });
}

export default async function ApprovalsPage() {
  const supabase = createClient();

  const { data: auth } = await supabase.auth.getUser();
  const { data: me } = auth?.user
    ? await supabase
        .from("user")
        .select("id, branch_id")
        .eq("auth_user_id", auth.user.id)
        .single()
    : { data: null };

  const { data: rules } = await supabase
    .from("approval_rule")
    .select(
      "id, action_type, branch_id, threshold_amount_minor, threshold_percent, escalate_after_minutes, is_active"
    )
    .order("action_type", { ascending: true });

  const { data: myRequests } = me
    ? await supabase
        .from("approval_request")
        .select("id, entity_type, status, decided_at, decision_note, created_at")
        .eq("requested_by", me.id)
        .order("created_at", { ascending: false })
        .limit(50)
    : { data: [] };

  return (
    <div className="space-y-6">
      <div>
        <div className="font-archivo text-[11px] font-semibold uppercase tracking-wide text-accent">
          Approvals
        </div>
        <h1 className="mt-1 text-2xl font-semibold text-ink">Approval Rules &amp; Requests</h1>
      </div>

      <div className="rounded-lg border border-black/5 bg-white">
        <div className="border-b border-black/5 px-5 py-3 text-[13px] font-semibold text-ink">
          Approval Rules
        </div>
        <details className="border-b border-black/5">
          <summary className="cursor-pointer select-none px-5 py-3 text-[13px] font-semibold text-accent">
            + Add Rule
          </summary>
          <form
            action={addApprovalRule}
            className="grid grid-cols-1 gap-3 px-5 py-4 sm:grid-cols-2 lg:grid-cols-6"
          >
            <select
              name="action_type"
              required
              defaultValue=""
              className="rounded-md border border-black/10 px-3 py-2 text-[13px] text-ink"
            >
              <option value="">Action type</option>
              {ACTION_TYPES.map((a) => (
                <option key={a} value={a}>
                  {a.replace(/_/g, " ")}
                </option>
              ))}
            </select>
            <input
              name="threshold_amount"
              type="number"
              step="0.01"
              placeholder="Amount above (₹)"
              className="rounded-md border border-black/10 px-3 py-2 text-[13px]"
            />
            <input
              name="threshold_percent"
              type="number"
              step="1"
              placeholder="Percent above (%)"
              className="rounded-md border border-black/10 px-3 py-2 text-[13px]"
            />
            <input
              name="escalate_after_minutes"
              type="number"
              step="1"
              placeholder="Escalate after (min)"
              className="rounded-md border border-black/10 px-3 py-2 text-[13px]"
            />
            <select
              name="scope"
              defaultValue="branch"
              className="rounded-md border border-black/10 px-3 py-2 text-[13px] text-ink"
            >
              <option value="branch">This branch only</option>
              <option value="all">All branches</option>
            </select>
            <button
              type="submit"
              className="rounded-md bg-accent px-4 py-2 text-[13px] font-semibold text-white hover:brightness-110"
            >
              Add
            </button>
          </form>
        </details>
        <table className="w-full text-left text-[13px]">
          <thead className="bg-black/[0.02] text-[11px] uppercase tracking-wide text-ink/50">
            <tr>
              <th className="px-5 py-3 font-medium">Action</th>
              <th className="px-5 py-3 font-medium">Threshold amount</th>
              <th className="px-5 py-3 font-medium">Threshold %</th>
              <th className="px-5 py-3 font-medium">Escalate after</th>
              <th className="px-5 py-3 font-medium">Scope</th>
              <th className="px-5 py-3 font-medium">Status</th>
              <th className="px-5 py-3 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {(!rules || rules.length === 0) && (
              <tr>
                <td colSpan={7} className="px-5 py-8 text-center text-ink/40">
                  No approval rules yet. Add one above to require sign-off above a threshold.
                </td>
              </tr>
            )}
            {(rules ?? []).map((r: any) => (
              <tr key={r.id} className="border-t border-black/5">
                <td className="px-5 py-3 font-medium text-ink capitalize">
                  {String(r.action_type).replace(/_/g, " ")}
                </td>
                <td className="px-5 py-3 text-ink/70">{formatMinor(r.threshold_amount_minor)}</td>
                <td className="px-5 py-3 text-ink/70">
                  {r.threshold_percent !== null ? `${r.threshold_percent}%` : "—"}
                </td>
                <td className="px-5 py-3 text-ink/70">
                  {r.escalate_after_minutes ? `${r.escalate_after_minutes} min` : "—"}
                </td>
                <td className="px-5 py-3 text-ink/70">
                  {r.branch_id ? "This branch" : "All branches"}
                </td>
                <td className="px-5 py-3">
                  <span
                    className={`rounded-full px-2 py-1 text-[11px] font-medium ${
                      r.is_active ? "bg-green-100 text-green-700" : "bg-black/5 text-ink/60"
                    }`}
                  >
                    {r.is_active ? "Active" : "Inactive"}
                  </span>
                </td>
                <td className="px-5 py-3 text-right">
                  <form action={toggleApprovalRule}>
                    <input type="hidden" name="id" value={r.id} />
                    <input
                      type="hidden"
                      name="next_active"
                      value={(!r.is_active).toString()}
                    />
                    <button
                      type="submit"
                      className="rounded-md border border-black/10 px-3 py-1.5 text-[12px] font-semibold text-ink hover:bg-black/[0.03]"
                    >
                      {r.is_active ? "Deactivate" : "Activate"}
                    </button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="rounded-lg border border-black/5 bg-white">
        <div className="border-b border-black/5 px-5 py-3 text-[13px] font-semibold text-ink">
          My Requests
        </div>
        <table className="w-full text-left text-[13px]">
          <thead className="bg-black/[0.02] text-[11px] uppercase tracking-wide text-ink/50">
            <tr>
              <th className="px-5 py-3 font-medium">Entity</th>
              <th className="px-5 py-3 font-medium">Status</th>
              <th className="px-5 py-3 font-medium">Requested</th>
              <th className="px-5 py-3 font-medium">Decided</th>
              <th className="px-5 py-3 font-medium">Note</th>
            </tr>
          </thead>
          <tbody>
            {(!myRequests || myRequests.length === 0) && (
              <tr>
                <td colSpan={5} className="px-5 py-8 text-center text-ink/40">
                  No approval requests yet. These appear automatically when an action exceeds a
                  rule above.
                </td>
              </tr>
            )}
            {(myRequests ?? []).map((r: any) => (
              <tr key={r.id} className="border-t border-black/5">
                <td className="px-5 py-3 font-medium text-ink capitalize">
                  {String(r.entity_type).replace(/_/g, " ")}
                </td>
                <td className="px-5 py-3">
                  <span
                    className={`rounded-full px-2 py-1 text-[11px] font-medium ${
                      r.status === "approved"
                        ? "bg-green-100 text-green-700"
                        : r.status === "rejected"
                        ? "bg-red-100 text-red-700"
                        : "bg-amber-100 text-amber-700"
                    }`}
                  >
                    {r.status}
                  </span>
                </td>
                <td className="px-5 py-3 text-ink/70">{formatDateTime(r.created_at)}</td>
                <td className="px-5 py-3 text-ink/70">{formatDateTime(r.decided_at)}</td>
                <td className="px-5 py-3 text-ink/70">{r.decision_note || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
