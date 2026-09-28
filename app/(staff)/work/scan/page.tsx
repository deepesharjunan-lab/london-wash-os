import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/staff/session";
import { isPunchedIn, todayAttendance } from "@/lib/staff/attendance";
import { loadStages, stagesForRole } from "@/lib/staff/flow";
import { Notice, StaffShell, unreadCount } from "../ui";
import { Scanner } from "./Scanner";

export const dynamic = "force-dynamic";
export const metadata = { title: "Scan · London Wash Staff" };

export default async function ScanPage() {
  const { me, db } = await requireStaff();
  if (me.app_role === "driver") redirect("/work/runs");
  const [att, unread, stages] = await Promise.all([todayAttendance(db, me.id), unreadCount(db, me.id), loadStages(db)]);
  const mine = stagesForRole(stages, me.app_role).map((s) => s.name);
  return (
    <StaffShell role={me.app_role} current="/work/scan" title="Scan" unread={unread}>
      {!isPunchedIn(att) && <Notice tone="warn">You&apos;re not punched in. You can look garments up, but punch in on Home to start work.</Notice>}
      <p className="text-[13.5px] text-ink-2">
        Scan <b className="text-ink">before</b> you start and <b className="text-ink">after</b> you finish. Your stage:{" "}
        <b className="text-ink">{mine.join(", ") || "—"}</b>.
      </p>
      <Scanner />
    </StaffShell>
  );
}
