import { createClient } from "@/lib/supabase/server";
import { addEmployee, checkInStaff, checkOutStaff } from "./actions";

function formatTime(iso: string | null) {
  if (!iso) return "\u2014";
  const d = new Date(iso);
  return d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" });
}

export default async function StaffPage() {
  const supabase = createClient();

  const { data: employees } = await supabase
    .from("employee")
    .select("id, full_name, role_title, phone, date_joined, is_active")
    .eq("is_active", true)
    .is("deleted_at", null)
    .order("full_name", { ascending: true });

  const today = new Date().toISOString().slice(0, 10);
  const { data: attendanceRows } = await supabase
    .from("attendance")
    .select("employee_id, check_in, check_out, status")
    .eq("work_date", today);

  const attendanceByEmployee = new Map<string, any>();
  (attendanceRows ?? []).forEach((a: any) => attendanceByEmployee.set(a.employee_id, a));

  const staff = employees ?? [];
  const checkedInCount = staff.filter((e: any) => {
    const a = attendanceByEmployee.get(e.id);
    return a && a.check_in && !a.check_out;
  }).length;

  return (
    <div className="space-y-6">
      <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-accent">Staff</div>
      <h1 className="mb-6 font-archivo text-2xl font-extrabold text-ink">Staff &amp; Attendance</h1>
      <p className="mb-6 -mt-4 text-sm text-ink/60">
        {checkedInCount} checked in of {staff.length} staff &middot; Today
      </p>

      <details className="border-2 border-black/10 bg-white">
        <summary className="cursor-pointer select-none px-5 py-3 text-[13px] font-semibold text-ink">
          + Add Employee
        </summary>
        <form
          action={addEmployee}
          className="grid grid-cols-1 gap-3 border-t border-black/5 px-5 py-4 sm:grid-cols-2 lg:grid-cols-5"
        >
          <input
            name="full_name"
            placeholder="Full name"
            required
            className="border border-black/10 px-3 py-2 text-[13px]"
          />
          <input
            name="role_title"
            placeholder="Role (e.g. Presser)"
            className="border border-black/10 px-3 py-2 text-[13px]"
          />
          <input
            name="phone"
            placeholder="Phone"
            className="border border-black/10 px-3 py-2 text-[13px]"
          />
          <input
            name="date_joined"
            type="date"
            className="border border-black/10 px-3 py-2 text-[13px]"
          />
          <input
            name="monthly_salary"
            type="number"
            step="0.01"
            placeholder="Monthly salary (\u20B9)"
            className="border border-black/10 px-3 py-2 text-[13px]"
          />
          <button
            type="submit"
            className="rounded-md bg-accent px-4 py-2 text-[13px] font-semibold text-white hover:brightness-110 sm:col-span-2 lg:col-span-1"
          >
            Add
          </button>
        </form>
      </details>

      <div className="overflow-hidden border-2 border-black/10 bg-white">
        <table className="w-full text-left text-[13px]">
          <thead className="border-b-2 border-black/10 text-left text-[11px] uppercase tracking-wide text-ink/50">
            <tr>
              <th className="px-5 py-3 font-medium">Name</th>
              <th className="px-5 py-3 font-medium">Role</th>
              <th className="px-5 py-3 font-medium">Contact</th>
              <th className="px-5 py-3 font-medium">Status</th>
              <th className="px-5 py-3 font-medium">Check-in</th>
              <th className="px-5 py-3 font-medium">Check-out</th>
              <th className="px-5 py-3 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {staff.length === 0 && (
              <tr>
                <td colSpan={7} className="px-5 py-8 text-center text-ink/40">
                  No staff yet. Add your first employee above.
                </td>
              </tr>
            )}
            {staff.map((e: any) => {
              const a = attendanceByEmployee.get(e.id);
              const checkedIn = a && a.check_in && !a.check_out;
              const checkedOut = a && a.check_out;
              return (
                <tr key={e.id} className="border-t border-black/5">
                  <td className="px-5 py-3 font-medium text-ink">{e.full_name}</td>
                  <td className="px-5 py-3 text-ink/70">{e.role_title || "\u2014"}</td>
                  <td className="px-5 py-3 text-ink/70">{e.phone || "\u2014"}</td>
                  <td className="px-5 py-3">
                    <span
                      className={`px-2 py-1 text-[11px] font-semibold uppercase tracking-wide ${
                        checkedIn
                          ? "bg-green-100 text-green-700"
                          : checkedOut
                          ? "bg-black/5 text-ink/60"
                          : "bg-amber-100 text-amber-700"
                      }`}
                    >
                      {checkedIn ? "Checked in" : checkedOut ? "Checked out" : "Not checked in"}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-ink/70">{formatTime(a?.check_in ?? null)}</td>
                  <td className="px-5 py-3 text-ink/70">{formatTime(a?.check_out ?? null)}</td>
                  <td className="px-5 py-3 text-right">
                    {!checkedIn && !checkedOut && (
                      <form action={checkInStaff}>
                        <input type="hidden" name="employee_id" value={e.id} />
                        <button
                          type="submit"
                          className="rounded-md bg-accent px-3 py-1.5 text-[12px] font-semibold text-white hover:brightness-110"
                        >
                          Check in
                        </button>
                      </form>
                    )}
                    {checkedIn && (
                      <form action={checkOutStaff}>
                        <input type="hidden" name="employee_id" value={e.id} />
                        <button
                          type="submit"
                          className="rounded-md border border-black/10 px-3 py-1.5 text-[12px] font-semibold text-ink hover:bg-black/[0.03]"
                        >
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
