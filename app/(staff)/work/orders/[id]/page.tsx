import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireStaff } from "@/lib/staff/session";
import { loadStages } from "@/lib/staff/flow";
import { fmtDateTime } from "@/lib/time";
import { handOverAction } from "../../actions";
import { Card, Chip, Notice, STATUS_LABEL, StaffShell, btn, unreadCount } from "../../ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Order · London Wash Staff" };

const one = (x: any) => (Array.isArray(x) ? x[0] : x);
const EVENT: Record<string, string> = { stage_started: "started", stage_finished: "finished", stage_skipped: "skipped", stage_change: "moved to" };

export default async function StaffOrderPage({ params, searchParams }: { params: { id: string }; searchParams: { error?: string; done?: string } }) {
  const { me, db } = await requireStaff();
  if (me.app_role === "driver") redirect("/work/runs");
  const { data } = await db
    .from("order")
    .select("id, order_number, status, created_at, branch_id, customer:customer_id(full_name, phone)")
    .eq("id", params.id)
    .maybeSingle();
  const o = data as any;
  if (!o || o.branch_id !== me.branch_id) notFound();
  const [stages, unread, { data: items }] = await Promise.all([
    loadStages(db),
    unreadCount(db, me.id),
    db.from("order_item").select("id, quantity, notes, service:service_id(name), item:item_id(name)").eq("order_id", o.id).order("created_at"),
  ]);
  const itemRows = (items ?? []) as any[];
  const itemIds = itemRows.map((i) => i.id);
  const { data: gs } = itemIds.length
    ? await db.from("garment").select("id, tag_code, current_stage_id, stage_state, order_item_id, item:item_id(name)").in("order_item_id", itemIds).order("created_at").order("id")
    : { data: [] };
  const garments = (gs ?? []) as any[];
  const { data: ev } = garments.length
    ? await db
        .from("garment_event")
        .select("id, event_type, created_at, metadata, to_stage_id, garment_id, actor:actor_employee_id(full_name)")
        .in("garment_id", garments.map((g) => g.id))
        .order("created_at", { ascending: false })
        .limit(25)
    : { data: [] };
  const events = (ev ?? []) as any[];
  const stageName = (id: string | null) => stages.find((s) => s.id === id)?.name ?? "—";
  const tagOf = new Map(garments.map((g) => [g.id, g.tag_code] as [string, string]));
  const itemName = (oi: any) => one(oi?.item)?.name ?? "Item";
  const c = one(o.customer);

  return (
    <StaffShell role={me.app_role} back="/work/orders" title={o.order_number} unread={unread}>
      {searchParams.error && <Notice tone="danger">{searchParams.error}</Notice>}
      {searchParams.done === "handover" && <Notice tone="ok">Handed over. The customer&apos;s points are now in their wallet.</Notice>}

      <Card className="flex flex-col gap-2 p-4">
        <div className="flex items-center justify-between gap-2">
          <b className="text-[17px]">{c?.full_name ?? "Customer"}</b>
          <Chip tone={o.status === "ready" ? "ok" : o.status === "cancelled" ? "danger" : "brass"}>{STATUS_LABEL[o.status] ?? o.status}</Chip>
        </div>
        <span className="text-[13px] text-ink-2">Placed {fmtDateTime(o.created_at)} · {garments.length} garments</span>
        {me.app_role === "receptionist" && c?.phone && (
          <a href={`tel:${c.phone}`} className="text-[14px] font-semibold text-[#2b5584]">
            Call {c.phone}
          </a>
        )}
      </Card>

      {me.app_role === "receptionist" && o.status === "ready" && (
        <form action={handOverAction}>
          <input type="hidden" name="order_id" value={o.id} />
          <button type="submit" className={btn + " w-full"}>
            Hand over to customer
          </button>
          <p className="mt-2 text-center text-[12px] text-ink-2">For collection at the counter. This marks the order delivered.</p>
        </form>
      )}

      <section className="flex flex-col gap-2">
        <h2 className="text-[15px] font-semibold">Garments</h2>
        {garments.length ? (
          <Card>
            <ul className="divide-y divide-hair">
              {garments.map((g) => {
                const oi = itemRows.find((i) => i.id === g.order_item_id);
                return (
                  <li key={g.id} className="flex items-center gap-3 px-4 py-2.5 text-[13.5px]">
                    <span className="min-w-0 flex-1">
                      <b className="block truncate">{one(g.item)?.name ?? itemName(oi)}</b>
                      <span className="text-[12px] text-ink-2">
                        <span className="font-mono">#{g.tag_code}</span> · {one(oi?.service)?.name ?? ""}
                      </span>
                    </span>
                    <span className="text-right">
                      <span className="block text-[12.5px] font-semibold">{stageName(g.current_stage_id)}</span>
                      <span className={"text-[11.5px] " + (g.stage_state === "in_progress" ? "text-[#2b5584]" : "text-ink-3")}>
                        {g.stage_state === "in_progress" ? "in progress" : "waiting"}
                      </span>
                    </span>
                  </li>
                );
              })}
            </ul>
          </Card>
        ) : (
          <Card className="p-4 text-[13.5px] text-ink-2">
            This order has no garment tags. Ask the office to create and print tags from the console order page.
          </Card>
        )}
      </section>

      {itemRows.some((i) => i.notes) && (
        <section className="flex flex-col gap-2">
          <h2 className="text-[15px] font-semibold">Notes</h2>
          <Card className="p-4 text-[13.5px]">
            <ul className="list-disc pl-5">
              {itemRows.filter((i) => i.notes).map((i) => (
                <li key={i.id}>
                  {itemName(i)}: {i.notes}
                </li>
              ))}
            </ul>
          </Card>
        </section>
      )}

      {events.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-[15px] font-semibold">Recent activity</h2>
          <Card>
            <ul className="divide-y divide-hair">
              {events.map((e) => (
                <li key={e.id} className="px-4 py-2.5 text-[13px]">
                  <b>{one(e.actor)?.full_name ?? e.metadata?.by ?? "System"}</b> {EVENT[e.event_type] ?? e.event_type}{" "}
                  {e.event_type === "stage_change" ? stageName(e.to_stage_id) : e.metadata?.stage ? stages.find((s) => s.code === e.metadata.stage)?.name ?? "" : ""}
                  <span className="text-ink-2"> · #{tagOf.get(e.garment_id)}</span>
                  <span className="block text-[11.5px] text-ink-3">{fmtDateTime(e.created_at)}</span>
                </li>
              ))}
            </ul>
          </Card>
        </section>
      )}

      <Link href="/work/scan" className={btn}>
        Scan a garment
      </Link>
    </StaffShell>
  );
}
