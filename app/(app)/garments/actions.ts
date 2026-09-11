"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

async function getUserId(supabase: ReturnType<typeof createClient>) {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return null;
  const { data: me } = await supabase.from("user").select("id").eq("auth_user_id", auth.user.id).single();
  return me?.id ?? null;
}

export async function createGarment(formData: FormData) {
  const order_item_id = String(formData.get("order_item_id") || "");
  if (!order_item_id) return;
  const tag_code = String(formData.get("tag_code") || "").trim() || null;
  const supabase = createClient();
  const { error } = await supabase.from("garment").insert({ order_item_id, tag_code });
  if (error) console.error(error);
  revalidatePath("/garments");
}

export async function createGarmentCondition(formData: FormData) {
  const garment_id = String(formData.get("garment_id") || "");
  const tag = String(formData.get("tag") || "");
  if (!garment_id || !tag) return;
  const note = String(formData.get("note") || "").trim() || null;
  const supabase = createClient();
  const recorded_by = await getUserId(supabase);
  const { error } = await supabase.from("garment_condition").insert({ garment_id, tag, note, recorded_by });
  if (error) console.error(error);
  revalidatePath("/garments");
}

export async function createGarmentEvent(formData: FormData) {
  const garment_id = String(formData.get("garment_id") || "");
  const event_type = String(formData.get("event_type") || "").trim();
  if (!garment_id || !event_type) return;
  const supabase = createClient();
  const { data: auth } = await supabase.auth.getUser();
  const { data: me } = auth?.user
    ? await supabase.from("user").select("id").eq("auth_user_id", auth.user.id).single()
    : { data: null };
  const { error } = await supabase
    .from("garment_event")
    .insert({ garment_id, event_type, actor_user_id: me?.id ?? null, metadata: {} });
  if (error) console.error(error);
  revalidatePath("/garments");
}
