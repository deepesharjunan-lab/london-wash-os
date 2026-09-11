import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { advanceOrderStatus } from "./actions";

const COLUMNS: { status: string; label: string; next: string | null; nextLabel: string | null }[] = [
  { status: "confirmed", label: "Confirmed", next: "in_production", nextLabel: "Start production" },
  { status: "in_production", label: "In production", next: "ready", nextLabel: "Mark ready" },
  { status: "ready", label: "Ready", next: "out_for_delivery", nextLabel: "Out for delivery" },
  { status: "out_for_delivery", label: "Out for delivery", next: "delivered", nextLabel: "Mark delivered" },
];

function formatMinor(minor: number) {
  return `₹${(minor / 100).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

export default async function ProductionBoardPage() {
  const supabase = createClient();

  const { data: orders } = await supabase
    .from("order")
    .select("id, order_number, status, total_minor, created_at, customer:customer_id(full_name)")
    .in(
      "status",
      COLUMNS.map((c) => c.status)
    )
    .order("created_at", { ascending: true });

  async function moveOrder(formData: FormData) {
    "use server";
    const orderId = String(formData.get("order_id") || "");
    const nextStatus = String(formData.get("next_status") || "");
    if (!orderId || !nextStatus) return;
    await advanceOrderStatus(orderId, nextStatus);
  }

  return (
    <div>
      <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-accent">Production</div>
      <h1 className="mb-6 font-archivo text-2xl font-extrabold text-ink">Production board</h1>

      <div className="grid gap-4 lg:grid-cols-4">
        {COLUMNS.map((col) => {
          const columnOrders = (orders ?? []).filter((o) => o.status === col.status);
          return (
            <div key={col.status} className="rounded-lg border border-black/5 bg-white shadow-sm">
              <div className="flex items-center justify-between border-b border-black/5 px-4 py-3">
                <span className="text-sm font-bold text-ink">{col.label}</span>
                <span className="rounded-full bg-black/5 px-2 py-0.5 text-xs font-semibold text-ink/50">
                  {columnOrders.length}
                </span>
              </div>
              <div className="space-y-3 p-3">
                {columnOrders.map((o: any) => {
                  const customer = Array.isArray(o.customer) ? o.customer[0] : o.customer;
                  return (
                    <div key={o.id} className="rounded-md border border-black/5 p-3 text-sm shadow-sm">
                      <Link href={`/orders/${o.id}`} className="font-semibold text-ink hover:text-accent">
                        {o.order_number}
                      </Link>
                      <div className="mt-0.5 text-xs text-ink/50">{customer?.full_name ?? "-"}</div>
                      <div className="mt-1 text-xs font-medium text-ink/70">
                        {formatMinor(Number(o.total_minor))}
                      </div>
                      {col.next && (
                        <form action={moveOrder} className="mt-2">
                          <input type="hidden" name="order_id" value={o.id} />
                          <input type="hidden" name="next_status" value={col.next} />
                          <button
                            type="submit"
                            className="w-full rounded-md bg-accent/10 px-2 py-1.5 text-xs font-semibold text-accent hover:bg-accent hover:text-white"
                          >
                            {col.nextLabel} →
                          </button>
                        </form>
                      )}
                    </div>
                  );
                })}
                {columnOrders.length === 0 && (
                  <p className="px-2 py-6 text-center text-xs text-ink/30">No orders here.</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
