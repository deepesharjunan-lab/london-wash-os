import Link from "next/link";
import { requireMember } from "@/lib/customer/session";
import { STAGES, stageIndex } from "@/lib/customer/member";
import { inr } from "@/lib/loyalty/engine";
import { AppShell, Card, Notice, btn, fmtDate } from "../ui";
import { pickupEnabled } from "@/lib/site/settings";

export const dynamic = "force-dynamic";
export const metadata = { title: "Orders · The London Wash Club" };

type Order = { id: string; order_number: string; status: string; total_minor: number; created_at: string };

export default async function MemberOrdersPage({ searchParams }: { searchParams: { booked?: string } }) {
  const pickupOn = await pickupEnabled();
  const { customerId, db } = requireMember();
  const [ordersRes, pickupsRes] = await Promise.all([
    db.from("order").select("id, order_number, status, total_minor, created_at").eq("customer_id", customerId).neq("status", "draft").order("created_at", { ascending: false }).limit(100),
    db.from("pickup").select("id, scheduled_window_start, scheduled_window_end, status, services").eq("customer_id", customerId).eq("status", "scheduled").gte("scheduled_window_start", new Date(Date.now() - 864e5).toISOString()).order("scheduled_window_start"),
  ]);
  const orders = (ordersRes.data ?? []) as Order[];
  const active = orders.filter((o) => ["confirmed", "in_production", "ready", "out_for_delivery"].includes(o.status));
  const done = orders.filter((o) => o.status === "delivered" || o.status === "cancelled");
  const pickups = (pickupsRes.data ?? []) as { id: string; scheduled_window_start: string; scheduled_window_end: string; services: string[] | null }[];
  const when = (iso: string) => new Date(iso).toLocaleString("en-IN", { weekday: "short", day: "numeric", month: "short", hour: "numeric", timeZone: "Asia/Kolkata" });

  return (
    <AppShell current="/my/orders" title="Orders">
      {searchParams.booked && <Notice tone="ok"><b>Pickup booked.</b> We&apos;ll collect at the time you chose and confirm your order when we&apos;ve checked your items.</Notice>}

      {pickups.length > 0 && (
        <section className="flex flex-col gap-2.5">
          <h2 className="text-[15px] font-semibold">Upcoming pickups</h2>
          <Card>
            <ul className="divide-y divide-hair">
              {pickups.map((p) => (
                <li key={p.id} className="px-4 py-3">
                  <b className="block text-[14px]">{when(p.scheduled_window_start)}</b>
                  <span className="text-[12.5px] text-ink-2">{(p.services ?? []).join(", ") || "Pickup"}</span>
                </li>
              ))}
            </ul>
          </Card>
        </section>
      )}

      <section className="flex flex-col gap-2.5">
        <h2 className="text-[15px] font-semibold">Active</h2>
        {active.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <h3 className="font-display text-[21px] font-medium">No active orders</h3>
            <p className="max-w-[32ch] text-[14px] text-ink-2">
              {pickupOn ? "When you book a pickup, you can follow every garment from collection to delivery here." : "When you drop off an order at our store, you can follow every garment here until it is ready."}
            </p>
            {pickupOn && <Link href="/my/book" className={btn}>Book a pickup</Link>}
          </div>
        ) : (
          active.map((o) => {
            const idx = stageIndex(o.status);
            return (
              <Link key={o.id} href={`/my/orders/${o.id}`}>
                <Card className="flex flex-col gap-2.5 p-4">
                  <span className="flex items-center justify-between">
                    <span className="font-mono text-[12.5px] text-ink-2">{o.order_number}</span>
                    <span className="text-[12.5px] text-ink-2">{fmtDate(o.created_at)}</span>
                  </span>
                  <b className="text-[15px]">{STAGES[idx]?.label ?? "In progress"}</b>
                  <span className="flex gap-1" aria-hidden="true">
                    {STAGES.map((s, k) => (
                      <i key={s.status} className={"h-[3px] flex-1 rounded " + (k < idx ? "bg-ink" : k === idx ? "bg-brass" : "bg-hair")} />
                    ))}
                  </span>
                </Card>
              </Link>
            );
          })
        )}
      </section>

      {done.length > 0 && (
        <section className="flex flex-col gap-2.5">
          <h2 className="text-[15px] font-semibold">Completed</h2>
          <Card>
            <ul className="divide-y divide-hair">
              {done.map((o) => (
                <li key={o.id}>
                  <Link href={`/my/orders/${o.id}`} className="flex items-center justify-between gap-3 px-4 py-3">
                    <span>
                      <b className="block text-[14px]">{o.order_number}</b>
                      <span className="text-[12.5px] text-ink-2">
                        {fmtDate(o.created_at)} · {o.status === "cancelled" ? "Cancelled" : "Delivered"}
                      </span>
                    </span>
                    <span className="font-semibold tabular-nums">{inr(Number(o.total_minor))}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        </section>
      )}
    </AppShell>
  );
}
