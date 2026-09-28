import type { SupabaseClient } from "@supabase/supabase-js";
import type { Stage } from "./flow";

// Work queues: garments waiting at, or in progress at, given stages,
// grouped by order. Server-only.

type Supa = SupabaseClient<any, "public", any>;
const one = <T,>(x: T | T[] | null | undefined): T | null => (Array.isArray(x) ? x[0] ?? null : x ?? null);

export type QueueGarment = {
  id: string;
  tag: string | null;
  itemName: string;
  stageId: string;
  state: "waiting" | "in_progress";
  startedAt: string | null;
  employeeId: string | null;
};

export type QueueOrder = {
  orderId: string;
  orderNumber: string;
  status: string;
  customerName: string;
  createdAt: string;
  stageId: string;
  stageName: string;
  garments: QueueGarment[];
  waiting: number;
  inProgress: number;
};

const CLOSED = ["cancelled", "delivered"];

export async function loadQueue(db: Supa, stages: Stage[], stageIds: string[], branchId: string | null): Promise<QueueOrder[]> {
  if (!stageIds.length) return [];
  const { data } = await db
    .from("garment")
    .select(
      "id, tag_code, current_stage_id, stage_state, stage_started_at, stage_employee_id, item:item_id(name), order_item:order_item_id(item:item_id(name), order:order_id(id, order_number, status, branch_id, created_at, customer:customer_id(full_name)))"
    )
    .in("current_stage_id", stageIds)
    .order("created_at")
    .limit(2000);
  const byKey = new Map<string, QueueOrder>();
  for (const g of (data ?? []) as any[]) {
    const oi = one<any>(g.order_item);
    const o = one<any>(oi?.order);
    if (!o || CLOSED.includes(o.status) || (branchId && o.branch_id !== branchId)) continue;
    const key = `${o.id}:${g.current_stage_id}`;
    let q = byKey.get(key);
    if (!q) {
      q = {
        orderId: o.id,
        orderNumber: o.order_number,
        status: o.status,
        customerName: one<any>(o.customer)?.full_name ?? "Customer",
        createdAt: o.created_at,
        stageId: g.current_stage_id,
        stageName: stages.find((s) => s.id === g.current_stage_id)?.name ?? "",
        garments: [],
        waiting: 0,
        inProgress: 0,
      };
      byKey.set(key, q);
    }
    const state = g.stage_state === "in_progress" ? "in_progress" : "waiting";
    q.garments.push({
      id: g.id,
      tag: g.tag_code,
      itemName: one<any>(g.item)?.name ?? one<any>(oi?.item)?.name ?? "Garment",
      stageId: g.current_stage_id,
      state,
      startedAt: g.stage_started_at,
      employeeId: g.stage_employee_id,
    });
    if (state === "in_progress") q.inProgress++;
    else q.waiting++;
  }
  return [...byKey.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export type DoneRow = { id: string; garmentId: string; tag: string | null; itemName: string; orderId: string | null; orderNumber: string | null; stage: string; skipped: boolean; minutes: number | null; at: string };

/** Stages this staff member finished (or skipped) since a time. */
export async function loadDone(db: Supa, employeeId: string, sinceIso: string, limit = 200): Promise<DoneRow[]> {
  const { data } = await db
    .from("garment_event")
    .select("id, event_type, metadata, created_at, garment:garment_id(id, tag_code, item:item_id(name), order_item:order_item_id(order:order_id(id, order_number)))")
    .eq("actor_employee_id", employeeId)
    .in("event_type", ["stage_finished", "stage_skipped"])
    .gte("created_at", sinceIso)
    .order("created_at", { ascending: false })
    .limit(limit);
  return ((data ?? []) as any[]).map((e) => {
    const g = one<any>(e.garment);
    const o = one<any>(one<any>(g?.order_item)?.order);
    return {
      id: e.id,
      garmentId: g?.id,
      tag: g?.tag_code ?? null,
      itemName: one<any>(g?.item)?.name ?? "Garment",
      orderId: o?.id ?? null,
      orderNumber: o?.order_number ?? null,
      stage: e.metadata?.stage ?? "",
      skipped: e.event_type === "stage_skipped",
      minutes: typeof e.metadata?.minutes === "number" ? e.metadata.minutes : null,
      at: e.created_at,
    };
  });
}
