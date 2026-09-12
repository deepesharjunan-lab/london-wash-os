"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

async function getContext(supabase: ReturnType<typeof createClient>) {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return null;
  const { data: me } = await supabase
    .from("user")
    .select("id, organization_id, branch_id")
    .eq("auth_user_id", auth.user.id)
    .single();
  return me;
}

export async function createAuditLogEntry(formData: FormData) {
  const action = String(formData.get("action") || "").trim();
  const entity_type = String(formData.get("entity_type") || "").trim();
  if (!action || !entity_type) return;
  const supabase = createClient();
  const ctx = await getContext(supabase);
  if (!ctx) return;
  const { error } = await supabase.from("audit_log").insert({
    organization_id: ctx.organization_id,
    branch_id: ctx.branch_id,
    actor_user_id: ctx.id,
    action,
    entity_type,
  });
  if (error) console.error(error);
  revalidatePath("/sysops");
}

export async function createAutomationRule(formData: FormData) {
  const name = String(formData.get("name") || "").trim();
  const trigger_event = String(formData.get("trigger_event") || "").trim();
  if (!name || !trigger_event) return;
  const conditionRaw = String(formData.get("condition") || "").trim();
  const actionRaw = String(formData.get("action") || "").trim();
  let condition: any = {};
  let action: any = {};
  try {
    condition = conditionRaw ? JSON.parse(conditionRaw) : {};
  } catch {
    condition = { raw: conditionRaw };
  }
  try {
    action = actionRaw ? JSON.parse(actionRaw) : {};
  } catch {
    action = { raw: actionRaw };
  }
  const supabase = createClient();
  const ctx = await getContext(supabase);
  if (!ctx?.branch_id) return;
  const { error } = await supabase
    .from("automation_rule")
    .insert({ branch_id: ctx.branch_id, name, trigger_event, condition, action, is_active: true });
  if (error) console.error(error);
  revalidatePath("/sysops");
}

export async function toggleAutomationRule(formData: FormData) {
  const id = String(formData.get("id") || "");
  const next_active = String(formData.get("next_active") || "") === "true";
  if (!id) return;
  const supabase = createClient();
  const { error } = await supabase.from("automation_rule").update({ is_active: next_active }).eq("id", id);
  if (error) console.error(error);
  revalidatePath("/sysops");
}

export async function deleteAutomationRule(formData: FormData) {
  const id = String(formData.get("id") || "");
  if (!id) return;
  const supabase = createClient();
  const { error } = await supabase.from("automation_rule").delete().eq("id", id);
  if (error) console.error(error);
  revalidatePath("/sysops");
}

export async function createFinancialAccount(formData: FormData) {
  const name = String(formData.get("name") || "").trim();
  const account_type = String(formData.get("account_type") || "").trim();
  if (!name || !account_type) return;
  const supabase = createClient();
  const ctx = await getContext(supabase);
  if (!ctx?.branch_id) return;
  const { error } = await supabase.from("financial_account").insert({ branch_id: ctx.branch_id, name, account_type });
  if (error) console.error(error);
  revalidatePath("/sysops");
}

export async function deleteFinancialAccount(formData: FormData) {
  const id = String(formData.get("id") || "");
  if (!id) return;
  const supabase = createClient();
  const { error } = await supabase.from("financial_account").update({ deleted_at: new Date().toISOString() }).eq("id", id);
  if (error) console.error(error);
  revalidatePath("/sysops");
}
