"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

async function getBranchId(supabase) {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return null;
  const { data: me } = await supabase.from("user").select("branch_id").eq("auth_user_id", auth.user.id).single();
  return me?.branch_id ?? null;
}

export async function addDriver(formData) {
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

export async function toggleDriverActive(formData) {
  const id = String(formData.get("id") || "");
  if (!id) return;
  const nextActive = String(formData.get("next_active") || "true") === "true";
  const supabase = createClient();
  const { error } = await supabase.from("driver").update({ is_active: nextActive }).eq("id", id);
  if (error) console.error(error);
  revalidatePath("/delivery");
}

export async function addDeliveryZone(formData) {
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

export async function addRoute(formData) {
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

export async function updateRouteStatus(formData) {
  const id = String(formData.get("id") || "");
  const status = String(formData.get("status") || "");
  if (!id || !status) return;
  const supabase = createClient();
  const { error } = await supabase.from("route").update({ status }).eq("id", id);
  if (error) console.error(error);
  revalidatePath("/delivery");
}

export async function createPickup(formData) {
  const order_id = String(formData.get("order_id") || "");
  if (!order_id) return;
  const route_id = String(formData.get("route_id") || "") || null;
  const customer_address_id = String(formData.get("customer_address_id") || "") || null;
  const scheduled_window_start = String(formData.get("scheduled_window_start") || "") || null;
  const scheduled_window_end = String(formData.get("scheduled_window_end") || "") || null;

  const supabase = createClient();
  const { data: order } = await supabase.from("order").select("customer_id").eq("id", order_id).single();
  if (!order) return;

  const { error } = await supabase.from("pickup").insert({
    order_id,
    customer_id: order.customer_id,
    route_id,
    customer_address_id,
    scheduled_window_start,
    scheduled_window_end,
    status: "scheduled",
  });
  if (error) console.error(error);
  revalidatePath("/delivery");
}

export async function updatePickupStatus(formData) {
  const id = String(formData.get("id") || "");
  const status = String(formData.get("status") || "");
  if (!id || !status) return;
  const supabase = createClient();
  const { error } = await supabase.from("pickup").update({ status }).eq("id", id);
  if (error) console.error(error);
  revalidatePath("/delivery");
}

export async function createDelivery(formData) {
  const order_id = String(formData.get("order_id") || "");
  if (!order_id) return;
  const route_id = String(formData.get("route_id") || "") || null;
  const customer_address_id = String(formData.get("customer_address_id") || "") || null;
  const scheduled_window_start = String(formData.get("scheduled_window_start") || "") || null;
  const scheduled_window_end = String(formData.get("scheduled_window_end") || "") || null;

  const supabase = createClient();
  const { error } = await supabase.from("delivery").insert({
    order_id,
    route_id,
    customer_address_id,
    scheduled_window_start,
    scheduled_window_end,
    status: "scheduled",
  });
  if (error) console.error(error);
  revalidatePath("/delivery");
}

export async function updateDeliveryStatus(formData) {
  const id = String(formData.get("id") || "");
  const status = String(formData.get("status") || "");
  if (!id || !status) return;
  const cashRaw = String(formData.get("cash_collected") || "").trim();
  const patch = { status };
  if (cashRaw) patch.cash_collected_minor = Math.round(Number(cashRaw) * 100);
  const supabase = createClient();
  const { error } = await supabase.from("delivery").update(patch).eq("id", id);
  if (error) console.error(error);
  revalidatePath("/delivery");
}
