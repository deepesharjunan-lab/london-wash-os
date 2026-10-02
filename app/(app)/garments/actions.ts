"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// Garments are created with the order and moved by the staff app's scans, so
// the only thing recorded here is a condition note against a garment.

async function getUserId(supabase: ReturnType<typeof createClient>) {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return null;
  const { data: me } = await supabase.from("user").select("id").eq("auth_user_id", auth.user.id).single();
  return me?.id ?? null;
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
