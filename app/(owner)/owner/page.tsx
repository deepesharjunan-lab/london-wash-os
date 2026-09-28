import Link from "next/link";
import { ownerUnread, requireOwner } from "@/lib/owner";
import { loadStages } from "@/lib/staff/flow";
import { loadQueue } from "@/lib/staff/queue";
import { vapidPublicKey } from "@/lib/push";
import { PushToggle } from "@/lib/pwa/PushToggle";
import { InstallHint } from "@/lib/pwa/InstallHint";
import { ago, istDate, istDayStart } from "@/lib/time";
import { removeOwnerPushAction, saveOwnerPushAction } from "./actions";
import { Card, Chip, OwnerShell, Stat, rupees } from "./ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Today · London Wash Owner" };

export default async function OwnerTodayPage() {
  const { supabase, admin, me } = await requireOwner();
  const today = istDate();
  const start = istDayStart(today);

  const [ordersRes, paymentsRes, readyRes, staffRes, attRes, pickupsRes, stages, unread, publicKey, alertsRes] = await Promise.all([
    supabase.from("order").select("id, total_minor, status").gte("created_at", start).neq("status", "cancelled"),
    supabase.from("payment").select("amount_minor, status").gte("created_at", start),
    supabase.from("order").select("id", { count: "exact", head: true }).eq("status", "ready"),
    supabase.from("employee").select("id").eq("is_active", true).is("deleted_at", null),
    supabase.from("attendance").select("employee_id, check_in, check_out").eq("work_date", today),
    supabase.from("pickup").select("id, driver_id, status").in("status", ["scheduled", "en_route"]),
    loadStages(supabase),
    ownerUnread(admin, me.id),
    vapidPublicKey(admin),
    admin.from("app_notification").select("id, title, body, url, created_at, read_at").eq("user_id", me.id).order("created_at", { ascending: false }).limit(4),
  ]);

  const orders = (ordersRes.data ?? []) as { total_minor: number }[];
  const booked = orders.reduce((a, o) => a + Number(o.total_minor || 0), 0);
  const collected = ((paymentsRes.data ?? []) as { amount_minor: number; status: string }[])
    .filter((p) => p.status === "captured" || p.status === "partially_refunded")
    .reduce((a, p) => a + Number(p.amount_minor || 0), 0);
  const staffTotal = (staffRes.data ?? []).length;
  const att = (attRes.data ?? []) as { check_in: string | null; check_out: string | null }[];
  const present = att.filter((a) => a.check_in).length;
  const onShift = att.filter((a) => a.check_in && !a.check_out).length;
  const pickups = (pickupsRes.data ?? []) as { driver_id: string | null }[];
  const unassigned = pickups.filter((p) => !p.driver_id).length;
  const alerts = (alertsRes.data ?? []) as { id: string; title: string; body: string | null; url: string | null; created_at: string; read_at: string | null }[];

  const working = stages.filter((s) => s.code !== "delivered");
  const queue = await loadQueue(supabase, stages, working.map((s) => s.id), null);
  const byStage = working.map((s) => {
    const qs = queue.filter((q) => q.stageId === s.id);
    return { s, waiting: qs.reduce((a, q) => a + q.waiting, 0), inProgress: qs.reduce((a, q) => a + q.inProgress, 0) };
  });

  return (
    <OwnerShell current="/owner" title={me.branchName} unread={unread}>
      <div className="pt-1">
        <div className="text-[14px] text-ink-2">
          {new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", timeZone: "Asia/Kolkata" })}
        </div>
        <div className="font-display text-[30px] font-medium leading-tight">Hello, {me.firstName}</div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Stat label="Orders today" value={orders.length} note={`${rupees(booked)} booked`} href="/owner/orders?view=today" />
        <Stat label="Collected today" value={rupees(collected)} note="payments recorded" />
        <Stat label="Team" value={`${present}/${staffTotal}`} note={`${onShift} on shift now`} href="/owner/team" />
        <Stat label="Ready" value={readyRes.count ?? 0} note="for delivery or collection" href="/owner/orders?view=ready" />
      </div>

      {unassigned > 0 && (
        <Link href="/delivery" className="flex items-center justify-between gap-3 rounded-[14px] bg-[#f5ebd9] px-4 py-3 text-[13.5px] text-[#8a5a12]">
          <span>
            <b>{unassigned} pickup {unassigned === 1 ? "request needs" : "requests need"} a driver.</b> Assign in the console.
          </span>
          <span aria-hidden="true">→</span>
        </Link>
      )}

      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h2 className="text-[15px] font-semibold">Production now</h2>
          <Link href="/owner/production" className="text-[13px] font-semibold text-ink-2">
            Open
          </Link>
        </div>
        <Card>
          <ul className="divide-y divide-hair">
            {byStage.map(({ s, waiting, inProgress }) => (
              <li key={s.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-[13.5px]">
                <span className="font-semibold">{s.name}</span>
                <span className="flex gap-1.5">
                  {inProgress > 0 && <Chip tone="info">{inProgress} working</Chip>}
                  <Chip tone={waiting ? "brass" : "plain"}>{waiting} waiting</Chip>
                </span>
              </li>
            ))}
            {!byStage.length && <li className="px-4 py-3 text-[13.5px] text-ink-2">The garment flow isn&apos;t set up yet.</li>}
          </ul>
        </Card>
      </section>

      <InstallHint appName="London Wash Owner" storageKey="lw-owner-install-dismissed" />
      <PushToggle publicKey={publicKey} save={saveOwnerPushAction} remove={removeOwnerPushAction} />

      {alerts.length > 0 && (
        <section className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <h2 className="text-[15px] font-semibold">Latest alerts</h2>
            <Link href="/owner/alerts" className="text-[13px] font-semibold text-ink-2">
              See all
            </Link>
          </div>
          <Card>
            <ul className="divide-y divide-hair">
              {alerts.map((a) => (
                <li key={a.id}>
                  <Link href={a.url ?? "/owner/alerts"} className="flex gap-3 px-4 py-3">
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

      <Link href="/dashboard" className="text-center text-[13.5px] font-semibold text-ink-2 underline-offset-4 hover:underline">
        Open the full console
      </Link>
    </OwnerShell>
  );
}
