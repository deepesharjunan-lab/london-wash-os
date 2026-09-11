"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function addApprovalRule(formData: FormData) {
  const action_type = String(formData.get("action_type") || "").trim();
  if (!action_type) return;
  const thresholdAmountRaw = String(formData.get("threshold_amount") || "").trim();
  const thresholdPercentRaw = String(formData.get("threshold_percent") || "").trim();
  const escalateRaw = String(formData.get("escalate_after_minutes") || "").trim();
  const scope = String(formData.get("scope") || "branch");

  const threshold_amount_minor = thresholdAmountRaw
    ? Math.round(Number(thresholdAmountRaw) * 100)
    : null;
  const threshold_percent = thresholdPercentRaw ? Number(thresholdPercentRaw) : null;
  const escalate_after_minutes = escalateRaw ? Number(escalateRaw) : null;

  const supabase = createClient();
  let branch_id: string | null = null;
  if (scope === "branch") {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) return;
    const { data: me } = await supabase
      .from("user")
      .select("branch_id")
      .eq("auth_user_id", auth.user.id)
      .single();
    if (!me) return;
    branch_id = me.branch_id;
  }

  const { error } = await supabase.from("approval_rule").insert({
    action_type,
    branch_id,
    threshold_amount_minor,
    threshold_percent,
    escalate_after_minutes,
    approver_roles: [],
    is_active: true,
  });
  if (error) console.error(error);
  revalidatePath("/approvals");
}

export async function toggleApprovalRule(formData: FormData) {
  const id = String(formData.get("id") || "");
  if (!id) return;
  const nextActive = String(formData.get("next_active") || "true") === "true";
  const supabase = createClient();
  const { error } = await supabase
    .from("approval_rule")
    .update({ is_active: nextActive })
    .eq("id", id);
  if (error) console.error(error);
  revalidatePath("/approvals");
}
