"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  checkPin,
  clearStaffSession,
  ensureDeviceId,
  last10,
  requireStaff,
  setStaffSession,
} from "@/lib/staff/session";
import { isPunchedIn, punch, todayAttendance } from "@/lib/staff/attendance";
import { allowedActions, finishStage, loadGarment, loadStages, moveOrderGarments, notifyOrderStatus, startStage, type Allowed } from "@/lib/staff/flow";
import { completeRun, failRun, startRun, type RunKind } from "@/lib/staff/runs";
import { removeSubscription, saveSubscription, type BrowserSubscription } from "@/lib/push";
import { onOrderStatus } from "@/lib/loyalty/ledger";

// Every action below (except sign-in) starts with requireStaff(), which checks
// the signed session cookie and that the account is still active.

/* ------------------------------------------------------------------ */
/* Sign in / out                                                        */
/* ------------------------------------------------------------------ */

type LoginState = { error?: string; phone?: string };
const WRONG = "That mobile number and PIN don't match. Check them, or ask the owner to reset your PIN.";

export async function staffLoginAction(_prev: LoginState, form: FormData): Promise<LoginState> {
  const phone = last10(String(form.get("phone") ?? ""));
  const pin = String(form.get("pin") ?? "").replace(/\D/g, "");
  if (phone.length !== 10) return { error: "Enter your 10-digit mobile number.", phone };
  if (!/^\d{4,6}$/.test(pin)) return { error: "Enter your 4 to 6 digit PIN.", phone };

  const db = createAdminClient();
  const { data } = await db
    .from("employee")
    .select("id, phone, pin_hash, pin_failed_attempts, pin_locked_until, device_id, session_version")
    .not("app_role", "is", null)
    .eq("is_active", true)
    .is("deleted_at", null)
    .ilike("phone", `%${phone.slice(-4)}`)
    .limit(50);
  const emp = ((data ?? []) as any[]).find((e) => last10(e.phone) === phone && e.pin_hash);
  if (!emp) return { error: WRONG, phone };
  if (emp.pin_locked_until && new Date(emp.pin_locked_until) > new Date()) {
    return { error: "Too many wrong PINs. Try again in 15 minutes, or ask the owner to reset your PIN.", phone };
  }
  if (!checkPin(pin, emp.pin_hash)) {
    const n = Number(emp.pin_failed_attempts || 0) + 1;
    await db
      .from("employee")
      .update(n >= 5 ? { pin_failed_attempts: 0, pin_locked_until: new Date(Date.now() + 15 * 60000).toISOString() } : { pin_failed_attempts: n })
      .eq("id", emp.id);
    return { error: n >= 5 ? "Too many wrong PINs. Try again in 15 minutes, or ask the owner to reset your PIN." : WRONG, phone };
  }
  const device = ensureDeviceId();
  if (emp.device_id && emp.device_id !== device) {
    return { error: "Your account is linked to another phone. Ask the owner to reset your app access, then sign in on this phone.", phone };
  }
  await db
    .from("employee")
    .update({ pin_failed_attempts: 0, pin_locked_until: null, device_id: device, last_seen_at: new Date().toISOString() })
    .eq("id", emp.id);
  setStaffSession(emp.id, Number(emp.session_version) || 1);
  redirect("/work");
}

export async function staffSignOutAction() {
  clearStaffSession();
  redirect("/work/login");
}

/* ------------------------------------------------------------------ */
/* Punch in / out                                                       */
/* ------------------------------------------------------------------ */

export async function punchAction(input: { kind: "in" | "out"; lat: number; lng: number; accuracy: number }) {
  const { me, db } = await requireStaff();
  const res = await punch(db, me, input.kind === "out" ? "out" : "in", {
    lat: Number(input.lat),
    lng: Number(input.lng),
    accuracy: Number(input.accuracy),
  });
  revalidatePath("/work");
  return res;
}

/* ------------------------------------------------------------------ */
/* Scanning                                                             */
/* ------------------------------------------------------------------ */

export type ScannedGarment = {
  id: string;
  tag: string | null;
  itemName: string;
  serviceName: string;
  notes: string | null;
  orderId: string;
  orderNumber: string;
  orderStatus: string;
  customerName: string;
  piece: number;
  pieces: number;
  stageId: string | null;
  stageName: string | null;
  stageCode: string | null;
  state: "waiting" | "in_progress";
  startedAt: string | null;
  startedBy: string | null;
  mine: boolean;
  nextName: string | null;
};
export type ScanResult = { ok: true; garment: ScannedGarment; allowed: Allowed; message?: string } | { ok: false; error: string };

async function lookup(by: { tag?: string; id?: string }, message?: string): Promise<ScanResult> {
  const { me, db } = await requireStaff();
  if (me.app_role === "driver") return { ok: false, error: "Drivers work from Runs." };
  const stages = await loadStages(db);
  if (!stages.length) return { ok: false, error: "The garment flow isn't set up yet. Ask the owner." };
  const g = await loadGarment(db, stages, by);
  if (!g) return { ok: false, error: by.tag ? `No garment with tag ${by.tag}. Check the number and try again.` : "Garment not found." };
  if (g.order.branchId !== me.branch_id) return { ok: false, error: "This garment belongs to another branch." };
  const punchedIn = isPunchedIn(await todayAttendance(db, me.id));
  return {
    ok: true,
    message,
    allowed: allowedActions(me.app_role, g, punchedIn),
    garment: {
      id: g.id,
      tag: g.tag,
      itemName: g.itemName,
      serviceName: g.serviceName,
      notes: g.notes,
      orderId: g.order.id,
      orderNumber: g.order.number,
      orderStatus: g.order.status,
      customerName: g.order.customerName,
      piece: g.piece,
      pieces: g.pieces,
      stageId: g.stage?.id ?? null,
      stageName: g.stage?.name ?? null,
      stageCode: g.stage?.code ?? null,
      state: g.state,
      startedAt: g.startedAt,
      startedBy: g.startedBy,
      mine: g.startedById === me.id,
      nextName: g.next?.name ?? null,
    },
  };
}

export async function scanLookupAction(tag: string): Promise<ScanResult> {
  return lookup({ tag: String(tag ?? "").slice(0, 32) });
}

export async function stageAction(input: { garmentId: string; stageId: string; action: "start" | "finish" | "skip" }): Promise<ScanResult> {
  const { me, db } = await requireStaff();
  if (me.app_role === "driver") return { ok: false, error: "Drivers work from Runs." };
  if (!isPunchedIn(await todayAttendance(db, me.id))) return { ok: false, error: "Punch in first, then scan again to start work." };
  const stages = await loadStages(db);
  const g = await loadGarment(db, stages, { id: input.garmentId });
  if (!g || g.order.branchId !== me.branch_id) return { ok: false, error: "Garment not found." };
  const allowed = allowedActions(me.app_role, g, true);
  if (!allowed.actions.includes(input.action) || g.stage?.id !== input.stageId) {
    return lookup({ id: input.garmentId }, allowed.reason ?? "This garment has moved on. Here's where it is now.");
  }
  const actor = { id: me.id, app_role: me.app_role, full_name: me.full_name };
  const res =
    input.action === "start"
      ? await startStage(db, stages, actor, g.id, input.stageId)
      : await finishStage(db, stages, actor, g.id, input.stageId, input.action === "skip");
  if ("error" in res && res.error) return { ok: false, error: res.error };
  revalidatePath("/work/jobs");
  const done =
    input.action === "start"
      ? `Started ${g.stage?.name}. Scan it again when you finish.`
      : `${input.action === "skip" ? "Skipped" : "Finished"} ${g.stage?.name}.${g.next ? ` Next: ${g.next.name}.` : ""}`;
  return lookup({ id: g.id }, done);
}

/* ------------------------------------------------------------------ */
/* Counter hand-over (receptionist)                                     */
/* ------------------------------------------------------------------ */

export async function handOverAction(form: FormData) {
  const { me, db } = await requireStaff(["receptionist"]);
  const orderId = String(form.get("order_id") ?? "");
  const { data } = await db.from("order").select("id, status, branch_id").eq("id", orderId).maybeSingle();
  const o = data as { id: string; status: string; branch_id: string } | null;
  if (!o || o.branch_id !== me.branch_id) redirect("/work/orders");
  if (o.status !== "ready") redirect(`/work/orders/${orderId}?error=${encodeURIComponent("Only ready orders can be handed over.")}`);
  const { data: moved } = await db.from("order").update({ status: "delivered" }).eq("id", orderId).eq("status", "ready").select("id");
  if ((moved ?? []).length) {
    await onOrderStatus(db, orderId, "delivered"); // points become Earned
    await moveOrderGarments(db, orderId, "delivered", { employeeId: me.id, by: me.full_name });
    await notifyOrderStatus(orderId, "delivered");
  }
  revalidatePath("/work/orders");
  redirect(`/work/orders/${orderId}?done=handover`);
}

/* ------------------------------------------------------------------ */
/* Driver runs                                                          */
/* ------------------------------------------------------------------ */

const runKind = (s: unknown): RunKind => (s === "pickup" ? "pickup" : "delivery");
const back = (msg: { ok?: string; error?: string }) =>
  redirect(`/work/runs?${msg.error ? `error=${encodeURIComponent(msg.error)}` : `ok=${encodeURIComponent(msg.ok ?? "")}`}`);

async function driverGate() {
  const { me, db } = await requireStaff(["driver"]);
  if (!me.driver_id) back({ error: "Your driver profile isn't linked yet. Ask the owner." });
  if (!isPunchedIn(await todayAttendance(db, me.id))) back({ error: "Punch in at the branch before starting your runs." });
  return { me, db };
}

export async function startRunAction(form: FormData) {
  const { me, db } = await driverGate();
  const res = await startRun(db, me, runKind(form.get("kind")), String(form.get("id") ?? ""));
  revalidatePath("/work/runs");
  back(res.error ? { error: res.error } : { ok: "Started. The customer has been told you're on the way." });
}

export async function completeRunAction(form: FormData) {
  const { me, db } = await driverGate();
  const kind = runKind(form.get("kind"));
  const cash = String(form.get("cash") ?? "").trim();
  const res = await completeRun(db, me, kind, String(form.get("id") ?? ""), {
    otp: String(form.get("otp") ?? ""),
    cashMinor: cash ? Math.round(Number(cash) * 100) : null,
    note: String(form.get("note") ?? "").trim() || null,
  });
  revalidatePath("/work/runs");
  back(res.error ? { error: res.error } : { ok: kind === "pickup" ? "Pickup done. Bring the laundry to the counter." : "Delivered. Thank you!" });
}

export async function failRunAction(form: FormData) {
  const { me, db } = await driverGate();
  const res = await failRun(db, me, runKind(form.get("kind")), String(form.get("id") ?? ""), String(form.get("reason") ?? ""));
  revalidatePath("/work/runs");
  back(res.error ? { error: res.error } : { ok: "Noted. The office has been told." });
}

/* ------------------------------------------------------------------ */
/* Notifications                                                        */
/* ------------------------------------------------------------------ */

export async function saveStaffPushAction(sub: BrowserSubscription) {
  const { me, db } = await requireStaff();
  return saveSubscription(db, { employee_id: me.id }, sub, headers().get("user-agent"));
}

export async function removeStaffPushAction(endpoint: string) {
  const { db } = await requireStaff();
  await removeSubscription(db, String(endpoint ?? ""));
  return { ok: true };
}

export async function markStaffAlertsReadAction() {
  const { me, db } = await requireStaff();
  await db.from("app_notification").update({ read_at: new Date().toISOString() }).eq("employee_id", me.id).is("read_at", null);
  revalidatePath("/work", "layout");
}
