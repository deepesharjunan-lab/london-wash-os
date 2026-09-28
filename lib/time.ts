// India Standard Time helpers. The business runs on IST, while the server runs on UTC.

export const IST = "Asia/Kolkata";

/** Today's date in IST as YYYY-MM-DD. */
export const istDate = (d: Date = new Date()) => d.toLocaleDateString("en-CA", { timeZone: IST });

/** Midnight IST at the start of a YYYY-MM-DD date, as an ISO timestamp. */
export const istDayStart = (date: string) => new Date(`${date}T00:00:00+05:30`).toISOString();

/** The first and last YYYY-MM-DD of a YYYY-MM month. */
export function monthRange(month: string) {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, "0")}`, days: last };
}

export const fmtTime = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", timeZone: IST }) : "—";

export const fmtDay = (isoOrDate: string) =>
  new Date(isoOrDate.length === 10 ? `${isoOrDate}T12:00:00+05:30` : isoOrDate).toLocaleDateString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: IST,
  });

export const fmtDateTime = (iso: string | null | undefined) =>
  iso
    ? new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: IST })
    : "—";

/** "2h 05m" between two timestamps (or until now). */
export function duration(fromIso: string | null | undefined, toIso?: string | null) {
  if (!fromIso) return "—";
  const ms = (toIso ? new Date(toIso).getTime() : Date.now()) - new Date(fromIso).getTime();
  if (ms < 0) return "—";
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, "0")}m`;
}

/** Time since, in words: "just now", "12 min ago", "3 h ago", or the date. */
export function ago(iso: string) {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  if (mins < 24 * 60) return `${Math.round(mins / 60)} h ago`;
  return fmtDay(iso);
}
