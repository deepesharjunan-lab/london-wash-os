"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { hashPin, last10 } from "@/lib/staff/session";
import { isAppRole } from "@/lib/staff/roles";
import { validLatLng } from "@/lib/geo";
import { istDate } from "@/lib/time";

const back = (msg: { ok?: string; error?: string }) =>
  redirect(`/staff?${msg.error ? `error=${encodeURIComponent(msg.error)}` : `ok=${encodeURIComponent(msg.ok ?? "Saved.")}`}`);

async function me(supabase: ReturnType<typeof createClient>) {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return null;
  const { data } = await supabase.from("user").select("id, branch_id").eq("auth_user_id", auth.user.id).single();
  return data as { id: string; branch_id: string } | null;
}

export async function addEmployee(formData: FormData) {
  const full_name = String(formData.get("full_name") || "").trim();
  const role_title = String(formData.get("role_title") || "").trim() || null;
  const phone = String(formData.get("phone") || "").trim() || null;
  const date_joined = String(formData.get("date_joined") || "").trim() || null;
  const salaryRaw = String(formData.get("monthly_salary") || "").trim();
  const monthly_salary_minor = salaryRaw ? Math.round(Number(salaryRaw) * 100) : null;
  const appRole = String(formData.get("app_role") || "");
  const pin = String(formData.get("pin") || "").replace(/\D/g, "");
  if (!full_name) return;

  const supabase = createClient();
  const user = await me(supabase);
  if (!user) return;

  if (isAppRole(appRole)) {
    if (last10(phone).length !== 10) back({ error: "A 10-digit mobile number is needed for staff app access." });
    if (!/^\d{4,6}$/.test(pin)) back({ error: "Set a 4 to 6 digit PIN for staff app access." });
  }

  const { data: created, error } = await supabase
    .from("employee")
    .insert({
      branch_id: user.branch_id,
      full_name,
      role_title,
      phone,
      date_joined,
      monthly_salary_minor,
      ...(isAppRole(appRole) ? { app_role: appRole, pin_hash: hashPin(pin) } : {}),
    })
    .select("id")
    .single();
  if (error) {
    console.error(error);
    back({ error: error.code === "23505" ? "Another staff member already uses that mobile number for the app." : "Couldn't add the employee." });
  }
  if (isAppRole(appRole) && appRole === "driver" && created) await ensureDriver(supabase, (created as { id: string }).id);
  revalidatePath("/staff");
  back({ ok: `${full_name} added.${isAppRole(appRole) ? " They can now sign in to the staff app with their mobile number and PIN." : ""}` });
}

/** Staff app access: role and PIN. An empty role removes access. */
export async function setStaffApp(formData: FormData) {
  const employeeId = String(formData.get("employee_id") || "");
  const appRole = String(formData.get("app_role") || "");
  const pin = String(formData.get("pin") || "").replace(/\D/g, "");
  const phoneInput = String(formData.get("phone") || "").trim();
  const supabase = createClient();
  if (!(await me(supabase))) return;
  const { data } = await supabase.from("employee").select("id, full_name, phone, app_role, pin_hash, session_version").eq("id", employeeId).maybeSingle();
  const e = data as { id: string; full_name: string; phone: string | null; app_role: string | null; pin_hash: string | null; session_version: number } | null;
  if (!e) back({ error: "Employee not found." });
  const emp = e!;

  if (!appRole) {
    await supabase.from("employee").update({ app_role: null, device_id: null, session_version: (emp.session_version || 1) + 1 }).eq("id", emp.id);
    revalidatePath("/staff");
    back({ ok: `${emp.full_name} no longer has staff app access.` });
  }
  if (!isAppRole(appRole)) back({ error: "Choose a role." });
  const phone = phoneInput || emp.phone;
  if (last10(phone).length !== 10) back({ error: "Add a 10-digit mobile number first." });
  if (!emp.pin_hash && !/^\d{4,6}$/.test(pin)) back({ error: "Set a 4 to 6 digit PIN." });
  if (pin && !/^\d{4,6}$/.test(pin)) back({ error: "The PIN must be 4 to 6 digits." });

  const patch: Record<string, unknown> = { app_role: appRole, phone };
  if (pin) {
    patch.pin_hash = hashPin(pin);
    patch.pin_failed_attempts = 0;
    patch.pin_locked_until = null;
    patch.session_version = (emp.session_version || 1) + 1; // a new PIN signs the old session out
  }
  const { error } = await supabase.from("employee").update(patch).eq("id", emp.id);
  if (error) back({ error: error.code === "23505" ? "Another staff member already uses that mobile number for the app." : "Couldn't save." });
  if (appRole === "driver") await ensureDriver(supabase, emp.id);
  revalidatePath("/staff");
  back({ ok: `Saved. ${emp.full_name} signs in with ${phone} and ${pin ? "the new PIN" : "their PIN"}.` });
}

/** Unlinks the phone so the staff member can sign in on a new one. Also signs them out. */
export async function resetStaffDevice(formData: FormData) {
  const employeeId = String(formData.get("employee_id") || "");
  const supabase = createClient();
  if (!(await me(supabase))) return;
  const { data } = await supabase.from("employee").select("full_name, session_version").eq("id", employeeId).maybeSingle();
  if (!data) back({ error: "Employee not found." });
  await supabase
    .from("employee")
    .update({ device_id: null, pin_failed_attempts: 0, pin_locked_until: null, session_version: Number((data as any).session_version || 1) + 1 })
    .eq("id", employeeId);
  revalidatePath("/staff");
  back({ ok: `${(data as any).full_name} can now sign in on a new phone.` });
}

/** Makes sure a driver (staff app role) has a driver record, so pickups and deliveries can be assigned. */
async function ensureDriver(supabase: ReturnType<typeof createClient>, employeeId: string) {
  const { data: linked } = await supabase.from("driver").select("id").eq("employee_id", employeeId).maybeSingle();
  if (linked) return;
  const { data: e } = await supabase.from("employee").select("full_name, phone, branch_id").eq("id", employeeId).single();
  const emp = e as { full_name: string; phone: string | null; branch_id: string };
  const { data: drivers } = await supabase.from("driver").select("id, phone, employee_id").is("employee_id", null).is("deleted_at", null);
  const match = ((drivers ?? []) as any[]).find((d) => last10(d.phone) === last10(emp.phone) && last10(emp.phone).length === 10);
  if (match) {
    await supabase.from("driver").update({ employee_id: employeeId, is_active: true }).eq("id", match.id);
  } else {
    await supabase.from("driver").insert({ branch_id: emp.branch_id, full_name: emp.full_name, phone: emp.phone ?? "", employee_id: employeeId, is_active: true });
  }
}

export async function saveBranchLocation(formData: FormData) {
  const lat = Number(formData.get("latitude"));
  const lng = Number(formData.get("longitude"));
  const radius = Math.round(Number(formData.get("radius") || 100));
  const supabase = createClient();
  const user = await me(supabase);
  if (!user) return;
  if (!validLatLng(lat, lng)) back({ error: "Enter a valid latitude and longitude, or use this device's location." });
  if (!(radius >= 20 && radius <= 2000)) back({ error: "The radius must be between 20 and 2000 metres." });
  const { error } = await supabase
    .from("branch")
    .update({ latitude: Math.round(lat * 1e6) / 1e6, longitude: Math.round(lng * 1e6) / 1e6, punch_radius_m: radius })
    .eq("id", user.branch_id);
  if (error) back({ error: "Couldn't save the branch location." });
  revalidatePath("/staff");
  back({ ok: `Branch location saved. Staff can punch in within ${radius} m.` });
}

export async function checkInStaff(formData: FormData) {
  const employeeId = String(formData.get("employee_id") || "");
  if (!employeeId) return;
  const supabase = createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return;
  const today = istDate();

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
    source: "console",
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
  const today = istDate();

  const { error } = await supabase
    .from("attendance")
    .update({ check_out: new Date().toISOString() })
    .eq("employee_id", employeeId)
    .eq("work_date", today)
    .is("check_out", null);
  if (error) console.error(error);
  revalidatePath("/staff");
}
