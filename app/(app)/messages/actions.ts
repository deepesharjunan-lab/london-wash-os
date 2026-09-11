"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function logMessage(formData: FormData) {
  const customer_id = String(formData.get("customer_id") || "");
  const channel = String(formData.get("channel") || "");
  const direction = String(formData.get("direction") || "");
  const body = String(formData.get("body") || "").trim();
  if (!customer_id || !channel || !direction || !body) return;
  const supabase = createClient();
  const { error } = await supabase.from("message").insert({ customer_id, channel, direction, body });
  if (error) console.error(error);
  revalidatePath("/messages");
}

export async function sendNotification(formData: FormData) {
  const customer_id = String(formData.get("customer_id") || "").trim() || null;
  const user_id = String(formData.get("user_id") || "").trim() || null;
  const channel = String(formData.get("channel") || "");
  const template_code = String(formData.get("template_code") || "").trim();
  if ((!customer_id && !user_id) || !channel || !template_code) return;
  const supabase = createClient();
  const { error } = await supabase
    .from("notification")
    .insert({ customer_id, user_id, channel, template_code, status: "queued", payload: {} });
  if (error) console.error(error);
  revalidatePath("/messages");
}

export async function updateNotificationStatus(formData: FormData) {
  const id = String(formData.get("id") || "");
  const status = String(formData.get("status") || "");
  if (!id || !status) return;
  const supabase = createClient();
  const { error } = await supabase.from("notification").update({ status }).eq("id", id);
  if (error) console.error(error);
  revalidatePath("/messages");
}
