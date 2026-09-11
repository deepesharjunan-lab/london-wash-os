"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

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
