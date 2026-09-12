"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

async function currentAppUserId(supabase: ReturnType<typeof createClient>) {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return null;
  const { data: me } = await supabase
    .from("user")
    .select("id")
    .eq("auth_user_id", auth.user.id)
    .single();
  return me?.id ?? null;
}

export async function createQualityCheck(formData: FormData) {
  const production_job_id = String(formData.get("production_job_id") || "");
  const result = String(formData.get("result") || "");
  const notes = String(formData.get("notes") || "").trim();
  if (!production_job_id || !result) return;
  const supabase = createClient();
  const checked_by = await currentAppUserId(supabase);
  const { error } = await supabase.from("quality_check").insert({
    production_job_id,
    result,
    notes: notes || null,
    checked_by,
  });
  if (error) console.error(error);
  revalidatePath("/quality");
}

export async function createReprocess(formData: FormData) {
  const quality_check_id = String(formData.get("quality_check_id") || "");
  const reason = String(formData.get("reason") || "").trim();
  if (!quality_check_id || !reason) return;
  const supabase = createClient();
  const { error } = await supabase.from("reprocess").insert({
    quality_check_id,
    reason,
  });
  if (error) console.error(error);
  revalidatePath("/quality");
}
