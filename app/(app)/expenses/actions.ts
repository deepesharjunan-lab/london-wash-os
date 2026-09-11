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

export async function createExpense(formData: FormData) {
  const category = String(formData.get("category") || "").trim();
  const amountRupees = Number(formData.get("amount") || 0);
  if (!category || !amountRupees) return;
  const amount_minor = Math.round(amountRupees * 100);
  const financial_account_id = String(formData.get("financial_account_id") || "") || null;
  const note = String(formData.get("note") || "").trim() || null;
  const supabase = createClient();
  const branch_id = await getBranchId(supabase);
  const recorded_by = await getUserId(supabase);
  const { error } = await supabase
    .from("expense")
    .insert({ branch_id, financial_account_id, category, amount_minor, currency: "INR", note, recorded_by });
  if (error) console.error(error);
  revalidatePath("/expenses");
}

export async function createMachine(formData: FormData) {
  const name = String(formData.get("name") || "").trim();
  if (!name) return;
  const machine_type = String(formData.get("machine_type") || "").trim() || null;
  const workstation_id = String(formData.get("workstation_id") || "") || null;
  const supabase = createClient();
  const branch_id = await getBranchId(supabase);
  const { error } = await supabase
    .from("machine")
    .insert({ branch_id, name, machine_type, workstation_id, is_active: true });
  if (error) console.error(error);
  revalidatePath("/expenses");
}

export async function toggleMachineActive(formData: FormData) {
  const id = String(formData.get("id") || "");
  if (!id) return;
  const nextActive = String(formData.get("next_active") || "") === "true";
  const supabase = createClient();
  const { error } = await supabase.from("machine").update({ is_active: nextActive }).eq("id", id);
  if (error) console.error(error);
  revalidatePath("/expenses");
}
