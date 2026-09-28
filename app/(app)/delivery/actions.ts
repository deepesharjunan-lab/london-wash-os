"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { notify } from "@/lib/notify";

/** Tells the driver (in the staff app) about a pickup or delivery assigned to them. */
async function tellDriver(supabase: ReturnType<typeof createClient>, kind: "pickup" | "delivery", id: string, driverId: string | null) {
  if (!driverId) return;
  const { data: d } = await supabase.from("driver").select("employee_id").eq("id", driverId).maybeSingle();
  const employeeId = (d as { employee_id: string | null } | null)?.employee_id;
  if (!employeeId) return;
  const { data: row } = await supabase
    .from(kind)
    .select(kind === "pickup" ? "scheduled_window_start, customer:customer_id(full_name)" : "scheduled_window_start, order:order_id(order_number, customer:customer_id(full_name))")
    .eq("id", id)
    .maybeSingle();
  const r = row as any;
  const one = (x: any) => (Array.isArray(x) ? x[0] : x);
  const customer = kind === "pickup" ? one(r?.customer)?.full_name : one(one(r?.order)?.customer)?.full_name;
  const when = r?.scheduled_window_start
    ? new Date(r.scheduled_window_start).toLocaleString("en-IN", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" })
    : "no time set";
  await notify(
    { employeeIds: [employeeId] },
    { kind: `${kind}_assigned`, title: `New ${kind} for you`, body: `${customer ?? "Customer"} · ${when}`, staffUrl: "/work/runs" }
  );
}

export async function assignDriver(formData: FormData) {
  const kind = String(formData.get("kind") || "") === "pickup" ? "pickup" : "delivery";
  const id = String(formData.get("id") || "");
  const driver_id = String(formData.get("driver_id") || "") || null;
  if (!id) return;
  const supabase = createClient();
  const { error } = await supabase.from(kind).update({ driver_id }).eq("id", id);
  if (error) console.error(error);
  else await tellDriver(supabase, kind, id, driver_id);
  revalidatePath("/delivery");
}

async function getBranchId(supabase: ReturnType<typeof createClient>) {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return null;
  const { data: me } = await supabase.from("user").select("branch_id").eq("auth_user_id", auth.user.id).single();
  return me?.branch_id ?? null;
}

export async function addDriver(formData: FormData) {
  const full_name = String(formData.get("full_name") || "").trim();
  const phone = String(formData.get("phone") || "").trim();
  if (!full_name || !phone) return;
  const vehicle_number = String(formData.get("vehicle_number") || "").trim() || null;

  const supabase = createClient();
  const branch_id = await getBranchId(supabase);

  const { error } = await supabase.from("driver").insert({
    branch_id,
    full_name,
    phone,
    vehicle_number,
    is_active: true,
  });
  if (error) console.error(error);
  revalidatePath("/delivery");
}

export async function toggleDriverActive(formData: FormData) {
  const id = String(formData.get("id") || "");
  if (!id) return;
  const nextActive = String(formData.get("next_active") || "true") === "true";
  const supabase = createClient();
  const { error } = await supabase.from("driver").update({ is_active: nextActive }).eq("id", id);
  if (error) console.error(error);
  revalidatePath("/delivery");
}

export async function addDeliveryZone(formData: FormData) {
  const name = String(formData.get("name") || "").trim();
  if (!name) return;
  const prefixesRaw = String(formData.get("pincode_prefixes") || "").trim();
  const pincode_prefixes = prefixesRaw
    ? prefixesRaw.split(",").map((s) => s.trim()).filter(Boolean)
    : [];

  const supabase = createClient();
  const branch_id = await getBranchId(supabase);

  const { error } = await supabase.from("delivery_zone").insert({
    branch_id,
    name,
    pincode_prefixes,
  });
  if (error) console.error(error);
  revalidatePath("/delivery");
}

export async function addRoute(formData: FormData) {
  const driver_id = String(formData.get("driver_id") || "") || null;
  const delivery_zone_id = String(formData.get("delivery_zone_id") || "") || null;
  const route_date = String(formData.get("route_date") || "").trim();
  if (!route_date) return;

  const supabase = createClient();
  const branch_id = await getBranchId(supabase);

  const { error } = await supabase.from("route").insert({
    branch_id,
    driver_id,
    delivery_zone_id,
    route_date,
    status: "planned",
  });
  if (error) console.error(error);
  revalidatePath("/delivery");
}

export async function updateRouteStatus(formData: FormData) {
  const id = String(formData.get("id") || "");
  const status = String(formData.get("status") || "");
  if (!id || !status) return;
  const supabase = createClient();
  const { error } = await supabase.from("route").update({ status }).eq("id", id);
  if (error) console.error(error);
  revalidatePath("/delivery");
}

export async function createPickup(formData: FormData) {
  const order_id = String(formData.get("order_id") || "");
  if (!order_id) return;
  const route_id = String(formData.get("route_id") || "") || null;
  const customer_address_id = String(formData.get("customer_address_id") || "") || null;
  const scheduled_window_start = String(formData.get("scheduled_window_start") || "") || null;
  const scheduled_window_end = String(formData.get("scheduled_window_end") || "") || null;

  const supabase = createClient();
  const { data: order } = await supabase.from("order").select("customer_id").eq("id", order_id).single();
  if (!order) return;

  const driver_id = String(formData.get("driver_id") || "") || null;
  const { data: created, error } = await supabase
    .from("pickup")
    .insert({
      order_id,
      customer_id: order.customer_id,
      route_id,
      customer_address_id,
      scheduled_window_start,
      scheduled_window_end,
      status: "scheduled",
      driver_id,
    })
    .select("id")
    .single();
  if (error) console.error(error);
  else await tellDriver(supabase, "pickup", (created as { id: string }).id, driver_id);
  revalidatePath("/delivery");
}

export async function updatePickupStatus(formData: FormData) {
  const id = String(formData.get("id") || "");
  const status = String(formData.get("status") || "");
  if (!id || !status) return;
  const supabase = createClient();
  const { error } = await supabase.from("pickup").update({ status }).eq("id", id);
  if (error) console.error(error);
  revalidatePath("/delivery");
}

export async function createDelivery(formData: FormData) {
  const order_id = String(formData.get("order_id") || "");
  if (!order_id) return;
  const route_id = String(formData.get("route_id") || "") || null;
  const customer_address_id = String(formData.get("customer_address_id") || "") || null;
  const scheduled_window_start = String(formData.get("scheduled_window_start") || "") || null;
  const scheduled_window_end = String(formData.get("scheduled_window_end") || "") || null;

  const supabase = createClient();
  const driver_id = String(formData.get("driver_id") || "") || null;
  const { data: created, error } = await supabase
    .from("delivery")
    .insert({
      order_id,
      route_id,
      customer_address_id,
      scheduled_window_start,
      scheduled_window_end,
      status: "scheduled",
      driver_id,
    })
    .select("id")
    .single();
  if (error) console.error(error);
  else await tellDriver(supabase, "delivery", (created as { id: string }).id, driver_id);
  revalidatePath("/delivery");
}

export async function updateDeliveryStatus(formData: FormData) {
  const id = String(formData.get("id") || "");
  const status = String(formData.get("status") || "");
  if (!id || !status) return;
  const cashRaw = String(formData.get("cash_collected") || "").trim();
  const patch: { status: string; cash_collected_minor?: number } = { status };
  if (cashRaw) patch.cash_collected_minor = Math.round(Number(cashRaw) * 100);
  const supabase = createClient();
  const { error } = await supabase.from("delivery").update(patch).eq("id", id);
  if (error) console.error(error);
  revalidatePath("/delivery");
}
