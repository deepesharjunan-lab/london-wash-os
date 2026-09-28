import Link from "next/link";
import { ownerUnread, requireOwner } from "@/lib/owner";
import { roleLabel } from "@/lib/staff/roles";
import { duration, fmtDay, fmtTime, istDate, istDayStart } from "@/lib/time";
import { Card, Chip, OwnerShell } from "../ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Team · London Wash Owner" };

export default async function OwnerTeamPage({ searchParams }: { searchParams: { date?: string } }) {
  const { supabase, admin, me } = await requireOwner();
  const today = istDate();
  const date = /^\d{4}-\d{2}-\d{2}$/.test(searchParams.date ?? "") && searchParams.date! <= today ? searchParams.date! : today;
  const dayStart = istDayStart(date);
  const dayEnd = new Date(new Date(dayStart).getTime() + 864e5).toISOString();
  const prev = istDate(new Date(new Date(dayStart).getTime() - 12 * 3600e3));
  const next = istDate(new Date(new Date(dayStart).getTime() + 36 * 3600e3));

  const [unread, empRes, attRes, evRes, branchRes] = await Promise.all([
    ownerUnread(admin, me.id),
    supabase.from("employee").select("id, full_name, app_role, role_title").eq("is_active", true).is("deleted_at", null).order("full_name"),
    supabase.from("attendance").select("employee_id, check_in, check_out, source, check_in_distance_m, check_out_distance_m").eq("work_date", date),
    supabase.from("garment_event").select("actor_employee_id").in("event_type", ["stage_finished", "stage_skipped"]).gte("created_at", dayStart).lt("created_at", dayEnd).not("actor_employee_id", "is", null).limit(5000),
    me.branchId ? supabase.from("branch").select("punch_radius_m").eq("id", me.branchId).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const radius = Number((branchRes.data as any)?.punch_radius_m ?? 100);
  const employees = (empRes.data ?? []) as { id: string; full_name: string; app_role: string | null; role_title: string | null }[];
  const att = new Map(((attRes.data ?? []) as any[]).map((a) => [a.employee_id, a] as [string, any]));
  const pieces = new Map<string, number>();
  ((evRes.data ?? []) as { actor_employee_id: string }[]).forEach((e) => pieces.set(e.actor_employee_id, (pieces.get(e.actor_employee_id) ?? 0) + 1));
  const present = employees.filter((e) => att.get(e.id)?.check_in).length;

  return (
    <OwnerShell current="/owner/team" title="Team" unread={unread}>
      <div className="flex items-center justify-between gap-2">
        <Link href={`/owner/team?date=${prev}`} className="grid h-11 w-11 place-items-center rounded-full border border-hair bg-white" aria-label="Previous day">
          ‹
        </Link>
        <div className="text-center">
          <b className="block text-[16px]">{date === today ? "Today" : fmtDay(date)}</b>
          <span className="text-[12.5px] text-ink-2">
            {present} of {employees.length} present
          </span>
        </div>
        {date < today ? (
          <Link href={`/owner/team?date=${next}`} className="grid h-11 w-11 place-items-center rounded-full border border-hair bg-white" aria-label="Next day">
            ›
          </Link>
        ) : (
          <span className="h-11 w-11" />
        )}
      </div>

      <Card>
        <ul className="divide-y divide-hair">
          {employees.map((e) => {
            const a = att.get(e.id);
            const outFar = a?.check_out_distance_m != null && a.check_out_distance_m > radius;
            return (
              <li key={e.id}>
                <Link href={`/owner/team/${e.id}`} className="flex items-center gap-3 px-4 py-3">
                  <span className="min-w-0 flex-1">
                    <b className="block truncate text-[14px]">{e.full_name}</b>
                    <span className="block truncate text-[12px] text-ink-2">
                      {e.app_role ? roleLabel(e.app_role) : e.role_title ?? "No app role"}
                      {pieces.get(e.id) ? ` · ${pieces.get(e.id)} garments done` : ""}
                    </span>
                    {a?.check_in && (
                      <span className="block text-[12px] text-ink-2">
                        {fmtTime(a.check_in)} – {a.check_out ? fmtTime(a.check_out) : "now"} · {duration(a.check_in, a.check_out)}
                        {a.check_in_distance_m != null ? ` · in ${a.check_in_distance_m} m` : a.source === "console" ? " · by console" : ""}
                        {outFar ? ` · out ${a.check_out_distance_m} m away` : ""}
                      </span>
                    )}
                  </span>
                  {a?.check_in ? (
                    <Chip tone={a.check_out ? "plain" : "ok"}>{a.check_out ? "Done" : "On shift"}</Chip>
                  ) : (
                    <Chip tone={date === today ? "warn" : "danger"}>{date === today ? "Not in" : "Absent"}</Chip>
                  )}
                </Link>
              </li>
            );
          })}
          {!employees.length && <li className="px-4 py-6 text-center text-[13.5px] text-ink-2">No staff yet. Add them in the console under Staff &amp; Attendance.</li>}
        </ul>
      </Card>
      <Link href="/staff/attendance" className="text-center text-[13px] font-semibold text-ink-2 underline-offset-4 hover:underline">
        Monthly attendance in the console
      </Link>
    </OwnerShell>
  );
}
