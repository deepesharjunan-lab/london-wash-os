"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

async function getBranchId(supabase: ReturnType<typeof createClient>) {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return null;
  const { data: me } = await supabase.from("user").select("id, branch_id").eq("auth_user_id", auth.user.id).single();
  return me;
}

export async function createPackedBag(formData: FormData) {
  const order_id = String(formData.get("order_id") || "");
  const bag_code = String(formData.get("bag_code") || "").trim();
  if (!order_id || !bag_code) return;
  const supabase = createClient();
  const me = await getBranchId(supabase);
  const { error } = await supabase
    .from("packed_bag")
    .insert({ order_id, bag_code, branch_id: me?.branch_id ?? null, packed_by: me?.id ?? null });
  if (error) console.error(error);
  revalidatePath("/packing");
}

export async function addGarmentToBag(formData: FormData) {
  const packed_bag_id = String(formData.get("packed_bag_id") || "");
  const garment_id = String(formData.get("garment_id") || "");
  if (!packed_bag_id || !garment_id) return;
  const supabase = createClient();
  const { error } = await supabase.from("packed_bag_garment").insert({ packed_bag_id, garment_id });
  if (error) console.error(error);
  revalidatePath("/packing");
}

export async function removeGarmentFromBag(formData: FormData) {
  const packed_bag_id = String(formData.get("packed_bag_id") || "");
  const garment_id = String(formData.get("garment_id") || "");
  if (!packed_bag_id || !garment_id) return;
  const supabase = createClient();
  const { error } = await supabase
    .from("packed_bag_garment")
    .delete()
    .eq("packed_bag_id", packed_bag_id)
    .eq("garment_id", garment_id);
  if (error) console.error(error);
  revalidatePath("/packing");
}
