"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

async function getBranchId(supabase: ReturnType<typeof createClient>) {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return null;
  const { data: me } = await supabase.from("user").select("branch_id").eq("auth_user_id", auth.user.id).single();
  return me?.branch_id ?? null;
}

export async function createCorporateAccount(formData: FormData) {
  const name = String(formData.get("name") || "").trim();
  if (!name) return;
  const gstin = String(formData.get("gstin") || "").trim() || null;
  const billing_cycle = String(formData.get("billing_cycle") || "").trim() || null;
  const supabase = createClient();
  const branch_id = await getBranchId(supabase);
  const { error } = await supabase
    .from("corporate_account")
    .insert({ branch_id, name, gstin, billing_cycle, is_active: true });
  if (error) console.error(error);
  revalidatePath("/corporate");
}

export async function toggleCorporateActive(formData: FormData) {
  const id = String(formData.get("id") || "");
  if (!id) return;
  const nextActive = String(formData.get("next_active") || "") === "true";
  const supabase = createClient();
  const { error } = await supabase.from("corporate_account").update({ is_active: nextActive }).eq("id", id);
  if (error) console.error(error);
  revalidatePath("/corporate");
}

export async function createCorporateAddress(formData: FormData) {
  const corporate_account_id = String(formData.get("corporate_account_id") || "");
  const address_line = String(formData.get("address_line") || "").trim();
  if (!corporate_account_id || !address_line) return;
  const label = String(formData.get("label") || "").trim() || null;
  const city = String(formData.get("city") || "").trim() || null;
  const state = String(formData.get("state") || "").trim() || null;
  const pincode = String(formData.get("pincode") || "").trim() || null;
  const supabase = createClient();
  const { error } = await supabase
    .from("corporate_address")
    .insert({ corporate_account_id, label, address_line, city, state, pincode });
  if (error) console.error(error);
  revalidatePath("/corporate");
}

export async function createCorporateContact(formData: FormData) {
  const corporate_account_id = String(formData.get("corporate_account_id") || "");
  const full_name = String(formData.get("full_name") || "").trim();
  if (!corporate_account_id || !full_name) return;
  const phone = String(formData.get("phone") || "").trim() || null;
  const email = String(formData.get("email") || "").trim() || null;
  const is_primary = String(formData.get("is_primary") || "") === "true";
  const supabase = createClient();
  const { error } = await supabase
    .from("corporate_contact")
    .insert({ corporate_account_id, full_name, phone, email, is_primary });
  if (error) console.error(error);
  revalidatePath("/corporate");
}
