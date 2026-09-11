"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

async function getBranchId(supabase: ReturnType<typeof createClient>) {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return null;
  const { data: me } = await supabase.from("user").select("branch_id").eq("auth_user_id", auth.user.id).single();
  return me?.branch_id ?? null;
}

export async function createClaim(formData: FormData) {
  const complaint_id = String(formData.get("complaint_id") || "");
  if (!complaint_id) return;
  const garment_id = String(formData.get("garment_id") || "").trim() || null;
  const amountRupees = Number(formData.get("claimed_amount") || 0);
  const claimed_amount_minor = amountRupees ? Math.round(amountRupees * 100) : null;
  const supabase = createClient();
  const { error } = await supabase
    .from("claim")
    .insert({ complaint_id, garment_id, claimed_amount_minor, status: "open" });
  if (error) console.error(error);
  revalidatePath("/claims");
}

export async function updateClaimStatus(formData: FormData) {
  const id = String(formData.get("id") || "");
  const status = String(formData.get("status") || "");
  if (!id || !status) return;
  const supabase = createClient();
  const { error } = await supabase.from("claim").update({ status }).eq("id", id);
  if (error) console.error(error);
  revalidatePath("/claims");
}

export async function createCollectionPoint(formData: FormData) {
  const name = String(formData.get("name") || "").trim();
  if (!name) return;
  const address = String(formData.get("address") || "").trim() || null;
  const contact_phone = String(formData.get("contact_phone") || "").trim() || null;
  const supabase = createClient();
  const branch_id = await getBranchId(supabase);
  const { error } = await supabase.from("collection_point").insert({ name, address, contact_phone, branch_id });
  if (error) console.error(error);
  revalidatePath("/claims");
}

export async function deleteCollectionPoint(formData: FormData) {
  const id = String(formData.get("id") || "");
  if (!id) return;
  const supabase = createClient();
  const { error } = await supabase.from("collection_point").delete().eq("id", id);
  if (error) console.error(error);
  revalidatePath("/claims");
}
