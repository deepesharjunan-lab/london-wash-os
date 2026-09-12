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

export async function createLeaveRequest(formData: FormData) {
  const employee_id = String(formData.get("employee_id") || "");
  const leave_type = String(formData.get("leave_type") || "").trim();
  const starts_on = String(formData.get("starts_on") || "");
  const ends_on = String(formData.get("ends_on") || "");
  if (!employee_id || !leave_type || !starts_on || !ends_on) return;
  const supabase = createClient();
  const { error } = await supabase.from("leave").insert({
    employee_id,
    leave_type,
    starts_on,
    ends_on,
    status: "requested",
  });
  if (error) console.error(error);
  revalidatePath("/payroll");
}

export async function updateLeaveStatus(formData: FormData) {
  const id = String(formData.get("id") || "");
  const status = String(formData.get("status") || "");
  if (!id || !status) return;
  const supabase = createClient();
  const patch: any = { status };
  if (status === "approved" || status === "rejected") {
    patch.approved_by = await currentAppUserId(supabase);
  }
  const { error } = await supabase.from("leave").update(patch).eq("id", id);
  if (error) console.error(error);
  revalidatePath("/payroll");
}

export async function createPayrollRun(formData: FormData) {
  const employee_id = String(formData.get("employee_id") || "");
  const period_start = String(formData.get("period_start") || "");
  const period_end = String(formData.get("period_end") || "");
  const grossRaw = String(formData.get("gross") || "").trim();
  const deductionsRaw = String(formData.get("deductions") || "0").trim();
  if (!employee_id || !period_start || !period_end || !grossRaw) return;
  const gross = Number(grossRaw);
  const deductions = Number(deductionsRaw || "0");
  if (!Number.isFinite(gross) || gross < 0) return;
  const gross_minor = Math.round(gross * 100);
  const deductions_minor = Math.round((Number.isFinite(deductions) ? deductions : 0) * 100);
  const net_minor = gross_minor - deductions_minor;
  const supabase = createClient();
  const { error } = await supabase.from("payroll").insert({
    employee_id,
    period_start,
    period_end,
    gross_minor,
    deductions_minor,
    net_minor,
    currency: "INR",
    status: "draft",
  });
  if (error) console.error(error);
  revalidatePath("/payroll");
}

export async function updatePayrollStatus(formData: FormData) {
  const id = String(formData.get("id") || "");
  const status = String(formData.get("status") || "");
  if (!id || !status) return;
  const supabase = createClient();
  const { error } = await supabase.from("payroll").update({ status }).eq("id", id);
  if (error) console.error(error);
  revalidatePath("/payroll");
}
