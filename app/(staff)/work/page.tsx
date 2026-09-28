import Link from "next/link";
import { requireStaff } from "@/lib/staff/session";
import { todayAttendance } from "@/lib/staff/attendance";
import { loadStages, stagesForRole } from "@/lib/staff/flow";
import { loadDone, loadQueue } from "@/lib/staff/queue";
import { loadRuns } from "@/lib/staff/runs";
import { ROLE_LABEL } from "@/lib/staff/roles";
import { vapidPublicKey } from "@/lib/push";
import { PushToggle } from "@/lib/pwa/PushToggle";
import { InstallHint } from "@/lib/pwa/InstallHint";
import { ago, fmtDateTime, istDate, istDayStart } from "@/lib/time";
import { removeStaffPushAction, saveStaffPushAction } from "./actions";
import { PunchCard } from "./PunchCard";
import { Card, Chip, ICONS, Icon, StaffShell, btn, unreadCount } from "./ui";

export const dynamic = "force-dynamic";

const greeting = () => {
  const h = Number(new Date().toLocaleString("en-IN", { hour: "numeric", hour12: false, timeZone: "Asia/Kolkata" }));
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
};

export default async function StaffHomePage() {
  const { me, db } = await requireStaff();
  const today = istDate();
  const [att, unread, publicKey, alertsRes] = await Promise.all([
    todayAttendance(db, me.id),
    unreadCount(db, me.id),
    vapidPublicKey(db),
    db.from("app_notification").select("id, title, body, url, created_at, read_at").eq("employee_id", me.id).order("created_at", { ascending: false }).limit(3),
  ]);
  const punchState = att?.check_out ? "done" : att?.check_in ? "in" : "out";
  const branchReady = me.branch?.latitude != null && me.branch?.longitude != null;
  const alerts = (alertsRes.data ?? []) as { id: string; title: string; body: string | null; url: string | null; created_at: string; read_at: string | null }[];

  let body: React.ReactNode;
  if (me.app_role === "driver") {
    const runs = me.driver_id ? await loadRuns(db, me.driver_id, { open: true }) : [];
    const next = runs[0];
    body = (
      <>
        <div className="grid grid-cols-2 gap-3">
          <Stat label="Pickups to do" value={runs.filter((r) => r.kind === "pickup").length} />
          <Stat label="Deliveries to do" value={runs.filter((r) => r.kind === "delivery").length} />
        </div>
        {!me.driver_id && (
          <Card className="p-4 text-[13.5px] text-ink-2">Your driver profile isn&apos;t linked yet. Ask the owner to set your role to Driver again in the console.</Card>
        )}
        {next && (
          <Link href="/work/runs">
            <Card className="flex items-center gap-3 p-4">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-beige">
                <Icon d={ICONS.runs} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="text-[11.5px] font-semibold uppercase tracking-[0.12em] text-brass">Next {next.kind}</span>
                <b className="block truncate text-[15px]">{next.customerName}</b>
                <span className="block truncate text-[12.5px] text-ink-2">
                  {next.windowStart ? fmtDateTime(next.windowStart) : "No time set"} · {next.address ?? "No address"}
                </span>
              </span>
            </Card>
          </Link>
        )}
        <Link href="/work/runs" className={btn}>
          Open my runs
        </Link>
      </>
    );
  } else {
    const stages = await loadStages(db);
    const mine = stagesForRole(stages, me.app_role);
    const [queue, done] = await Promise.all([
      loadQueue(db, stages, mine.map((s) => s.id), me.branch_id),
      loadDone(db, me.id, istDayStart(today), 500),
    ]);
    const waiting = queue.reduce((a, q) => a + q.waiting, 0);
    const myInProgress = queue.reduce((a, q) => a + q.garments.filter((g) => g.state === "in_progress" && g.employeeId === me.id).length, 0);
    let receptionExtra: React.ReactNode = null;
    if (me.app_role === "receptionist") {
      const [{ count: newToday }, { count: readyCount }] = await Promise.all([
        db.from("order").select("id", { count: "exact", head: true }).eq("branch_id", me.branch_id).gte("created_at", istDayStart(today)),
        db.from("order").select("id", { count: "exact", head: true }).eq("branch_id", me.branch_id).eq("status", "ready"),
      ]);
      receptionExtra = (
        <div className="grid grid-cols-2 gap-3">
          <Stat label="New orders today" value={newToday ?? 0} href="/work/orders" />
          <Stat label="Ready for collection" value={readyCount ?? 0} href="/work/orders?view=ready" />
        </div>
      );
    }
    body = (
      <>
        <div className="grid grid-cols-3 gap-2.5">
          <Stat label="Waiting" value={waiting} href="/work/jobs" />
          <Stat label="In progress" value={myInProgress} href="/work/jobs?tab=progress" />
          <Stat label="Done today" value={done.length} href="/work/jobs?tab=done" />
        </div>
        {receptionExtra}
        <Link href="/work/scan" className={btn + " min-h-[58px] text-[16px]"}>
          <Icon d={ICONS.scan} className="h-[22px] w-[22px]" /> Scan a garment
        </Link>
        {queue.length > 0 && (
          <section className="flex flex-col gap-2.5">
            <h2 className="text-[15px] font-semibold">Waiting for you</h2>
            <Card>
              <ul className="divide-y divide-hair">
                {queue.slice(0, 5).map((q) => (
                  <li key={q.orderId + q.stageId}>
                    <Link href={`/work/orders/${q.orderId}`} className="flex items-center gap-3 px-4 py-3">
                      <span className="min-w-0 flex-1">
                        <b className="block text-[14px]">{q.orderNumber}</b>
                        <span className="block truncate text-[12.5px] text-ink-2">
                          {q.customerName} · {q.stageName}
                        </span>
                      </span>
                      <Chip tone={q.inProgress ? "info" : "brass"}>{q.waiting + q.inProgress} pcs</Chip>
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          </section>
        )}
      </>
    );
  }

  return (
    <StaffShell role={me.app_role} current="/work" unread={unread} title="Today">
      <div className="flex items-end justify-between gap-3 pt-1">
        <div>
          <div className="text-[14px] text-ink-2">{greeting()},</div>
          <div className="font-display text-[30px] font-medium leading-tight">{me.firstName}</div>
        </div>
        <Chip tone="brass">{ROLE_LABEL[me.app_role]}</Chip>
      </div>

      <PunchCard
        state={punchState}
        checkIn={att?.check_in ?? null}
        checkOut={att?.check_out ?? null}
        branchName={me.branch?.name ?? "Branch"}
        radius={me.branch?.punch_radius_m ?? 100}
        branchReady={branchReady}
      />

      {body}

      <InstallHint appName="London Wash Staff" storageKey="lw-staff-install-dismissed" />
      <PushToggle publicKey={publicKey} save={saveStaffPushAction} remove={removeStaffPushAction} />

      {alerts.length > 0 && (
        <section className="flex flex-col gap-2.5">
          <div className="flex items-center justify-between">
            <h2 className="text-[15px] font-semibold">Latest alerts</h2>
            <Link href="/work/alerts" className="text-[13px] font-semibold text-ink-2">
              See all
            </Link>
          </div>
          <Card>
            <ul className="divide-y divide-hair">
              {alerts.map((a) => (
                <li key={a.id}>
                  <Link href={a.url ?? "/work/alerts"} className="flex gap-3 px-4 py-3">
                    <span className={"mt-1.5 h-2 w-2 shrink-0 rounded-full " + (a.read_at ? "bg-transparent" : "bg-brass")} />
                    <span className="min-w-0 flex-1">
                      <b className="block text-[14px]">{a.title}</b>
                      {a.body && <span className="block text-[12.5px] text-ink-2">{a.body}</span>}
                      <span className="text-[11.5px] text-ink-3">{ago(a.created_at)}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        </section>
      )}
    </StaffShell>
  );
}

function Stat({ label, value, href }: { label: string; value: number; href?: string }) {
  const inner = (
    <Card className="flex flex-col gap-0.5 px-3.5 py-3">
      <span className="font-display text-[28px] font-medium leading-none tabular-nums">{value}</span>
      <span className="text-[12px] font-semibold text-ink-2">{label}</span>
    </Card>
  );
  return href ? <Link href={href}>{inner}</Link> : inner;
}
