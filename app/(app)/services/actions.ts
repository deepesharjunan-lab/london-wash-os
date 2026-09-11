"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

async function getMyBranch() {
  const supabase = createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return { supabase, branchId: null as string | null };
  const { data: me } = await supabase
    .from("user")
    .select("branch_id")
    .eq("auth_user_id", auth.user.id)
    .single();
  return { supabase, branchId: (me?.branch_id as string | undefined) ?? null };
}

export async function createServiceCategory(formData: FormData) {
  const name = String(formData.get("name") || "").trim();
  if (!name) return;
  const { supabase, branchId } = await getMyBranch();
  if (!branchId) return;
  await supabase.from("service_category").insert({ branch_id: branchId, name });
  revalidatePath("/services");
}

export async function createService(formData: FormData) {
  const name = String(formData.get("name") || "").trim();
  const service_category_id = String(formData.get("service_category_id") || "");
  const default_unit = String(formData.get("default_unit") || "piece");
  if (!name || !service_category_id) return;
  const { supabase, branchId } = await getMyBranch();
  if (!branchId) return;
  await supabase
    .from("service")
    .insert({ branch_id: branchId, name, service_category_id, default_unit });
  revalidatePath("/services");
}

export async function createItem(formData: FormData) {
  const name = String(formData.get("name") || "").trim();
  const category = String(formData.get("category") || "").trim();
  if (!name) return;
  const { supabase, branchId } = await getMyBranch();
  if (!branchId) return;
  await supabase.from("item").insert({ branch_id: branchId, name, category: category || null });
  revalidatePath("/services");
}

export async function createPriceListProfile(formData: FormData) {
  const name = String(formData.get("name") || "").trim();
  const description = String(formData.get("description") || "").trim();
  const is_default = formData.get("is_default") === "on";
  if (!name) return;
  const { supabase, branchId } = await getMyBranch();
  if (!branchId) return;
  await supabase
    .from("price_list_profile")
    .insert({ branch_id: branchId, name, description: description || null, is_default });
  revalidatePath("/services");
}

export async function createPriceListEntry(formData: FormData) {
  const price_list_profile_id = String(formData.get("price_list_profile_id") || "");
  const service_id = String(formData.get("service_id") || "");
  const item_id = String(formData.get("item_id") || "") || null;
  const priceRupees = Number(formData.get("price") || 0);
  const unit = String(formData.get("unit") || "piece");
  if (!price_list_profile_id || !service_id || !priceRupees) return;
  const { supabase } = await getMyBranch();
  await supabase.from("price_list_entry").insert({
    price_list_profile_id,
    service_id,
    item_id,
    price_minor: Math.round(priceRupees * 100),
    unit,
  });
  revalidatePath("/services");
}
