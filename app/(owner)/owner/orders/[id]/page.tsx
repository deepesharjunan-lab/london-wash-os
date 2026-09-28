import Link from "next/link";
import { notFound } from "next/navigation";
import { ownerUnread, requireOwner } from "@/lib/owner";
import { loadStages } from "@/lib/staff/flow";
import { fmtDateTime } from "@/lib/time";
import { Card, Chip, OwnerShell, STATUS_LABEL, btnGhost, rupees } from "../../ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Order · London Wash Owner" };

const one = (x: any) => (Array.isArray(x) ? x[0] : x);
const EVENT: Record<string, string> = { stage_started: "started", stage_finished: "finished", stage_skipped: "skipped", stage_change: "moved to" };

export default async function OwnerOrderPage({ params }: { params: { id: string } }) {
  const { supabase, admin, me } = await requireOwner();
  const { data } = await supabase
    .from("order")
    .select("id, order_number, status, channel, total_minor, created_at, customer:customer_id(id, full_name, phone)")
    .eq("id", params.id)
    .maybeSingle();
  const o = data as any;
  if (!o) notFound();
  const [stages, unread, { data: items }, { data: pays }, { data: dels }] = await Promise.all([
    loadStages(supabase),
    ownerUnread(admin, me.id),
    supabase.from("order_item").select("id, quantity, service:service_id(name), item:item_id(name)").eq("order_id", o.id),
    supabase.from("payment").select("amount_minor, status").eq("order_id", o.id),
    supabase.from("delivery").select("id, status, completed_at, cash_collected_minor, driver_note, driver:driver_id(full_name)").eq("order_id", o.id),
  ]);
  const itemRows = (items ?? []) as any[];
  const { data: gs } = itemRows.length
    ? await supabase.from("garment").select("id, tag_code, current_stage_id, stage_state, order_item_id").in("order_item_id", itemRows.map((i) => i.id)).order("created_at").order("id")
    : { data: [] };
  const garments = (gs ?? []) as any[];
  const { data: ev } = garments.length
    ? await supabase
        .from("garment_event")
        .select("id, event_type, created_at, metadata, to_stage_id, garment_id, actor:actor_employee_id(full_name)")
        .in("garment_id", garments.map((g) => g.id))
        .order("created_at", { ascending: false })
        .limit(40)
    : { data: [] };
  const events = (ev ?? []) as any[];
  const paid = ((pays ?? []) as any[]).filter((p) => p.status !== "failed" && p.status !== "refunded").reduce((a, p) => a + Number(p.amount_minor), 0);
  const stageName = (id: string | null) => stages.find((s) => s.id === id)?.name ?? "—";
  const tagOf = new Map(garments.map((g) => [g.id, g.tag_code] as [string, string]));
  const c = one(o.customer);

  return (
    <OwnerShell back="/owner/orders" title={o.order_number} unread={unread}>
      <Card className="flex flex-col gap-1.5 p-4">
        <div className="flex items-center justify-between gap-2">
          <b className="text-[17px]">{c?.full_name ?? "Customer"}</b>
          <Chip tone={o.status === "ready" ? "ok" : o.status === "cancelled" ? "danger" : "brass"}>{STATUS_LABEL[o.status] ?? o.status}</Chip>
        </div>
        <span className="text-[13px] text-ink-2">
          {rupees(o.total_minor)} · {paid >= Number(o.total_minor) ? "paid" : `${rupees(Number(o.total_minor) - paid)} due`} · {fmtDateTime(o.created_at)}
        </span>
        {c?.phone && (
          <a href={`tel:${c.phone}`} className="text-[14px] font-semibold text-[#2b5584]">
            Call {c.phone}
          </a>
        )}
      </Card>

      {((dels ?? []) as any[]).map((d) => (
        <Card key={d.id} className="p-4 text-[13.5px]">
          <b>Delivery</b> · {String(d.status).replace("_", " ")}
          {one(d.driver)?.full_name ? ` · ${one(d.driver).full_name}` : " · no driver yet"}
          {d.completed_at ? ` · ${fmtDateTime(d.completed_at)}` : ""}
          {d.cash_collected_minor ? ` · ${rupees(d.cash_collected_minor)} cash` : ""}
          {d.driver_note && <span className="block text-ink-2">{d.driver_note}</span>}
        </Card>
      ))}

      <section className="flex flex-col gap-2">
        <h2 className="text-[15px] font-semibold">Garments</h2>
        <Card>
          <ul className="divide-y divide-hair">
            {garments.map((g) => {
              const oi = itemRows.find((i) => i.id === g.order_item_id);
              return (
                <li key={g.id} className="flex items-center gap-3 px-4 py-2.5 text-[13.5px]">
                  <span className="min-w-0 flex-1">
                    <b className="block truncate">{one(oi?.item)?.name ?? "Item"}</b>
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
            {!garments.length && <li className="px-4 py-3 text-[13.5px] text-ink-2">No garment tags on this order.</li>}
          </ul>
        </Card>
      </section>

      {events.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-[15px] font-semibold">Activity</h2>
          <Card>
            <ul className="divide-y divide-hair">
              {events.map((e) => (
                <li key={e.id} className="px-4 py-2.5 text-[13px]">
                  <b>{one(e.actor)?.full_name ?? e.metadata?.by ?? "System"}</b> {EVENT[e.event_type] ?? e.event_type}{" "}
                  {e.event_type === "stage_change" ? stageName(e.to_stage_id) : stages.find((s) => s.code === e.metadata?.stage)?.name ?? ""}
                  {typeof e.metadata?.minutes === "number" ? ` in ${e.metadata.minutes} min` : ""}
                  <span className="text-ink-2"> · #{tagOf.get(e.garment_id)}</span>
                  <span className="block text-[11.5px] text-ink-3">{fmtDateTime(e.created_at)}</span>
                </li>
              ))}
            </ul>
          </Card>
        </section>
      )}

      <Link href={`/orders/${o.id}`} className={btnGhost}>
        Open in the console
      </Link>
    </OwnerShell>
  );
}
