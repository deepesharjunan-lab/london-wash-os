import { requireStaff } from "@/lib/staff/session";
import { ROLE_LABEL } from "@/lib/staff/roles";
import { vapidPublicKey } from "@/lib/push";
import { PushToggle } from "@/lib/pwa/PushToggle";
import { InstallHint } from "@/lib/pwa/InstallHint";
import { duration, fmtDay, fmtTime, istDate } from "@/lib/time";
import { removeStaffPushAction, saveStaffPushAction, staffSignOutAction } from "../actions";
import { Card, Chip, StaffShell, btnGhost, unreadCount } from "../ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Me · London Wash Staff" };

export default async function StaffMePage() {
  const { me, db } = await requireStaff();
  const month = istDate().slice(0, 7);
  const [unread, publicKey, { data }] = await Promise.all([
    unreadCount(db, me.id),
    vapidPublicKey(db),
    db
      .from("attendance")
      .select("id, work_date, check_in, check_out, status, check_in_distance_m")
      .eq("employee_id", me.id)
      .gte("work_date", `${month}-01`)
      .order("work_date", { ascending: false }),
  ]);
  const rows = (data ?? []) as { id: string; work_date: string; check_in: string | null; check_out: string | null; status: string }[];
  const minutes = rows.reduce((a, r) => (r.check_in && r.check_out ? a + (new Date(r.check_out).getTime() - new Date(r.check_in).getTime()) / 60000 : a), 0);
  const initials = me.full_name.split(" ").filter(Boolean).slice(0, 2).map((p) => p[0]).join("").toUpperCase();

  return (
    <StaffShell role={me.app_role} current="/work/me" title="Me" unread={unread}>
      <Card className="flex items-center gap-4 p-4">
        <span className="grid h-14 w-14 place-items-center rounded-full bg-beige text-[18px] font-bold">{initials}</span>
        <span className="min-w-0">
          <b className="block text-[17px]">{me.full_name}</b>
          <span className="text-[13px] text-ink-2">{me.phone ? `+91 ${me.phone.replace(/\D/g, "").slice(-10)}` : ""}</span>
          <span className="mt-1 block">
            <Chip tone="brass">{ROLE_LABEL[me.app_role]}</Chip> <span className="text-[12.5px] text-ink-2">{me.branch?.name}</span>
          </span>
        </span>
      </Card>

      <InstallHint appName="London Wash Staff" storageKey="lw-staff-install-dismissed" />
      <PushToggle publicKey={publicKey} save={saveStaffPushAction} remove={removeStaffPushAction} />

      <section className="flex flex-col gap-2">
        <h2 className="flex items-center justify-between text-[15px] font-semibold">
          Attendance this month
          <span className="text-[12.5px] font-semibold text-ink-2">
            {rows.filter((r) => r.check_in).length} days · {Math.floor(minutes / 60)}h {String(Math.round(minutes % 60)).padStart(2, "0")}m
          </span>
        </h2>
        {rows.length ? (
          <Card>
            <ul className="divide-y divide-hair">
              {rows.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-[13.5px]">
                  <span className="font-semibold">{fmtDay(r.work_date)}</span>
                  <span className="text-right text-ink-2">
                    {fmtTime(r.check_in)} – {r.check_out ? fmtTime(r.check_out) : "on shift"}
                    <span className="block text-[11.5px] text-ink-3">{r.check_in ? duration(r.check_in, r.check_out) : r.status}</span>
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        ) : (
          <Card className="px-4 py-8 text-center text-[13.5px] text-ink-2">No attendance this month yet.</Card>
        )}
      </section>

      <form action={staffSignOutAction}>
        <button type="submit" className={btnGhost + " w-full"}>
          Sign out
        </button>
      </form>
    </StaffShell>
  );
}
