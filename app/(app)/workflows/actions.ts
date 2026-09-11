"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

async function getBranchId(supabase: ReturnType<typeof createClient>) {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return null;
  const { data: me } = await supabase.from("user").select("branch_id").eq("auth_user_id", auth.user.id).single();
  return me?.branch_id ?? null;
}

export async function createWorkflow(formData: FormData) {
  const name = String(formData.get("name") || "").trim();
  if (!name) return;
  const service_id = String(formData.get("service_id") || "").trim() || null;
  const supabase = createClient();
  const branch_id = await getBranchId(supabase);
  const { error } = await supabase.from("workflow").insert({ name, service_id, branch_id, is_active: true });
  if (error) console.error(error);
  revalidatePath("/workflows");
}

export async function toggleWorkflowActive(formData: FormData) {
  const id = String(formData.get("id") || "");
  if (!id) return;
  const nextActive = String(formData.get("next_active") || "") === "true";
  const supabase = createClient();
  const { error } = await supabase.from("workflow").update({ is_active: nextActive }).eq("id", id);
  if (error) console.error(error);
  revalidatePath("/workflows");
}

export async function createWorkflowStage(formData: FormData) {
  const workflow_id = String(formData.get("workflow_id") || "");
  const name = String(formData.get("name") || "").trim();
  if (!workflow_id || !name) return;
  const sort_order = Number(formData.get("sort_order") || 0);
  const sla_minutes = formData.get("sla_minutes") ? Number(formData.get("sla_minutes")) : null;
  const supabase = createClient();
  const { error } = await supabase.from("workflow_stage").insert({ workflow_id, name, sort_order, sla_minutes });
  if (error) console.error(error);
  revalidatePath("/workflows");
}

export async function deleteWorkflowStage(formData: FormData) {
  const id = String(formData.get("id") || "");
  if (!id) return;
  const supabase = createClient();
  const { error } = await supabase.from("workflow_stage").delete().eq("id", id);
  if (error) console.error(error);
  revalidatePath("/workflows");
}
