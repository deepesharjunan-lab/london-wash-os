import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { onOrderStatus } from "@/lib/loyalty/ledger";
import { notify } from "@/lib/notify";
import { sendOrderUpdateWhatsApp } from "@/lib/whatsapp/templates";
import { ROLE_LABEL, isAppRole, type AppRole } from "./roles";

// Garment stages for the staff app. Every garment sits at one stage, either
// waiting or in progress. Staff scan a tag to start their stage, and scan it
// again to finish it, which moves the garment to the next stage. The order's
// status follows its garments automatically. Server-only.

type Supa = SupabaseClient<any, "public", any>;

export type Stage = { id: string; code: string; name: string; app_role: AppRole | null; sort_order: number };

export async function loadStages(db: Supa): Promise<Stage[]> {
  const { data: wf } = await db.from("workflow").select("id").eq("code", "garment_standard").maybeSingle();
  if (!wf) return [];
  const { data } = await db
    .from("workflow_stage")
    .select("id, code, name, app_role, sort_order")
    .eq("workflow_id", (wf as { id: string }).id)
    .order("sort_order");
  return ((data ?? []) as any[]).map((s) => ({ ...s, app_role: isAppRole(s.app_role) ? s.app_role : null }));
}

export const stageByCode = (stages: Stage[], code: string) => stages.find((s) => s.code === code) ?? null;
const indexOf = (stages: Stage[], id: string | null) => stages.findIndex((s) => s.id === id);
export const nextStage = (stages: Stage[], id: string | null) => {
  const i = indexOf(stages, id);
  return i >= 0 ? stages[i + 1] ?? null : null;
};
/** The stages a role works on. */
export const stagesForRole = (stages: Stage[], role: AppRole) => stages.filter((s) => s.app_role === role);

/** Tags are numeric; the barcode pads odd lengths with a leading zero. */
export const normaliseTag = (raw: string) => (raw || "").replace(/\D/g, "").replace(/^0+(?=\d)/, "");

export type GarmentView = {
  id: string;
  tag: string | null;
  itemName: string;
  serviceName: string;
  notes: string | null;
  order: { id: string; number: string; status: string; branchId: string; customerId: string; customerName: string };
  piece: number;
  pieces: number;
  stage: Stage | null;
  state: "waiting" | "in_progress";
  startedAt: string | null;
  startedById: string | null;
  startedBy: string | null;
  next: Stage | null;
};

const GARMENT_COLS =
  "id, tag_code, current_stage_id, stage_state, stage_started_at, stage_employee_id, created_at, item:item_id(name), order_item:order_item_id(id, order_id, notes, service:service_id(name), item:item_id(name))";
const one = <T,>(x: T | T[] | null | undefined): T | null => (Array.isArray(x) ? x[0] ?? null : x ?? null);

export async function loadGarment(db: Supa, stages: Stage[], by: { tag?: string; id?: string }): Promise<GarmentView | null> {
  let q = db.from("garment").select(GARMENT_COLS);
  if (by.id) q = q.eq("id", by.id);
  else {
    const raw = (by.tag ?? "").replace(/\D/g, "");
    const tag = normaliseTag(raw);
    if (!tag) return null;
    q = q.in("tag_code", [...new Set([tag, raw])]);
  }
  const { data } = await q.limit(1).maybeSingle();
  const g = data as any;
  if (!g) return null;
  const oi = one<any>(g.order_item);
  if (!oi) return null;
  const [{ data: orderRow }, { data: siblings }] = await Promise.all([
    db.from("order").select("id, order_number, status, branch_id, customer_id, customer:customer_id(full_name)").eq("id", oi.order_id).maybeSingle(),
    db.from("order_item").select("id").eq("order_id", oi.order_id),
  ]);
  const o = orderRow as any;
  if (!o) return null;
  const itemIds = ((siblings ?? []) as { id: string }[]).map((s) => s.id);
  const { data: all } = await db.from("garment").select("id, created_at").in("order_item_id", itemIds).order("created_at").order("id");
  const list = (all ?? []) as { id: string }[];
  const stage = stages.find((s) => s.id === g.current_stage_id) ?? null;
  let startedBy: string | null = null;
  if (g.stage_employee_id) {
    const { data: e } = await db.from("employee").select("full_name").eq("id", g.stage_employee_id).maybeSingle();
    startedBy = (e as { full_name: string } | null)?.full_name ?? null;
  }
  return {
    id: g.id,
    tag: g.tag_code,
    itemName: one<any>(g.item)?.name ?? one<any>(oi.item)?.name ?? "Garment",
    serviceName: one<any>(oi.service)?.name ?? "",
    notes: oi.notes ?? null,
    order: {
      id: o.id,
      number: o.order_number,
      status: o.status,
      branchId: o.branch_id,
      customerId: o.customer_id,
      customerName: one<any>(o.customer)?.full_name ?? "Customer",
    },
    piece: Math.max(1, list.findIndex((x) => x.id === g.id) + 1),
    pieces: Math.max(1, list.length),
    stage,
    state: g.stage_state === "in_progress" ? "in_progress" : "waiting",
    startedAt: g.stage_started_at,
    startedById: g.stage_employee_id,
    startedBy,
    next: nextStage(stages, g.current_stage_id),
  };
}

export type Allowed = { actions: ("start" | "finish" | "skip")[]; reason?: string };

/** What this role may do with this garment right now. */
export function allowedActions(role: AppRole, g: GarmentView, punchedIn: boolean): Allowed {
  if (g.order.status === "cancelled") return { actions: [], reason: "This order was cancelled. Keep the garment aside and tell the receptionist." };
  if (g.order.status === "delivered" || g.stage?.code === "delivered") return { actions: [], reason: "Already delivered to the customer." };
  if (!g.stage) return { actions: [], reason: "This garment has no stage yet. Ask the owner to check the garment flow." };
  if (g.stage.code === "ready") return { actions: [], reason: "Finished and ready for delivery or collection." };
  if (g.stage.code === "out_for_delivery") return { actions: [], reason: "Out for delivery with the driver." };
  if (g.stage.app_role !== role) {
    const who = g.stage.app_role ? ROLE_LABEL[g.stage.app_role] : "the next team";
    return {
      actions: [],
      reason: g.state === "in_progress" ? `${who} is working on this (${g.stage.name}).` : `Waiting for ${who} at ${g.stage.name}.`,
    };
  }
  if (!punchedIn) return { actions: [], reason: "Punch in first, then scan again to start work." };
  if (g.state === "in_progress") return { actions: ["finish"] };
  return { actions: g.stage.code === "received" ? ["start"] : ["start", "skip"] };
}

type Actor = { id: string; app_role: AppRole; full_name: string };

export async function startStage(db: Supa, stages: Stage[], me: Actor, garmentId: string, stageId: string) {
  const stage = stages.find((s) => s.id === stageId);
  if (!stage || stage.app_role !== me.app_role) return { error: "This isn't your stage." };
  const now = new Date().toISOString();
  const { data } = await db
    .from("garment")
    .update({ stage_state: "in_progress", stage_started_at: now, stage_employee_id: me.id })
    .eq("id", garmentId)
    .eq("current_stage_id", stageId)
    .eq("stage_state", "waiting")
    .select("id");
  if (!(data ?? []).length) return { error: "This garment was just updated by someone else. Scan it again." };
  await db.from("garment_event").insert({
    garment_id: garmentId,
    event_type: "stage_started",
    from_stage_id: stageId,
    to_stage_id: stageId,
    actor_employee_id: me.id,
    metadata: { stage: stage.code, role: me.app_role, by: me.full_name },
  });
  await syncOrderFromGarments(db, stages, await orderIdOfGarment(db, garmentId), null);
  return { ok: true };
}

/** Finish (or skip) the garment's current stage and move it to the next one. */
export async function finishStage(db: Supa, stages: Stage[], me: Actor, garmentId: string, stageId: string, skip = false) {
  const stage = stages.find((s) => s.id === stageId);
  if (!stage || stage.app_role !== me.app_role) return { error: "This isn't your stage." };
  if (skip && stage.code === "received") return { error: "Receiving can't be skipped." };
  const next = nextStage(stages, stageId);
  if (!next) return { error: "This is the last stage." };
  const { data: before } = await db.from("garment").select("stage_started_at").eq("id", garmentId).maybeSingle();
  const { data } = await db
    .from("garment")
    .update({ current_stage_id: next.id, stage_state: "waiting", stage_started_at: null, stage_employee_id: null })
    .eq("id", garmentId)
    .eq("current_stage_id", stageId)
    .eq("stage_state", skip ? "waiting" : "in_progress")
    .select("id");
  if (!(data ?? []).length) return { error: "This garment was just updated by someone else. Scan it again." };
  const startedAt = (before as { stage_started_at: string | null } | null)?.stage_started_at;
  await db.from("garment_event").insert({
    garment_id: garmentId,
    event_type: skip ? "stage_skipped" : "stage_finished",
    from_stage_id: stageId,
    to_stage_id: next.id,
    actor_employee_id: me.id,
    metadata: {
      stage: stage.code,
      role: me.app_role,
      by: me.full_name,
      minutes: startedAt ? Math.round((Date.now() - new Date(startedAt).getTime()) / 60000) : null,
    },
  });
  await syncOrderFromGarments(db, stages, await orderIdOfGarment(db, garmentId), stage);
  return { ok: true, next };
}

async function orderIdOfGarment(db: Supa, garmentId: string) {
  const { data } = await db.from("garment").select("order_item:order_item_id(order_id)").eq("id", garmentId).maybeSingle();
  return one<any>((data as any)?.order_item)?.order_id as string | undefined;
}

async function orderGarments(db: Supa, orderId: string) {
  const { data: items } = await db.from("order_item").select("id").eq("order_id", orderId);
  const ids = ((items ?? []) as { id: string }[]).map((i) => i.id);
  if (!ids.length) return [];
  const { data } = await db.from("garment").select("id, current_stage_id, stage_state").in("order_item_id", ids);
  return (data ?? []) as { id: string; current_stage_id: string | null; stage_state: string }[];
}

/**
 * Moves the order's status to match its garments, and tells the next team
 * when the whole order has reached their stage.
 *  - all garments received            -> confirmed
 *  - any garment past receiving       -> in production
 *  - every garment at Ready or later  -> ready
 */
export async function syncOrderFromGarments(db: Supa, stages: Stage[], orderId: string | undefined, finished: Stage | null) {
  if (!orderId) return;
  try {
    const [{ data: o }, garments] = await Promise.all([
      db.from("order").select("id, order_number, status, branch_id, customer_id, customer:customer_id(full_name)").eq("id", orderId).maybeSingle(),
      orderGarments(db, orderId),
    ]);
    const order = o as any;
    if (!order || !garments.length) return;
    const received = indexOf(stages, stageByCode(stages, "received")?.id ?? null);
    const ready = indexOf(stages, stageByCode(stages, "ready")?.id ?? null);
    const idx = garments.map((g) => indexOf(stages, g.current_stage_id));
    const min = Math.min(...idx);
    const anyStartedPastReceiving = garments.some((g, k) => idx[k] > received + 1 || (idx[k] === received + 1 && g.stage_state === "in_progress"));
    const customerName = one<any>(order.customer)?.full_name ?? "Customer";
    const pieces = `${garments.length} ${garments.length === 1 ? "piece" : "pieces"}`;

    let target: string | null = null;
    let from: string[] = [];
    if (ready >= 0 && min >= ready) {
      target = "ready";
      from = ["draft", "confirmed", "in_production"];
    } else if (anyStartedPastReceiving || min > received + 1) {
      target = "in_production";
      from = ["draft", "confirmed"];
    } else if (min > received) {
      target = "confirmed";
      from = ["draft"];
    }
    if (target && from.includes(order.status)) {
      const { data: moved } = await db.from("order").update({ status: target }).eq("id", orderId).in("status", from).select("id");
      if ((moved ?? []).length) {
        await onOrderStatus(db, orderId, target); // loyalty points; never throws
        if (target === "ready") await notifyOrderStatus(orderId, "ready");
      }
    }

    // The last garment just left `finished`: tell the team at the next stage.
    if (finished) {
      const fi = indexOf(stages, finished.id);
      const nextUp = stages[fi + 1];
      if (min > fi && nextUp?.app_role && nextUp.code !== "out_for_delivery") {
        await notify(
          { roles: [nextUp.app_role], branchId: order.branch_id },
          {
            kind: "stage_ready",
            title: `${order.order_number} is ready for ${nextUp.name}`,
            body: `${pieces} · ${customerName}`,
            staffUrl: `/work/orders/${orderId}`,
          }
        );
      }
    }
  } catch (e) {
    console.error("syncOrderFromGarments failed", e);
  }
}

/** Moves every garment of an order to a stage (used for delivery and hand-over). */
export async function moveOrderGarments(db: Supa, orderId: string, stageCode: string, actor: { employeeId?: string | null; userId?: string | null; by?: string }) {
  try {
    const stages = await loadStages(db);
    const to = stageByCode(stages, stageCode);
    if (!to) return;
    const garments = await orderGarments(db, orderId);
    const toMove = garments.filter((g) => indexOf(stages, g.current_stage_id) < indexOf(stages, to.id));
    if (!toMove.length) return;
    await db
      .from("garment")
      .update({ current_stage_id: to.id, stage_state: "waiting", stage_started_at: null, stage_employee_id: null })
      .in("id", toMove.map((g) => g.id));
    await db.from("garment_event").insert(
      toMove.map((g) => ({
        garment_id: g.id,
        event_type: "stage_change",
        from_stage_id: g.current_stage_id,
        to_stage_id: to.id,
        actor_employee_id: actor.employeeId ?? null,
        actor_user_id: actor.userId ?? null,
        metadata: { stage: to.code, by: actor.by ?? null, bulk: true },
      }))
    );
  } catch (e) {
    console.error("moveOrderGarments failed", e);
  }
}

/** Tells the customer (and owners, when useful) about an order status change. Never throws. */
export async function notifyOrderStatus(orderId: string, status: string) {
  await sendOrderUpdateWhatsApp(orderId, status); // only when WHATSAPP_NOTIFY=1; never throws
  try {
    const db = createAdminClient();
    const { data } = await db.from("order").select("id, order_number, customer_id, branch_id, customer:customer_id(full_name)").eq("id", orderId).maybeSingle();
    const o = data as any;
    if (!o) return;
    const customerName = one<any>(o.customer)?.full_name ?? "Customer";
    const firstName = String(customerName).split(" ")[0];
    const customerUrl = `/my/orders/${orderId}`;
    if (status === "ready") {
      await notify(
        { customerId: o.customer_id, owners: true, roles: ["receptionist"], branchId: o.branch_id },
        {
          kind: "order_ready",
          title: `${o.order_number} is ready`,
          body: `${customerName}'s order is finished and packed.`,
          staffUrl: `/work/orders/${orderId}`,
          ownerUrl: `/owner/orders/${orderId}`,
          customerUrl,
        }
      );
      return;
    }
    const customerCopy: Record<string, { title: string; body: string }> = {
      out_for_delivery: { title: "Your order is on its way", body: `Hi ${firstName}, order ${o.order_number} is out for delivery.` },
      delivered: { title: "Delivered. Thank you!", body: `Order ${o.order_number} has been delivered. Your points are now in your wallet.` },
      in_production: { title: "We're working on your order", body: `Order ${o.order_number} is being cleaned and cared for.` },
    };
    const c = customerCopy[status];
    if (c) await notify({ customerId: o.customer_id }, { kind: `order_${status}`, title: c.title, body: c.body, customerUrl });
  } catch (e) {
    console.error("notifyOrderStatus failed", e);
  }
}

/** Keeps garments in step when the console changes an order's status by hand. */
export async function afterConsoleStatusChange(orderId: string, status: string, userId: string | null) {
  const db = createAdminClient();
  if (status === "out_for_delivery" || status === "delivered" || status === "ready") {
    await moveOrderGarments(db, orderId, status, { userId, by: "console" });
  }
  await notifyOrderStatus(orderId, status);
}
