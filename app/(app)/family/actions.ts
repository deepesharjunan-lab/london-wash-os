"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

async function getBranchId(supabase: ReturnType<typeof createClient>) {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return null;
  const { data: me } = await supabase.from("user").select("branch_id").eq("auth_user_id", auth.user.id).single();
  return me?.branch_id ?? null;
}

export async function createFamilyAccount(formData: FormData) {
  const name = String(formData.get("name") || "").trim();
  if (!name) return;
  const primary_customer_id = String(formData.get("primary_customer_id") || "").trim() || null;
  const supabase = createClient();
  const branch_id = await getBranchId(supabase);
  const { error } = await supabase.from("family_account").insert({ name, primary_customer_id, branch_id });
  if (error) console.error(error);
  revalidatePath("/family");
}

export async function assignCustomerToFamily(formData: FormData) {
  const customer_id = String(formData.get("customer_id") || "");
  const family_account_id = String(formData.get("family_account_id") || "");
  if (!customer_id || !family_account_id) return;
  const supabase = createClient();
  const { error } = await supabase.from("customer").update({ family_account_id }).eq("id", customer_id);
  if (error) console.error(error);
  revalidatePath("/family");
}

export async function createWorkstation(formData: FormData) {
  const name = String(formData.get("name") || "").trim();
  if (!name) return;
  const workflow_stage_id = String(formData.get("workflow_stage_id") || "").trim() || null;
  const supabase = createClient();
  const branch_id = await getBranchId(supabase);
  const { error } = await supabase.from("workstation").insert({ name, workflow_stage_id, branch_id, is_active: true });
  if (error) console.error(error);
  revalidatePath("/family");
}

export async function toggleWorkstationActive(formData: FormData) {
  const id = String(formData.get("id") || "");
  if (!id) return;
  const nextActive = String(formData.get("next_active") || "") === "true";
  const supabase = createClient();
  const { error } = await supabase.from("workstation").update({ is_active: nextActive }).eq("id", id);
  if (error) console.error(error);
  revalidatePath("/family");
}
