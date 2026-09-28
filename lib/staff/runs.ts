import type { SupabaseClient } from "@supabase/supabase-js";
import { onOrderStatus } from "@/lib/loyalty/ledger";
import { notify } from "@/lib/notify";
import { moveOrderGarments, notifyOrderStatus } from "./flow";
import type { StaffMe } from "./session";

// Driver runs: pickups and deliveries assigned to the signed-in driver.
// Server-only.

type Supa = SupabaseClient<any, "public", any>;
export type RunKind = "pickup" | "delivery";

const one = <T,>(x: T | T[] | null | undefined): T | null => (Array.isArray(x) ? x[0] ?? null : x ?? null);

export type Run = {
  kind: RunKind;
  id: string;
  status: string;
  windowStart: string | null;
  windowEnd: string | null;
  orderId: string | null;
  orderNumber: string | null;
  orderTotalMinor: number | null;
  customerId: string;
  customerName: string;
  customerPhone: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  services: string[];
  notes: string | null;
  needsOtp: boolean;
  startedAt: string | null;
  completedAt: string | null;
  driverNote: string | null;
};

const ADDR = "address:customer_address_id(address_line, city, pincode, latitude, longitude)";

function toRun(kind: RunKind, r: any): Run {
  const a = one<any>(r.address);
  const o = one<any>(r.order);
  const c = one<any>(r.customer) ?? one<any>(o?.customer);
  return {
    kind,
    id: r.id,
    status: r.status,
    windowStart: r.scheduled_window_start,
    windowEnd: r.scheduled_window_end,
    orderId: o?.id ?? r.order_id ?? null,
    orderNumber: o?.order_number ?? null,
    orderTotalMinor: o?.total_minor ?? null,
    customerId: c?.id ?? r.customer_id ?? o?.customer_id,
    customerName: c?.full_name ?? "Customer",
    customerPhone: c?.phone ?? null,
    address: a ? [a.address_line, a.city, a.pincode].filter(Boolean).join(", ") : null,
    lat: a?.latitude == null ? null : Number(a.latitude),
    lng: a?.longitude == null ? null : Number(a.longitude),
    services: (r.services ?? []) as string[],
    notes: r.notes ?? null,
    needsOtp: !!r.otp,
    startedAt: r.started_at ?? null,
    completedAt: r.completed_at ?? null,
    driverNote: r.driver_note ?? null,
  };
}

export async function loadRuns(db: Supa, driverId: string, opts: { open: boolean; sinceIso?: string }) {
  const open = ["scheduled", "en_route"];
  let pq = db
    .from("pickup")
    .select(`id, status, scheduled_window_start, scheduled_window_end, order_id, customer_id, services, notes, otp, started_at, completed_at, driver_note, customer:customer_id(id, full_name, phone), order:order_id(id, order_number, total_minor), ${ADDR}`)
    .eq("driver_id", driverId);
  let dq = db
    .from("delivery")
    .select(`id, status, scheduled_window_start, scheduled_window_end, order_id, otp, started_at, completed_at, driver_note, order:order_id(id, order_number, total_minor, customer_id, customer:customer_id(id, full_name, phone)), ${ADDR}`)
    .eq("driver_id", driverId);
  if (opts.open) {
    pq = pq.in("status", open);
    dq = dq.in("status", open);
  } else {
    pq = pq.not("status", "in", `(${open.join(",")})`).gte("updated_at", opts.sinceIso ?? "1970-01-01");
    dq = dq.not("status", "in", `(${open.join(",")})`).gte("updated_at", opts.sinceIso ?? "1970-01-01");
  }
  const [p, d] = await Promise.all([pq.limit(100), dq.limit(100)]);
  const runs = [...((p.data ?? []) as any[]).map((r) => toRun("pickup", r)), ...((d.data ?? []) as any[]).map((r) => toRun("delivery", r))];
  const t = (r: Run) => (r.windowStart ? new Date(r.windowStart).getTime() : Number.MAX_SAFE_INTEGER);
  return opts.open ? runs.sort((a, b) => t(a) - t(b)) : runs.sort((a, b) => (b.completedAt ?? "").localeCompare(a.completedAt ?? ""));
}

async function loadOwn(db: Supa, me: StaffMe, kind: RunKind, id: string) {
  if (!me.driver_id) return null;
  const { data } = await db
    .from(kind)
    .select("id, status, order_id, otp, driver_id" + (kind === "pickup" ? ", customer_id" : ""))
    .eq("id", id)
    .eq("driver_id", me.driver_id)
    .maybeSingle();
  return data as any;
}

async function orderInfo(db: Supa, orderId: string | null) {
  if (!orderId) return null;
  const { data } = await db.from("order").select("id, order_number, status, customer_id, branch_id, customer:customer_id(full_name)").eq("id", orderId).maybeSingle();
  return data as any;
}

export async function startRun(db: Supa, me: StaffMe, kind: RunKind, id: string) {
  const r = await loadOwn(db, me, kind, id);
  if (!r) return { error: "This job isn't assigned to you." };
  if (r.status !== "scheduled") return { error: "This job has already started." };
  const { data: started } = await db.from(kind).update({ status: "en_route", started_at: new Date().toISOString() }).eq("id", id).eq("status", "scheduled").select("id");
  if (!(started ?? []).length) return { error: "This job has already started." };
  if (kind === "delivery" && r.order_id) {
    const o = await orderInfo(db, r.order_id);
    if (o && ["confirmed", "in_production", "ready"].includes(o.status)) {
      const { data: moved } = await db.from("order").update({ status: "out_for_delivery" }).eq("id", o.id).eq("status", o.status).select("id");
      if ((moved ?? []).length) await onOrderStatus(db, o.id, "out_for_delivery");
    }
    await moveOrderGarments(db, r.order_id, "out_for_delivery", { employeeId: me.id, by: me.full_name });
    await notifyOrderStatus(r.order_id, "out_for_delivery");
  } else if (kind === "pickup") {
    await notify({ customerId: r.customer_id }, { kind: "pickup_en_route", title: "Our driver is on the way", body: `${me.firstName} is coming to collect your laundry.`, customerUrl: "/my/orders" });
  }
  return { ok: true };
}

export async function completeRun(db: Supa, me: StaffMe, kind: RunKind, id: string, opts: { otp?: string; cashMinor?: number | null; note?: string | null }) {
  const r = await loadOwn(db, me, kind, id);
  if (!r) return { error: "This job isn't assigned to you." };
  if (!["scheduled", "en_route"].includes(r.status)) return { error: "This job is already closed." };
  if (kind === "delivery" && r.otp && (opts.otp ?? "").trim() !== String(r.otp).trim()) {
    return { error: "That delivery code doesn't match. Ask the customer for the code in their message." };
  }
  const patch: Record<string, unknown> = { status: "completed", completed_at: new Date().toISOString(), driver_note: opts.note || null };
  if (kind === "delivery" && opts.cashMinor != null && opts.cashMinor >= 0) patch.cash_collected_minor = opts.cashMinor;
  const { data: done } = await db.from(kind).update(patch).eq("id", id).in("status", ["scheduled", "en_route"]).select("id");
  if (!(done ?? []).length) return { error: "This job is already closed." };

  if (kind === "delivery" && r.order_id) {
    const o = await orderInfo(db, r.order_id);
    if (o && o.status !== "delivered" && o.status !== "cancelled") {
      const { data: moved } = await db.from("order").update({ status: "delivered" }).eq("id", o.id).eq("status", o.status).select("id");
      if ((moved ?? []).length) await onOrderStatus(db, o.id, "delivered"); // points become Earned
    }
    await moveOrderGarments(db, r.order_id, "delivered", { employeeId: me.id, by: me.full_name });
    await notifyOrderStatus(r.order_id, "delivered");
    await notify(
      { owners: true },
      {
        kind: "delivered",
        title: `${o?.order_number ?? "Order"} delivered`,
        body: `${me.full_name} delivered to ${one<any>(o?.customer)?.full_name ?? "the customer"}${opts.cashMinor ? ` · ₹${Math.round(opts.cashMinor / 100)} cash collected` : ""}.`,
        ownerUrl: `/owner/orders/${r.order_id}`,
      }
    );
  } else if (kind === "pickup") {
    const { data: c } = await db.from("customer").select("full_name").eq("id", r.customer_id).maybeSingle();
    await notify(
      { owners: true, roles: ["receptionist"], branchId: me.branch_id },
      {
        kind: "pickup_collected",
        title: "Pickup collected",
        body: `${me.full_name} collected laundry from ${(c as any)?.full_name ?? "a customer"}. Bring it to the counter to create the order.`,
        staffUrl: "/work/orders",
        ownerUrl: "/owner",
      }
    );
  }
  return { ok: true };
}

export async function failRun(db: Supa, me: StaffMe, kind: RunKind, id: string, reason: string) {
  const r = await loadOwn(db, me, kind, id);
  if (!r) return { error: "This job isn't assigned to you." };
  if (!["scheduled", "en_route"].includes(r.status)) return { error: "This job is already closed." };
  if (!reason.trim()) return { error: "Say what happened, so the office can follow up." };
  await db.from(kind).update({ status: "failed", driver_note: reason.slice(0, 500), completed_at: new Date().toISOString() }).eq("id", id);
  const o = await orderInfo(db, r.order_id);
  await notify(
    { owners: true, roles: ["receptionist"], branchId: me.branch_id },
    {
      kind: `${kind}_failed`,
      title: `${kind === "pickup" ? "Pickup" : "Delivery"} not completed`,
      body: `${me.full_name}${o ? ` · ${o.order_number}` : ""}: ${reason.slice(0, 200)}`,
      staffUrl: "/work",
      ownerUrl: o ? `/owner/orders/${o.id}` : "/owner",
    }
  );
  return { ok: true };
}
