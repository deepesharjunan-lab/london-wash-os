"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

async function getBranchId(supabase: ReturnType<typeof createClient>) {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return null;
  const { data: me } = await supabase.from("user").select("branch_id").eq("auth_user_id", auth.user.id).single();
  return me?.branch_id ?? null;
}

async function getUserId(supabase: ReturnType<typeof createClient>) {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return null;
  const { data: me } = await supabase.from("user").select("id").eq("auth_user_id", auth.user.id).single();
  return me?.id ?? null;
}

export async function createComplaint(formData: FormData) {
  const customer_id = String(formData.get("customer_id") || "");
  const subject = String(formData.get("subject") || "").trim();
  if (!customer_id || !subject) return;
  const order_id = String(formData.get("order_id") || "") || null;
  const description = String(formData.get("description") || "").trim() || null;
  const supabase = createClient();
  const branch_id = await getBranchId(supabase);
  const { error } = await supabase
    .from("complaint")
    .insert({ branch_id, customer_id, order_id, subject, description, status: "open" });
  if (error) console.error(error);
  revalidatePath("/complaints");
}

export async function updateComplaintStatus(formData: FormData) {
  const id = String(formData.get("id") || "");
  const status = String(formData.get("status") || "");
  if (!id || !status) return;
  const supabase = createClient();
  const { error } = await supabase.from("complaint").update({ status }).eq("id", id);
  if (error) console.error(error);
  revalidatePath("/complaints");
}

export async function assignComplaint(formData: FormData) {
  const id = String(formData.get("id") || "");
  if (!id) return;
  const assigned_to = String(formData.get("assigned_to") || "") || null;
  const supabase = createClient();
  const { error } = await supabase.from("complaint").update({ assigned_to }).eq("id", id);
  if (error) console.error(error);
  revalidatePath("/complaints");
}

export async function createRefund(formData: FormData) {
  const payment_id = String(formData.get("payment_id") || "");
  const reason = String(formData.get("reason") || "").trim();
  if (!payment_id || !reason) return;
  const amountRupees = Number(formData.get("amount") || 0);
  if (!amountRupees) return;
  const amount_minor = Math.round(amountRupees * 100);
  const supabase = createClient();
  const processed_by = await getUserId(supabase);
  const { error } = await supabase.from("refund").insert({ payment_id, amount_minor, reason, processed_by });
  if (error) console.error(error);
  revalidatePath("/complaints");
}
