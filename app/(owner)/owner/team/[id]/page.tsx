import Link from "next/link";
import { notFound } from "next/navigation";
import { ownerUnread, requireOwner } from "@/lib/owner";
import { roleLabel } from "@/lib/staff/roles";
import { mapsLink } from "@/lib/geo";
import { duration, fmtDay, fmtTime, istDate, istDayStart, monthRange } from "@/lib/time";
import { Card, Chip, OwnerShell } from "../../ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Team member · London Wash Owner" };

export default async function OwnerTeamMemberPage({ params, searchParams }: { params: { id: string }; searchParams: { month?: string } }) {
  const { supabase, admin, me } = await requireOwner();
  const thisMonth = istDate().slice(0, 7);
  const month = /^\d{4}-\d{2}$/.test(searchParams.month ?? "") && searchParams.month! <= thisMonth ? searchParams.month! : thisMonth;
  const { from, to } = monthRange(month);
  const [y, m] = month.split("-").map(Number);
  const prevMonth = `${m === 1 ? y - 1 : y}-${String(m === 1 ? 12 : m - 1).padStart(2, "0")}`;
  const nextMonth = `${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, "0")}`;

  const { data: emp } = await supabase.from("employee").select("id, full_name, app_role, role_title, phone, last_seen_at").eq("id", params.id).maybeSingle();
  const e = emp as any;
  if (!e) notFound();
  const [unread, attRes, evRes] = await Promise.all([
    ownerUnread(admin, me.id),
    supabase
      .from("attendance")
      .select("id, work_date, check_in, check_out, status, source, check_in_lat, check_in_lng, check_in_distance_m, check_out_lat, check_out_lng, check_out_distance_m")
      .eq("employee_id", e.id)
      .gte("work_date", from)
      .lte("work_date", to)
      .order("work_date", { ascending: false }),
    supabase
      .from("garment_event")
      .select("created_at")
      .eq("actor_employee_id", e.id)
      .in("event_type", ["stage_finished", "stage_skipped"])
      .gte("created_at", istDayStart(from))
      .lt("created_at", new Date(new Date(istDayStart(to)).getTime() + 864e5).toISOString())
      .limit(10000),
  ]);
  const rows = (attRes.data ?? []) as any[];
  const perDay = new Map<string, number>();
  ((evRes.data ?? []) as { created_at: string }[]).forEach((x) => {
    const d = istDate(new Date(x.created_at));
    perDay.set(d, (perDay.get(d) ?? 0) + 1);
  });
  const minutes = rows.reduce((a, r) => (r.check_in && r.check_out ? a + (new Date(r.check_out).getTime() - new Date(r.check_in).getTime()) / 60000 : a), 0);
  const totalPieces = [...perDay.values()].reduce((a, n) => a + n, 0);

  return (
    <OwnerShell back="/owner/team" title={e.full_name} unread={unread}>
      <Card className="flex flex-col gap-1 p-4">
        <b className="text-[17px]">{e.full_name}</b>
        <span className="text-[13px] text-ink-2">
          {e.app_role ? roleLabel(e.app_role) : e.role_title ?? "No app role"}
          {e.phone ? ` · ${e.phone}` : ""}
        </span>
        {e.last_seen_at && <span className="text-[12px] text-ink-3">Last signed in to the staff app {fmtDay(e.last_seen_at)}</span>}
      </Card>

      <div className="flex items-center justify-between gap-2">
        <Link href={`/owner/team/${e.id}?month=${prevMonth}`} className="grid h-11 w-11 place-items-center rounded-full border border-hair bg-white" aria-label="Previous month">
          ‹
        </Link>
        <b className="text-[16px]">{new Date(`${month}-15T12:00:00+05:30`).toLocaleDateString("en-IN", { month: "long", year: "numeric" })}</b>
        {month < thisMonth ? (
          <Link href={`/owner/team/${e.id}?month=${nextMonth}`} className="grid h-11 w-11 place-items-center rounded-full border border-hair bg-white" aria-label="Next month">
            ›
          </Link>
        ) : (
          <span className="h-11 w-11" />
        )}
      </div>

      <div className="grid grid-cols-3 gap-2 text-center">
        {[
          [String(rows.filter((r) => r.check_in).length), "days present"],
          [`${Math.floor(minutes / 60)}h`, "worked"],
          [String(totalPieces), "garments done"],
        ].map(([v, l]) => (
          <Card key={l} className="px-2 py-3">
            <b className="block font-display text-[24px] font-medium">{v}</b>
            <span className="text-[11.5px] font-semibold text-ink-2">{l}</span>
          </Card>
        ))}
      </div>

      <Card>
        <ul className="divide-y divide-hair">
          {rows.map((r) => (
            <li key={r.id} className="flex flex-col gap-0.5 px-4 py-2.5 text-[13px]">
              <span className="flex items-center justify-between gap-2">
                <b>{fmtDay(r.work_date)}</b>
                <span>
                  {fmtTime(r.check_in)} – {r.check_out ? fmtTime(r.check_out) : "—"} · {r.check_in ? duration(r.check_in, r.check_out) : r.status}
                </span>
              </span>
              <span className="flex flex-wrap items-center gap-x-2 text-[12px] text-ink-2">
                {r.source === "app" ? <Chip tone="ok">App punch</Chip> : <Chip>Console</Chip>}
                {r.check_in_lat != null && (
                  <a href={mapsLink(r.check_in_lat, r.check_in_lng)} target="_blank" rel="noopener noreferrer" className="underline-offset-2 hover:underline">
                    in {r.check_in_distance_m} m
                  </a>
                )}
                {r.check_out_lat != null && (
                  <a href={mapsLink(r.check_out_lat, r.check_out_lng)} target="_blank" rel="noopener noreferrer" className="underline-offset-2 hover:underline">
                    out {r.check_out_distance_m} m
                  </a>
                )}
                {perDay.get(r.work_date) ? <span>· {perDay.get(r.work_date)} garments</span> : null}
              </span>
            </li>
          ))}
          {!rows.length && <li className="px-4 py-6 text-center text-[13.5px] text-ink-2">No attendance this month.</li>}
        </ul>
      </Card>
    </OwnerShell>
  );
}
