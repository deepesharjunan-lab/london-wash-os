import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { APP_ROLES, ROLE_LABEL, roleLabel } from "@/lib/staff/roles";
import { istDate } from "@/lib/time";
import { addEmployee, checkInStaff, checkOutStaff, resetStaffDevice, setStaffApp } from "./actions";
import { BranchLocationForm } from "./BranchLocationForm";

function formatTime(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" });
}

export default async function StaffPage({ searchParams }: { searchParams: { ok?: string; error?: string } }) {
  const supabase = createClient();
  const { data: auth } = await supabase.auth.getUser();
  const { data: meRow } = auth?.user
    ? await supabase.from("user").select("branch:branch_id(id, name, latitude, longitude, punch_radius_m)").eq("auth_user_id", auth.user.id).maybeSingle()
    : { data: null };
  const branch = (Array.isArray((meRow as any)?.branch) ? (meRow as any).branch[0] : (meRow as any)?.branch) as
    | { id: string; name: string; latitude: number | null; longitude: number | null; punch_radius_m: number }
    | null;

  const { data: employees } = await supabase
    .from("employee")
    .select("id, full_name, role_title, phone, date_joined, is_active, app_role, pin_hash, device_id, last_seen_at")
    .eq("is_active", true)
    .is("deleted_at", null)
    .order("full_name", { ascending: true });

  const today = istDate();
  const { data: attendanceRows } = await supabase
    .from("attendance")
    .select("employee_id, check_in, check_out, status, source, check_in_distance_m, check_out_distance_m")
    .eq("work_date", today);

  const attendanceByEmployee = new Map<string, any>();
  (attendanceRows ?? []).forEach((a: any) => attendanceByEmployee.set(a.employee_id, a));

  const staff = employees ?? [];
  const checkedInCount = staff.filter((e: any) => {
    const a = attendanceByEmployee.get(e.id);
    return a && a.check_in && !a.check_out;
  }).length;
  const appUsers = staff.filter((e: any) => e.app_role).length;
  const radius = Number(branch?.punch_radius_m ?? 100);

  return (
    <div className="space-y-6">
      <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-accent">Staff</div>
      <h1 className="mb-6 font-archivo text-2xl font-extrabold text-ink">Staff &amp; Attendance</h1>
      <p className="mb-6 -mt-4 text-sm text-ink/60">
        {checkedInCount} on shift of {staff.length} staff &middot; {appUsers} using the staff app &middot; Today &middot;{" "}
        <Link href="/staff/attendance" className="font-semibold text-accent hover:underline">
          Review attendance
        </Link>
      </p>

      {searchParams.ok && <div className="rounded-xl bg-[#e2eee7] px-4 py-3 text-[13.5px] text-[#2c6a4e]">{searchParams.ok}</div>}
      {searchParams.error && <div className="rounded-xl bg-[#f6e4df] px-4 py-3 text-[13.5px] text-[#9c3326]">{searchParams.error}</div>}

      <section className="border-2 border-black/10 bg-white p-5">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-archivo text-[15px] font-bold text-ink">Punch-in location · {branch?.name ?? "Branch"}</h2>
          <span className="text-[12.5px] text-ink/60">
            {branch?.latitude != null ? `Staff must be within ${radius} m to punch in.` : "Not set yet: staff can't punch in from the app until you set it."}
          </span>
        </div>
        <BranchLocationForm lat={branch?.latitude == null ? null : Number(branch.latitude)} lng={branch?.longitude == null ? null : Number(branch.longitude)} radius={radius} />
      </section>

      <details className="border-2 border-black/10 bg-white">
        <summary className="cursor-pointer select-none px-5 py-3 text-[13px] font-semibold text-ink">+ Add Employee</summary>
        <form action={addEmployee} className="grid grid-cols-1 gap-3 border-t border-black/5 px-5 py-4 sm:grid-cols-2 lg:grid-cols-4">
          <input name="full_name" placeholder="Full name" required className="border border-black/10 px-3 py-2 text-[13px]" />
          <input name="role_title" placeholder="Job title (e.g. Presser)" className="border border-black/10 px-3 py-2 text-[13px]" />
          <input name="phone" placeholder="Mobile number" inputMode="numeric" className="border border-black/10 px-3 py-2 text-[13px]" />
          <input name="date_joined" type="date" className="border border-black/10 px-3 py-2 text-[13px]" />
          <input name="monthly_salary" type="number" step="0.01" placeholder="Monthly salary (₹)" className="border border-black/10 px-3 py-2 text-[13px]" />
          <select name="app_role" defaultValue="" className="border border-black/10 px-3 py-2 text-[13px]">
            <option value="">No staff app access</option>
            {APP_ROLES.map((r) => (
              <option key={r} value={r}>
                Staff app: {ROLE_LABEL[r]}
              </option>
            ))}
          </select>
          <input name="pin" placeholder="App PIN (4-6 digits)" inputMode="numeric" maxLength={6} className="border border-black/10 px-3 py-2 text-[13px]" />
          <button type="submit" className="rounded-md bg-accent px-4 py-2 text-[13px] font-semibold text-white hover:brightness-110">
            Add
          </button>
        </form>
      </details>

      <div className="overflow-x-auto border-2 border-black/10 bg-white">
        <table className="w-full min-w-[860px] text-left text-[13px]">
          <thead className="border-b-2 border-black/10 text-left text-[11px] uppercase tracking-wide text-ink/50">
            <tr>
              <th className="px-5 py-3 font-medium">Name</th>
              <th className="px-5 py-3 font-medium">Staff app</th>
              <th className="px-5 py-3 font-medium">Today</th>
              <th className="px-5 py-3 font-medium">In</th>
              <th className="px-5 py-3 font-medium">Out</th>
              <th className="px-5 py-3 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {staff.length === 0 && (
              <tr>
                <td colSpan={6} className="px-5 py-8 text-center text-ink/40">
                  No staff yet. Add your first employee above.
                </td>
              </tr>
            )}
            {staff.map((e: any) => {
              const a = attendanceByEmployee.get(e.id);
              const checkedIn = a && a.check_in && !a.check_out;
              const checkedOut = a && a.check_out;
              return (
                <tr key={e.id} className="border-t border-black/5 align-top">
                  <td className="px-5 py-3">
                    <div className="font-medium text-ink">{e.full_name}</div>
                    <div className="text-[12px] text-ink/50">
                      {e.role_title || "—"} · {e.phone || "no phone"}
                    </div>
                  </td>
                  <td className="px-5 py-3">
                    {e.app_role ? (
                      <>
                        <div className="font-semibold text-ink">{roleLabel(e.app_role)}</div>
                        <div className="text-[12px] text-ink/50">
                          {e.pin_hash ? "PIN set" : "No PIN"} · {e.device_id ? "phone linked" : "not signed in yet"}
                        </div>
                      </>
                    ) : (
                      <span className="text-ink/40">No access</span>
                    )}
                    <details className="relative mt-1">
                      <summary className="cursor-pointer list-none text-[12px] font-semibold text-accent hover:underline">
                        {e.app_role ? "Change role / PIN" : "Give app access"}
                      </summary>
                      <form action={setStaffApp} className="absolute left-0 z-10 mt-2 w-72 space-y-2.5 border-2 border-black/10 bg-white p-4">
                        <input type="hidden" name="employee_id" value={e.id} />
                        <label className="block text-[12px] font-semibold text-ink/60">
                          Role
                          <select name="app_role" defaultValue={e.app_role ?? ""} className="mt-1 w-full border border-black/10 px-2 py-1.5 text-[13px]">
                            <option value="">No staff app access</option>
                            {APP_ROLES.map((r) => (
                              <option key={r} value={r}>
                                {ROLE_LABEL[r]}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="block text-[12px] font-semibold text-ink/60">
                          Mobile number
                          <input name="phone" defaultValue={e.phone ?? ""} inputMode="numeric" className="mt-1 w-full border border-black/10 px-2 py-1.5 text-[13px]" />
                        </label>
                        <label className="block text-[12px] font-semibold text-ink/60">
                          {e.pin_hash ? "New PIN (leave blank to keep)" : "PIN (4-6 digits)"}
                          <input name="pin" inputMode="numeric" maxLength={6} className="mt-1 w-full border border-black/10 px-2 py-1.5 text-[13px]" />
                        </label>
                        <button type="submit" className="w-full rounded-md bg-slate-900 px-3 py-1.5 text-[13px] font-medium text-white">
                          Save
                        </button>
                        <p className="text-[11.5px] leading-snug text-ink/50">Tell them the PIN in person. They sign in at /work on their phone.</p>
                      </form>
                    </details>
                    {e.device_id && (
                      <form action={resetStaffDevice} className="mt-1">
                        <input type="hidden" name="employee_id" value={e.id} />
                        <button type="submit" className="text-[12px] font-semibold text-ink/60 hover:underline">
                          Reset phone
                        </button>
                      </form>
                    )}
                  </td>
                  <td className="px-5 py-3">
                    <span
                      className={`px-2 py-1 text-[11px] font-semibold uppercase tracking-wide ${
                        checkedIn ? "bg-green-100 text-green-700" : checkedOut ? "bg-black/5 text-ink/60" : "bg-amber-100 text-amber-700"
                      }`}
                    >
                      {checkedIn ? "On shift" : checkedOut ? "Punched out" : "Not in"}
                    </span>
                    {a && <div className="mt-1 text-[11.5px] text-ink/50">{a.source === "app" ? "Staff app" : "Console"}</div>}
                  </td>
                  <td className="px-5 py-3 text-ink/70">
                    {formatTime(a?.check_in ?? null)}
                    {a?.check_in_distance_m != null && <div className="text-[11.5px] text-ink/50">{a.check_in_distance_m} m from branch</div>}
                  </td>
                  <td className="px-5 py-3 text-ink/70">
                    {formatTime(a?.check_out ?? null)}
                    {a?.check_out_distance_m != null && (
                      <div className={"text-[11.5px] " + (a.check_out_distance_m > radius ? "font-semibold text-[#9c3326]" : "text-ink/50")}>
                        {a.check_out_distance_m} m from branch
                      </div>
                    )}
                  </td>
                  <td className="px-5 py-3 text-right">
                    {!checkedIn && !checkedOut && (
                      <form action={checkInStaff}>
                        <input type="hidden" name="employee_id" value={e.id} />
                        <button type="submit" className="rounded-md border border-black/10 px-3 py-1.5 text-[12px] font-semibold text-ink hover:bg-black/[0.03]">
                          Check in manually
                        </button>
                      </form>
                    )}
                    {checkedIn && (
                      <form action={checkOutStaff}>
                        <input type="hidden" name="employee_id" value={e.id} />
                        <button type="submit" className="rounded-md border border-black/10 px-3 py-1.5 text-[12px] font-semibold text-ink hover:bg-black/[0.03]">
                          Check out
                        </button>
                      </form>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
