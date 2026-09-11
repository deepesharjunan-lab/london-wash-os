import { createClient } from "@/lib/supabase/server";
import { checkInStaff, checkOutStaff } from "./actions";

function formatTime(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" });
}

export default async function StaffPage() {
  const supabase = createClient();

  const { data: staff, error } = await supabase
    .from("user")
    .select("id, full_name, phone, email, is_active")
    .is("deleted_at", null)
    .order("full_name", { ascending: true });

  const today = new Date().toISOString().slice(0, 10);
  const { data: attendanceRows } = await supabase
    .from("attendance")
    .select("id, employee_id, check_in, check_out, status")
    .eq("work_date", today);

  const attendanceByEmployee = new Map<string, any>();
  (attendanceRows ?? []).forEach((a: any) => attendanceByEmployee.set(a.employee_id, a));

  const presentCount = (attendanceRows ?? []).filter((a: any) => a.check_in && !a.check_out).length;
  const totalStaff = (staff ?? []).length;

  return (
    <div>
      <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-accent">Staff</div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="font-archivo text-2xl font-extrabold text-ink">Staff &amp; Attendance</h1>
        <p className="text-sm text-ink/60">{presentCount} checked in of {totalStaff} staff · Today</p>
      </div>

      {error && (
        <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">
          Could not load staff: {error.message}
        </p>
      )}

      <div className="overflow-hidden rounded-lg border border-black/5 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-black/5 bg-black/[0.02] text-left text-[11px] font-semibold uppercase tracking-wide text-ink/50">
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Contact</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Check-in</th>
              <th className="px-4 py-3">Check-out</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {(staff ?? []).map((s: any) => {
              const att = attendanceByEmployee.get(s.id);
              const checkedIn = att && att.check_in && !att.check_out;
              const checkedOut = att && att.check_out;
              return (
                <tr key={s.id} className="border-b border-black/5 last:border-0">
                  <td className="px-4 py-3 font-medium text-ink">
                    {s.full_name}
                    {!s.is_active && (
                      <span className="ml-2 inline-flex rounded-full bg-black/5 px-2 py-0.5 text-[10px] font-semibold text-ink/50">
                        Inactive
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-ink/70">{s.phone || s.email || "—"}</td>
                  <td className="px-4 py-3">
                    {checkedOut ? (
                      <span className="inline-flex rounded-full bg-black/5 px-2 py-0.5 text-[10px] font-semibold text-ink/50">
                        Checked out
                      </span>
                    ) : checkedIn ? (
                      <span className="inline-flex rounded-full bg-success/10 px-2 py-0.5 text-[10px] font-semibold text-success">
                        Present
                      </span>
                    ) : (
                      <span className="inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                        Not checked in
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-ink/70">{formatTime(att?.check_in ?? null)}</td>
                  <td className="px-4 py-3 text-ink/70">{formatTime(att?.check_out ?? null)}</td>
                  <td className="px-4 py-3">
                    {!att && (
                      <form action={checkInStaff}>
                        <input type="hidden" name="employee_id" value={s.id} />
                        <button
                          type="submit"
                          className="rounded-md bg-accent px-3 py-1.5 text-xs font-semibold text-white hover:brightness-110"
                        >
                          Check in
                        </button>
                      </form>
                    )}
                    {checkedIn && (
                      <form action={checkOutStaff}>
                        <input type="hidden" name="employee_id" value={s.id} />
                        <button
                          type="submit"
                          className="rounded-md border border-black/10 px-3 py-1.5 text-xs font-semibold text-ink hover:bg-black/[0.03]"
                        >
                          Check out
                        </button>
                      </form>
                    )}
                  </td>
                </tr>
              );
            })}
            {(staff ?? []).length === 0 && !error && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-sm text-ink/50">
                  No staff found for this branch.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
