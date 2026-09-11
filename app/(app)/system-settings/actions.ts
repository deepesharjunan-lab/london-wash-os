"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

async function getContext(supabase: ReturnType<typeof createClient>) {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return null;
  const { data: me } = await supabase
    .from("user")
    .select("branch_id, branch:branch_id(organization_id)")
    .eq("auth_user_id", auth.user.id)
    .single();
  return me;
}

export async function updateOrganization(formData: FormData) {
  const id = String(formData.get("id") || "");
  if (!id) return;
  const name = String(formData.get("name") || "").trim();
  const legal_name = String(formData.get("legal_name") || "").trim() || null;
  const gstin = String(formData.get("gstin") || "").trim() || null;
  const default_currency = String(formData.get("default_currency") || "").trim();
  if (!name || !default_currency) return;
  const supabase = createClient();
  const { error } = await supabase
    .from("organization")
    .update({ name, legal_name, gstin, default_currency })
    .eq("id", id);
  if (error) console.error(error);
  revalidatePath("/system-settings");
}

export async function createSystemSetting(formData: FormData) {
  const key = String(formData.get("key") || "").trim();
  const value = String(formData.get("value") || "").trim();
  if (!key || !value) return;
  const supabase = createClient();
  const ctx = await getContext(supabase);
  const organization_id = (ctx as any)?.branch?.organization_id;
  if (!organization_id) return;
  let parsedValue: any = value;
  try {
    parsedValue = JSON.parse(value);
  } catch {
    parsedValue = value;
  }
  const { error } = await supabase
    .from("system_setting")
    .insert({ organization_id, branch_id: ctx?.branch_id ?? null, key, value: parsedValue });
  if (error) console.error(error);
  revalidatePath("/system-settings");
}

export async function deleteSystemSetting(formData: FormData) {
  const id = String(formData.get("id") || "");
  if (!id) return;
  const supabase = createClient();
  const { error } = await supabase.from("system_setting").delete().eq("id", id);
  if (error) console.error(error);
  revalidatePath("/system-settings");
}
