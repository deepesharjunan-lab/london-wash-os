import Link from "next/link";
import { requireStaff } from "@/lib/staff/session";
import { isPunchedIn, todayAttendance } from "@/lib/staff/attendance";
import { loadRuns, type Run } from "@/lib/staff/runs";
import { mapsLink } from "@/lib/geo";
import { fmtDateTime, fmtTime, istDate, istDayStart } from "@/lib/time";
import { completeRunAction, failRunAction, startRunAction } from "../actions";
import { Card, Chip, ICONS, Icon, Notice, StaffShell, btn, btnGhost, input, unreadCount } from "../ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Runs · London Wash Staff" };

export default async function RunsPage({ searchParams }: { searchParams: { tab?: string; ok?: string; error?: string } }) {
  const { me, db } = await requireStaff(["driver"]);
  const tab = searchParams.tab === "done" ? "done" : "open";
  const [att, unread] = await Promise.all([todayAttendance(db, me.id), unreadCount(db, me.id)]);
  const runs = me.driver_id
    ? await loadRuns(db, me.driver_id, tab === "open" ? { open: true } : { open: false, sinceIso: istDayStart(istDate(new Date(Date.now() - 6 * 864e5))) })
    : [];
  const onShift = isPunchedIn(att);

  return (
    <StaffShell role="driver" current="/work/runs" title="My runs" unread={unread}>
      {searchParams.ok && <Notice tone="ok">{searchParams.ok}</Notice>}
      {searchParams.error && <Notice tone="danger">{searchParams.error}</Notice>}
      {!me.driver_id && <Notice tone="warn">Your driver profile isn&apos;t linked yet. Ask the owner.</Notice>}
      {tab === "open" && !onShift && <Notice tone="warn">Punch in at the branch (Home) before you start.</Notice>}

      <div className="grid grid-cols-2 gap-1 rounded-full bg-beige p-1">
        {[
          ["open", "To do"],
          ["done", "Done (7 days)"],
        ].map(([k, label]) => (
          <Link
            key={k}
            href={`/work/runs?tab=${k}`}
            aria-current={tab === k ? "page" : undefined}
            className={"grid min-h-[40px] place-items-center rounded-full text-[13px] font-semibold " + (tab === k ? "bg-white text-ink shadow-sm" : "text-ink-2")}
          >
            {label}
          </Link>
        ))}
      </div>

      {runs.length === 0 && (
        <Card className="px-4 py-10 text-center text-[14px] text-ink-2">
          {tab === "open" ? "No pickups or deliveries assigned to you right now." : "Nothing completed in the last 7 days."}
        </Card>
      )}
      {runs.map((r) => (tab === "open" ? <OpenRun key={r.kind + r.id} r={r} /> : <DoneRun key={r.kind + r.id} r={r} />))}
    </StaffShell>
  );
}

function RunHeader({ r }: { r: Run }) {
  return (
    <div className="flex items-start justify-between gap-2">
      <div className="min-w-0">
        <div className="text-[11.5px] font-semibold uppercase tracking-[0.12em] text-brass">
          {r.kind === "pickup" ? "Pickup" : "Delivery"}
          {r.orderNumber ? ` · ${r.orderNumber}` : ""}
        </div>
        <b className="block text-[17px] leading-tight">{r.customerName}</b>
        <span className="text-[12.5px] text-ink-2">
          {r.windowStart ? `${fmtDateTime(r.windowStart)}${r.windowEnd ? ` – ${fmtTime(r.windowEnd)}` : ""}` : "No time set"}
        </span>
      </div>
      <Chip tone={r.status === "en_route" ? "info" : r.status === "completed" ? "ok" : r.status === "failed" ? "danger" : "brass"}>
        {r.status === "en_route" ? "On the way" : r.status.replace("_", " ")}
      </Chip>
    </div>
  );
}

function OpenRun({ r }: { r: Run }) {
  const map = r.lat != null && r.lng != null ? mapsLink(r.lat, r.lng) : r.address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(r.address)}` : null;
  return (
    <Card className="flex flex-col gap-3 p-4">
      <RunHeader r={r} />
      {r.address && <p className="text-[13.5px]">{r.address}</p>}
      {r.services.length > 0 && <p className="text-[12.5px] text-ink-2">Services: {r.services.join(", ")}</p>}
      {r.notes && <p className="rounded-xl bg-[#f5ebd9] px-3 py-2 text-[13px] text-[#8a5a12]">{r.notes}</p>}
      <div className="grid grid-cols-2 gap-2">
        {r.customerPhone ? (
          <a href={`tel:${r.customerPhone}`} className={btnGhost}>
            <Icon d={ICONS.phone} className="h-[18px] w-[18px]" /> Call
          </a>
        ) : (
          <span className={btnGhost + " opacity-40"}>No phone</span>
        )}
        {map ? (
          <a href={map} target="_blank" rel="noopener noreferrer" className={btnGhost}>
            <Icon d={ICONS.map} className="h-[18px] w-[18px]" /> Directions
          </a>
        ) : (
          <span className={btnGhost + " opacity-40"}>No address</span>
        )}
      </div>

      {r.status === "scheduled" ? (
        <form action={startRunAction}>
          <input type="hidden" name="kind" value={r.kind} />
          <input type="hidden" name="id" value={r.id} />
          <button type="submit" className={btn + " w-full"}>
            Start {r.kind === "pickup" ? "pickup" : "delivery"}
          </button>
        </form>
      ) : (
        <form action={completeRunAction} className="flex flex-col gap-2">
          <input type="hidden" name="kind" value={r.kind} />
          <input type="hidden" name="id" value={r.id} />
          {r.kind === "delivery" && r.needsOtp && (
            <input name="otp" inputMode="numeric" placeholder="Customer's delivery code" aria-label="Delivery code" className={input} required />
          )}
          {r.kind === "delivery" && (
            <input
              name="cash"
              type="number"
              min="0"
              step="1"
              inputMode="numeric"
              placeholder={r.orderTotalMinor ? `Cash collected (₹), order ₹${Math.round(r.orderTotalMinor / 100)}` : "Cash collected (₹), if any"}
              aria-label="Cash collected"
              className={input}
            />
          )}
          <input name="note" placeholder="Note (optional)" aria-label="Note" className={input} />
          <button type="submit" className="inline-flex min-h-[54px] items-center justify-center rounded-full bg-[#2c6a4e] text-[16px] font-semibold text-white">
            {r.kind === "pickup" ? "Picked up" : "Delivered"}
          </button>
        </form>
      )}

      <details className="rounded-xl border border-hair px-3 py-2">
        <summary className="cursor-pointer text-[13px] font-semibold text-ink-2">Couldn&apos;t complete?</summary>
        <form action={failRunAction} className="mt-2 flex flex-col gap-2">
          <input type="hidden" name="kind" value={r.kind} />
          <input type="hidden" name="id" value={r.id} />
          <input name="reason" required placeholder="What happened? (customer not home…)" aria-label="Reason" className={input} />
          <button type="submit" className="min-h-[44px] rounded-full border border-[#9c3326]/40 text-[14px] font-semibold text-[#9c3326]">
            Mark not completed
          </button>
        </form>
      </details>
    </Card>
  );
}

function DoneRun({ r }: { r: Run }) {
  return (
    <Card className="flex flex-col gap-1.5 p-4">
      <RunHeader r={r} />
      <span className="text-[12.5px] text-ink-2">Closed {fmtDateTime(r.completedAt)}</span>
      {r.driverNote && <span className="text-[12.5px] text-ink-2">Note: {r.driverNote}</span>}
    </Card>
  );
}
