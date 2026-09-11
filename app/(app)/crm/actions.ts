"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

async function getUserId(supabase: ReturnType<typeof createClient>) {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return null;
  const { data: me } = await supabase.from("user").select("id").eq("auth_user_id", auth.user.id).single();
  return me?.id ?? null;
}

export async function createCustomerNote(formData: FormData) {
  const customer_id = String(formData.get("customer_id") || "");
  const note = String(formData.get("note") || "").trim();
  if (!customer_id || !note) return;
  const supabase = createClient();
  const author_user_id = await getUserId(supabase);
  const { error } = await supabase.from("customer_note").insert({ customer_id, note, author_user_id });
  if (error) console.error(error);
  revalidatePath("/crm");
}

export async function createCustomerPreference(formData: FormData) {
  const customer_id = String(formData.get("customer_id") || "");
  const pref_key = String(formData.get("pref_key") || "").trim();
  const pref_value = String(formData.get("pref_value") || "").trim();
  if (!customer_id || !pref_key || !pref_value) return;
  const supabase = createClient();
  const { error } = await supabase.from("customer_preference").insert({ customer_id, pref_key, pref_value });
  if (error) console.error(error);
  revalidatePath("/crm");
}

export async function deleteCustomerPreference(formData: FormData) {
  const id = String(formData.get("id") || "");
  if (!id) return;
  const supabase = createClient();
  const { error } = await supabase.from("customer_preference").delete().eq("id", id);
  if (error) console.error(error);
  revalidatePath("/crm");
}

export async function createCustomerTag(formData: FormData) {
  const customer_id = String(formData.get("customer_id") || "");
  const tag = String(formData.get("tag") || "").trim();
  if (!customer_id || !tag) return;
  const supabase = createClient();
  const { error } = await supabase.from("customer_tag").insert({ customer_id, tag });
  if (error) console.error(error);
  revalidatePath("/crm");
}

export async function deleteCustomerTag(formData: FormData) {
  const id = String(formData.get("id") || "");
  if (!id) return;
  const supabase = createClient();
  const { error } = await supabase.from("customer_tag").delete().eq("id", id);
  if (error) console.error(error);
  revalidatePath("/crm");
}
