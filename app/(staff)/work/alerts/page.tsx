import Link from "next/link";
import { requireStaff } from "@/lib/staff/session";
import { ago } from "@/lib/time";
import { Card, StaffShell, unreadCount } from "../ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Alerts · London Wash Staff" };

export default async function StaffAlertsPage() {
  const { me, db } = await requireStaff();
  const [unread, { data }] = await Promise.all([
    unreadCount(db, me.id),
    db.from("app_notification").select("id, title, body, url, created_at, read_at").eq("employee_id", me.id).order("created_at", { ascending: false }).limit(60),
  ]);
  const alerts = (data ?? []) as { id: string; title: string; body: string | null; url: string | null; created_at: string; read_at: string | null }[];
  // Opening the list counts as reading it; this visit still shows which ones were new.
  if (unread) await db.from("app_notification").update({ read_at: new Date().toISOString() }).eq("employee_id", me.id).is("read_at", null);
  return (
    <StaffShell role={me.app_role} title="Alerts" back="/work">
      {alerts.length ? (
        <Card>
          <ul className="divide-y divide-hair">
            {alerts.map((a) => (
              <li key={a.id}>
                <Link href={a.url ?? "/work"} className="flex gap-3 px-4 py-3">
                  <span className={"mt-1.5 h-2 w-2 shrink-0 rounded-full " + (a.read_at ? "bg-transparent" : "bg-brass")} />
                  <span className="min-w-0 flex-1">
                    <b className="block text-[14px]">{a.title}</b>
                    {a.body && <span className="block text-[13px] text-ink-2">{a.body}</span>}
                    <span className="text-[11.5px] text-ink-3">{ago(a.created_at)}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      ) : (
        <Card className="px-4 py-10 text-center text-[14px] text-ink-2">No alerts yet. New orders and work for you will show up here.</Card>
      )}
    </StaffShell>
  );
}
