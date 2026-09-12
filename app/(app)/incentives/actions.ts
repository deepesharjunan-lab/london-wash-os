"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function createIncentive(formData: FormData) {
  const employee_id = String(formData.get("employee_id") || "");
  const amountRaw = String(formData.get("amount") || "").trim();
  const currency = String(formData.get("currency") || "INR").trim() || "INR";
  const reason = String(formData.get("reason") || "").trim();
  if (!employee_id || !amountRaw) return;
  const amount = Number(amountRaw);
  if (!Number.isFinite(amount) || amount <= 0) return;
  const amount_minor = Math.round(amount * 100);
  const supabase = createClient();
  const { error } = await supabase.from("incentive").insert({
    employee_id,
    amount_minor,
    currency,
    reason: reason || null,
  });
  if (error) console.error(error);
  revalidatePath("/incentives");
}

export async function deleteIncentive(formData: FormData) {
  const id = String(formData.get("id") || "");
  if (!id) return;
  const supabase = createClient();
  const { error } = await supabase.from("incentive").delete().eq("id", id);
  if (error) console.error(error);
  revalidatePath("/incentives");
}
