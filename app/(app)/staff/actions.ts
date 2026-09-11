"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function addEmployee(formData: FormData) {
  const full_name = String(formData.get("full_name") || "").trim();
  const role_title = String(formData.get("role_title") || "").trim() || null;
  const phone = String(formData.get("phone") || "").trim() || null;
  const date_joined = String(formData.get("date_joined") || "").trim() || null;
  const salaryRaw = String(formData.get("monthly_salary") || "").trim();
  const monthly_salary_minor = salaryRaw ? Math.round(Number(salaryRaw) * 100) : null;
  if (!full_name) return;

  const supabase = createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return;

  const { data: me } = await supabase
    .from("user")
    .select("branch_id")
    .eq("auth_user_id", auth.user.id)
    .single();
  if (!me) return;

  const { error } = await supabase.from("employee").insert({
    branch_id: me.branch_id,
    full_name,
    role_title,
    phone,
    date_joined,
    monthly_salary_minor,
  });
  if (error) console.error(error);
  revalidatePath("/staff");
}

export async function checkInStaff(formData: FormData) {
  const employeeId = String(formData.get("employee_id") || "");
  if (!employeeId) return;
  const supabase = createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return;
  const today = new Date().toISOString().slice(0, 10);

  const { data: existing } = await supabase
    .from("attendance")
    .select("id, check_out")
    .eq("employee_id", employeeId)
    .eq("work_date", today)
    .maybeSingle();

  if (existing) {
    revalidatePath("/staff");
    return;
  }

  const { error } = await supabase.from("attendance").insert({
    employee_id: employeeId,
    work_date: today,
    check_in: new Date().toISOString(),
    status: "present",
  });
  if (error) console.error(error);
  revalidatePath("/staff");
}

export async function checkOutStaff(formData: FormData) {
  const employeeId = String(formData.get("employee_id") || "");
  if (!employeeId) return;
  const supabase = createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return;
  const today = new Date().toISOString().slice(0, 10);

  const { error } = await supabase
    .from("attendance")
    .update({ check_out: new Date().toISOString(), status: "checked_out" })
    .eq("employee_id", employeeId)
    .eq("work_date", today)
    .is("check_out", null);
  if (error) console.error(error);
  revalidatePath("/staff");
}
