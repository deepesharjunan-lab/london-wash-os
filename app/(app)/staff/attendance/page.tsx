import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { roleLabel } from "@/lib/staff/roles";
import { mapsLink } from "@/lib/geo";
import { istDate, istDayStart, monthRange } from "@/lib/time";

const time = (iso: string | null) =>
  iso ? new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" }) : "—";
const day = (d: string) => new Date(`${d}T12:00:00+05:30`).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
const hours = (mins: number) => `${Math.floor(mins / 60)}h ${String(Math.round(mins % 60)).padStart(2, "0")}m`;

export default async function AttendanceReviewPage({ searchParams }: { searchParams: { month?: string; employee?: string } }) {
  const supabase = createClient();
  const thisMonth = istDate().slice(0, 7);
  const month = /^\d{4}-\d{2}$/.test(searchParams.month ?? "") ? searchParams.month! : thisMonth;
  const { from, to, days } = monthRange(month);
  const employeeFilter = searchParams.employee || "";

  const { data: auth } = await supabase.auth.getUser();
  const { data: meRow } = auth?.user
    ? await supabase.from("user").select("branch:branch_id(punch_radius_m)").eq("auth_user_id", auth.user.id).maybeSingle()
    : { data: null };
  const b = (meRow as any)?.branch;
  const radius = Number((Array.isArray(b) ? b[0] : b)?.punch_radius_m ?? 100);

  const [{ data: employees }, { data: rows }, { data: events }] = await Promise.all([
    supabase.from("employee").select("id, full_name, app_role, role_title, is_active").is("deleted_at", null).order("full_name"),
    (() => {
      let q = supabase
        .from("attendance")
        .select("id, employee_id, work_date, check_in, check_out, status, source, check_in_lat, check_in_lng, check_in_distance_m, check_out_lat, check_out_lng, check_out_distance_m")
        .gte("work_date", from)
        .lte("work_date", to)
        .order("work_date", { ascending: false })
        .order("check_in", { ascending: true });
      if (employeeFilter) q = q.eq("employee_id", employeeFilter);
      return q;
    })(),
    supabase
      .from("garment_event")
      .select("actor_employee_id")
      .in("event_type", ["stage_finished", "stage_skipped"])
      .gte("created_at", istDayStart(from))
      .lt("created_at", new Date(new Date(istDayStart(to)).getTime() + 864e5).toISOString())
      .not("actor_employee_id", "is", null)
      .limit(20000),
  ]);

  const people = (employees ?? []) as { id: string; full_name: string; app_role: string | null; role_title: string | null; is_active: boolean }[];
  const name = new Map(people.map((p) => [p.id, p.full_name] as [string, string]));
  const list = (rows ?? []) as any[];
  const pieces = new Map<string, number>();
  ((events ?? []) as { actor_employee_id: string }[]).forEach((e) => pieces.set(e.actor_employee_id, (pieces.get(e.actor_employee_id) ?? 0) + 1));

  const summary = people
    .filter((p) => p.is_active && (!employeeFilter || p.id === employeeFilter))
    .map((p) => {
      const mine = list.filter((r) => r.employee_id === p.id);
      const worked = mine.reduce((a, r) => (r.check_in && r.check_out ? a + (new Date(r.check_out).getTime() - new Date(r.check_in).getTime()) / 60000 : a), 0);
      return {
        p,
        present: mine.filter((r) => r.check_in).length,
        worked,
        appPunches: mine.filter((r) => r.source === "app").length,
        farOut: mine.filter((r) => r.check_out_distance_m != null && r.check_out_distance_m > radius).length,
        openDays: mine.filter((r) => r.check_in && !r.check_out && r.work_date < istDate()).length,
      };
    });

  const [y, m] = month.split("-").map(Number);
  const prev = `${m === 1 ? y - 1 : y}-${String(m === 1 ? 12 : m - 1).padStart(2, "0")}`;
  const next = `${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, "0")}`;
  const q = (mm: string) => `/staff/attendance?month=${mm}${employeeFilter ? `&employee=${employeeFilter}` : ""}`;

  return (
    <div className="space-y-6">
      <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-accent">
        <Link href="/staff" className="hover:underline">
          Staff
        </Link>{" "}
        / Attendance
      </div>
      <h1 className="mb-6 font-archivo text-2xl font-extrabold text-ink">Attendance review</h1>

      <div className="flex flex-wrap items-center gap-3">
        <Link href={q(prev)} className="rounded-full border border-black/10 bg-white px-3 py-1.5 text-[13px] font-semibold">
          ‹ Previous
        </Link>
        <b className="text-[15px]">{new Date(`${month}-15T12:00:00+05:30`).toLocaleDateString("en-IN", { month: "long", year: "numeric" })}</b>
        {month < thisMonth && (
          <Link href={q(next)} className="rounded-full border border-black/10 bg-white px-3 py-1.5 text-[13px] font-semibold">
            Next ›
          </Link>
        )}
        <form className="ml-auto flex items-center gap-2">
          <input type="hidden" name="month" value={month} />
          <select name="employee" defaultValue={employeeFilter} className="border border-black/10 px-3 py-1.5 text-[13px]">
            <option value="">Everyone</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.full_name}
              </option>
            ))}
          </select>
          <button type="submit" className="rounded-md bg-slate-900 px-3 py-1.5 text-[13px] font-medium text-white">
            Show
          </button>
        </form>
      </div>

      <div className="overflow-x-auto border-2 border-black/10 bg-white">
        <table className="w-full min-w-[720px] text-left text-[13px]">
          <thead className="border-b-2 border-black/10 text-[11px] uppercase tracking-wide text-ink/50">
            <tr>
              <th className="px-5 py-3 font-medium">Staff</th>
              <th className="px-5 py-3 font-medium">Days present</th>
              <th className="px-5 py-3 font-medium">Hours</th>
              <th className="px-5 py-3 font-medium">Garments done</th>
              <th className="px-5 py-3 font-medium">To check</th>
            </tr>
          </thead>
          <tbody>
            {summary.map((s) => (
              <tr key={s.p.id} className="border-t border-black/5">
                <td className="px-5 py-3">
                  <div className="font-medium text-ink">{s.p.full_name}</div>
                  <div className="text-[12px] text-ink/50">{s.p.app_role ? roleLabel(s.p.app_role) : s.p.role_title ?? "—"}</div>
                </td>
                <td className="px-5 py-3">
                  {s.present} / {days}
                  <div className="text-[11.5px] text-ink/50">{s.appPunches} by app</div>
                </td>
                <td className="px-5 py-3">{hours(s.worked)}</td>
                <td className="px-5 py-3">{pieces.get(s.p.id) ?? 0}</td>
                <td className="px-5 py-3 text-[12.5px]">
                  {s.openDays > 0 && <div className="text-[#8a5a12]">{s.openDays} day(s) without punch-out</div>}
                  {s.farOut > 0 && <div className="text-[#9c3326]">{s.farOut} punch-out(s) away from branch</div>}
                  {!s.openDays && !s.farOut && <span className="text-ink/40">—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="overflow-x-auto border-2 border-black/10 bg-white">
        <div className="border-b-2 border-black/10 px-5 py-3 font-archivo text-[13.5px] font-bold text-ink">Daily log</div>
        <table className="w-full min-w-[820px] text-left text-[13px]">
          <thead className="border-b-2 border-black/10 text-[11px] uppercase tracking-wide text-ink/50">
            <tr>
              <th className="px-5 py-3 font-medium">Date</th>
              <th className="px-5 py-3 font-medium">Staff</th>
              <th className="px-5 py-3 font-medium">In</th>
              <th className="px-5 py-3 font-medium">Out</th>
              <th className="px-5 py-3 font-medium">Worked</th>
              <th className="px-5 py-3 font-medium">Source</th>
            </tr>
          </thead>
          <tbody>
            {list.map((r) => (
              <tr key={r.id} className="border-t border-black/5">
                <td className="px-5 py-2.5">{day(r.work_date)}</td>
                <td className="px-5 py-2.5 font-medium">{name.get(r.employee_id) ?? "—"}</td>
                <td className="px-5 py-2.5">
                  {time(r.check_in)}
                  {r.check_in_lat != null && (
                    <a href={mapsLink(r.check_in_lat, r.check_in_lng)} target="_blank" rel="noopener noreferrer" className="ml-2 text-[11.5px] text-accent hover:underline">
                      {r.check_in_distance_m} m
                    </a>
                  )}
                </td>
                <td className="px-5 py-2.5">
                  {time(r.check_out)}
                  {r.check_out_lat != null && (
                    <a
                      href={mapsLink(r.check_out_lat, r.check_out_lng)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={"ml-2 text-[11.5px] hover:underline " + (r.check_out_distance_m > radius ? "font-semibold text-[#9c3326]" : "text-accent")}
                    >
                      {r.check_out_distance_m} m
                    </a>
                  )}
                </td>
                <td className="px-5 py-2.5">{r.check_in && r.check_out ? hours((new Date(r.check_out).getTime() - new Date(r.check_in).getTime()) / 60000) : "—"}</td>
                <td className="px-5 py-2.5 text-ink/60">{r.source === "app" ? "Staff app" : "Console"}</td>
              </tr>
            ))}
            {!list.length && (
              <tr>
                <td colSpan={6} className="px-5 py-8 text-center text-ink/40">
                  No attendance recorded this month.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
