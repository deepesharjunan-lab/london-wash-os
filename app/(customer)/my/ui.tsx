import Link from "next/link";

// Shared pieces for the customer app (/my). Mobile-first, London Wash Club look.

const TABS: { href: string; label: string; icon: string }[] = [
  { href: "/my", label: "Home", icon: '<path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-4.5v-6h-5v6H5a1 1 0 0 1-1-1z"/>' },
  { href: "/my/orders", label: "Orders", icon: '<path d="M5.5 8h13l-1 12.2a1 1 0 0 1-1 .8H7.5a1 1 0 0 1-1-.8z"/><path d="M9 8V6.5a3 3 0 0 1 6 0V8"/>' },
  { href: "/my/rewards", label: "Rewards", icon: '<rect x="4" y="9" width="16" height="11" rx="1"/><path d="M3 9h18M12 9v11M12 9C9.5 9 7 8.2 7 6.4 7 4.2 10 4 12 9c2-5 5-4.8 5-2.6C17 8.2 14.5 9 12 9"/>' },
  { href: "/my/membership", label: "Membership", icon: '<rect x="3" y="6" width="18" height="12.5" rx="2"/><path d="M3 10h18M7 15h4"/>' },
  { href: "/my/profile", label: "Profile", icon: '<circle cx="12" cy="8.5" r="3.5"/><path d="M5 20c1-3.5 3.8-5 7-5s6 1.5 7 5"/>' },
];

export function Icon({ d, className }: { d: string; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={className ?? "h-5 w-5"}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      dangerouslySetInnerHTML={{ __html: d }}
    />
  );
}

export function AppShell({
  current,
  title,
  back,
  children,
}: {
  current?: string;
  title?: string;
  back?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="lw-app mx-auto flex min-h-screen max-w-[480px] flex-col bg-ivory text-ink">
      {(title || back) && (
        <header className="sticky top-0 z-20 flex items-center gap-2 bg-ivory/95 px-3 pb-2 pt-[max(12px,env(safe-area-inset-top))] backdrop-blur">
          {back && (
            <Link href={back} aria-label="Back" className="grid h-11 w-11 place-items-center rounded-full hover:bg-beige">
              <Icon d='<path d="m15 6-6 6 6 6"/>' />
            </Link>
          )}
          {title && <h1 className={back ? "text-[17px] font-semibold" : "px-2 font-display text-[30px] font-medium"}>{title}</h1>}
        </header>
      )}
      <main className="flex flex-1 flex-col gap-5 px-5 pb-28 pt-2">{children}</main>
      {current && (
        <nav
          className="fixed inset-x-0 bottom-0 z-30 mx-auto grid max-w-[480px] grid-cols-5 border-t border-hair bg-white px-1.5 pb-[max(14px,env(safe-area-inset-bottom))] pt-1.5"
          aria-label="Main"
        >
          {TABS.map((t) => {
            const active = t.href === current;
            return (
              <Link
                key={t.href}
                href={t.href}
                aria-current={active ? "page" : undefined}
                className={"flex min-h-[48px] flex-col items-center justify-center gap-0.5 text-[11px] font-semibold " + (active ? "text-ink" : "text-ink-3")}
              >
                <Icon d={t.icon} className="h-[22px] w-[22px]" />
                {t.label}
                {active && <span className="h-1 w-1 rounded-full bg-brass" />}
              </Link>
            );
          })}
        </nav>
      )}
    </div>
  );
}

// Tier card colours, matching the prototype.
const CARD: Record<string, { bg: string; ink: string; edge: string; accent: string }> = {
  prestige: { bg: "linear-gradient(135deg,#F7F2E8 0%,#EAE1D0 100%)", ink: "#15213A", edge: "rgba(21,33,58,.12)", accent: "#15213A" },
  elite: { bg: "linear-gradient(140deg,#8391A0 0%,#5E6D7E 100%)", ink: "#F6F3EE", edge: "rgba(255,255,255,.18)", accent: "#F6F3EE" },
  signature: { bg: "linear-gradient(150deg,#1D2E50 0%,#121D35 100%)", ink: "#F3EEE4", edge: "rgba(199,181,143,.35)", accent: "#C7B58F" },
  sovereign: { bg: "linear-gradient(160deg,#1E1F23 0%,#111215 100%)", ink: "#ECE6DA", edge: "rgba(199,181,143,.28)", accent: "#C7B58F" },
};
export const cardStyle = (style: string | null) => CARD[style ?? "prestige"] ?? CARD.prestige;

export function TierCard({
  style,
  tierName,
  memberNo,
  points,
  progressPct,
  leftNote,
  rightNote,
  renew,
  href,
}: {
  style: string | null;
  tierName: string;
  memberNo: string | null;
  points: string;
  progressPct: number;
  leftNote: string;
  rightNote: string;
  renew?: string;
  href?: string;
}) {
  const c = cardStyle(style);
  const inner = (
    <div
      className="relative flex flex-col gap-4 overflow-hidden rounded-[18px] p-5 shadow-[0_20px_40px_-24px_rgba(10,14,24,.55)]"
      style={{ background: c.bg, color: c.ink, boxShadow: `inset 0 0 0 1px ${c.edge}, 0 20px 40px -24px rgba(10,14,24,.55)` }}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-[0.24em] opacity-75">The London Wash Club</span>
        {memberNo && <span className="font-mono text-[11px] opacity-75">{memberNo}</span>}
      </div>
      <div className="font-display text-[26px] font-medium uppercase leading-none tracking-[0.2em]" style={{ color: c.accent }}>
        {tierName}
      </div>
      <div className="flex items-end justify-between gap-3">
        <div className="font-display text-[34px] font-medium leading-none tabular-nums">
          {points}
          <span className="ml-1.5 font-archivo text-[12px] font-semibold uppercase tracking-[0.14em] opacity-70">points</span>
        </div>
        {renew && (
          <div className="text-right text-[12.5px] opacity-80">
            Renews
            <br />
            {renew}
          </div>
        )}
      </div>
      <div>
        <div className="h-1.5 overflow-hidden rounded-full" style={{ background: "rgba(127,127,127,.25)" }} role="progressbar" aria-valuenow={Math.round(progressPct * 100)} aria-valuemin={0} aria-valuemax={100}>
          <div className="h-full rounded-full" style={{ width: `${Math.round(progressPct * 100)}%`, background: c.accent }} />
        </div>
        <div className="mt-2 flex justify-between gap-2 text-[12.5px] tabular-nums opacity-80">
          <span>{leftNote}</span>
          <span className="text-right">{rightNote}</span>
        </div>
      </div>
    </div>
  );
  return href ? (
    <Link href={href} aria-label="Open membership card">
      {inner}
    </Link>
  ) : (
    inner
  );
}

export function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return <section className={"rounded-[14px] border border-hair bg-white shadow-[0_1px_2px_rgba(21,33,58,.05),0_10px_28px_-16px_rgba(21,33,58,.22)] " + (className ?? "")}>{children}</section>;
}

export function Notice({ tone, children }: { tone: "ok" | "warn" | "info" | "danger"; children: React.ReactNode }) {
  const map = {
    ok: "bg-[#e2eee7] text-[#2c6a4e]",
    warn: "bg-[#f5ebd9] text-[#8a5a12]",
    info: "bg-[#e2e9f2] text-[#2b5584]",
    danger: "bg-[#f6e4df] text-[#9c3326]",
  };
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={"rounded-xl px-4 py-3 text-[13.5px] " + map[tone]}>
      {children}
    </div>
  );
}

export const btn = "inline-flex min-h-[48px] items-center justify-center gap-2 rounded-full bg-navy px-5 text-[15px] font-semibold text-[#f8f5ef] transition active:scale-[.985] disabled:opacity-40";
export const btnGhost = "inline-flex min-h-[44px] items-center justify-center gap-2 rounded-full border border-hair-2 bg-white px-4 text-[14px] font-semibold text-ink";
export const input = "w-full min-h-[48px] rounded-xl border border-hair-2 bg-white px-3.5 text-[15px] text-ink outline-none focus:border-brass focus:ring-2 focus:ring-brass/30";

export const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
