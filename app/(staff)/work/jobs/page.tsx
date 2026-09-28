import Link from "next/link";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/staff/session";
import { loadStages, stagesForRole } from "@/lib/staff/flow";
import { loadDone, loadQueue } from "@/lib/staff/queue";
import { duration, fmtDay, fmtTime, istDate, istDayStart } from "@/lib/time";
import { Card, Chip, StaffShell, unreadCount } from "../ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "My work · London Wash Staff" };

const TABS = [
  { key: "pending", label: "Pending" },
  { key: "progress", label: "In progress" },
  { key: "done", label: "Completed" },
] as const;

export default async function JobsPage({ searchParams }: { searchParams: { tab?: string } }) {
  const { me, db } = await requireStaff();
  if (me.app_role === "driver") redirect("/work/runs");
  const tab = TABS.find((t) => t.key === searchParams.tab)?.key ?? "pending";
  const stages = await loadStages(db);
  const mine = stagesForRole(stages, me.app_role);
  const unread = await unreadCount(db, me.id);

  let content: React.ReactNode;
  if (tab === "done") {
    const since = istDayStart(istDate(new Date(Date.now() - 6 * 864e5)));
    const done = await loadDone(db, me.id, since, 500);
    const byDay = new Map<string, typeof done>();
    done.forEach((d) => {
      const day = istDate(new Date(d.at));
      byDay.set(day, [...(byDay.get(day) ?? []), d]);
    });
    content = done.length ? (
      [...byDay.entries()].map(([day, rows]) => (
        <section key={day} className="flex flex-col gap-2">
          <h2 className="flex items-center justify-between text-[14px] font-semibold">
            {day === istDate() ? "Today" : fmtDay(day)} <span className="text-[12.5px] font-semibold text-ink-2">{rows.length} garments</span>
          </h2>
          <Card>
            <ul className="divide-y divide-hair">
              {rows.map((d) => (
                <li key={d.id} className="flex items-center gap-3 px-4 py-2.5 text-[13.5px]">
                  <span className="min-w-0 flex-1">
                    <b className="block truncate">{d.itemName}</b>
                    <span className="text-[12px] text-ink-2">
                      {d.orderNumber ?? "—"} · tag {d.tag ?? "—"}
                    </span>
                  </span>
                  <span className="text-right text-[12px] text-ink-2">
                    {d.skipped ? <Chip>Skipped</Chip> : d.minutes != null ? `${d.minutes} min` : ""}
                    <span className="block">{fmtTime(d.at)}</span>
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        </section>
      ))
    ) : (
      <Empty text="Nothing finished in the last 7 days yet." />
    );
  } else {
    const queue = await loadQueue(db, stages, mine.map((s) => s.id), me.branch_id);
    if (tab === "pending") {
      const rows = queue.filter((q) => q.waiting > 0);
      content = rows.length ? (
        <Card>
          <ul className="divide-y divide-hair">
            {rows.map((q) => (
              <li key={q.orderId + q.stageId}>
                <Link href={`/work/orders/${q.orderId}`} className="flex flex-col gap-1.5 px-4 py-3">
                  <span className="flex items-center justify-between gap-2">
                    <b className="text-[14.5px]">{q.orderNumber}</b>
                    <Chip tone="brass">{q.waiting} waiting</Chip>
                  </span>
                  <span className="text-[12.5px] text-ink-2">
                    {q.customerName} · {q.stageName} · since {fmtDay(q.createdAt)}
                  </span>
                  <span className="flex flex-wrap gap-1">
                    {q.garments
                      .filter((g) => g.state === "waiting")
                      .slice(0, 8)
                      .map((g) => (
                        <span key={g.id} className="rounded-md bg-ivory px-1.5 py-0.5 font-mono text-[11px] text-ink-2">
                          {g.tag} {g.itemName}
                        </span>
                      ))}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      ) : (
        <Empty text="Nothing waiting for you. Nice work!" />
      );
    } else {
      const inProg = queue.flatMap((q) => q.garments.filter((g) => g.state === "in_progress").map((g) => ({ ...g, q })));
      const ids = [...new Set(inProg.map((g) => g.employeeId).filter(Boolean))] as string[];
      const { data: people } = ids.length ? await db.from("employee").select("id, full_name").in("id", ids) : { data: [] };
      const name = new Map(((people ?? []) as { id: string; full_name: string }[]).map((p) => [p.id, p.full_name] as [string, string]));
      inProg.sort((a, b) => Number(b.employeeId === me.id) - Number(a.employeeId === me.id));
      content = inProg.length ? (
        <Card>
          <ul className="divide-y divide-hair">
            {inProg.map((g) => (
              <li key={g.id} className="flex items-center gap-3 px-4 py-3 text-[13.5px]">
                <span className="min-w-0 flex-1">
                  <b className="block truncate">
                    {g.itemName} <span className="font-mono text-[11.5px] font-normal text-ink-3">#{g.tag}</span>
                  </b>
                  <span className="text-[12px] text-ink-2">
                    {g.q.orderNumber} · {g.employeeId === me.id ? "You" : name.get(g.employeeId ?? "") ?? "—"}
                  </span>
                </span>
                <Chip tone={g.employeeId === me.id ? "info" : "plain"}>{duration(g.startedAt)}</Chip>
              </li>
            ))}
          </ul>
        </Card>
      ) : (
        <Empty text="Nothing in progress. Scan a garment to start." />
      );
    }
  }

  return (
    <StaffShell role={me.app_role} current="/work/jobs" title="My work" unread={unread}>
      <div className="grid grid-cols-3 gap-1 rounded-full bg-beige p-1" role="tablist">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/work/jobs?tab=${t.key}`}
            role="tab"
            aria-selected={tab === t.key}
            className={"grid min-h-[40px] place-items-center rounded-full text-[13px] font-semibold " + (tab === t.key ? "bg-white text-ink shadow-sm" : "text-ink-2")}
          >
            {t.label}
          </Link>
        ))}
      </div>
      <p className="text-[12.5px] text-ink-2">Your stage: {mine.map((s) => s.name).join(", ") || "—"}</p>
      {content}
    </StaffShell>
  );
}

function Empty({ text }: { text: string }) {
  return <Card className="px-4 py-10 text-center text-[14px] text-ink-2">{text}</Card>;
}
