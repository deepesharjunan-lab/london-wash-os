import Link from "next/link";
import { Icon } from "@/app/(customer)/my/ui";
import { Logo } from "@/lib/brand/Logo";

export { Card, Icon, Notice, btn, btnGhost, input } from "@/app/(customer)/my/ui";
export { Chip, STATUS_LABEL } from "@/app/(staff)/work/ui";

// Owner app shell: Today, Production, Team, Orders, Alerts.

const TABS = [
  { href: "/owner", label: "Today", icon: '<path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-4.5v-6h-5v6H5a1 1 0 0 1-1-1z"/>' },
  { href: "/owner/production", label: "Production", icon: '<path d="M4 20h16M7 16v-5M12 16V7M17 16v-8"/>' },
  { href: "/owner/team", label: "Team", icon: '<circle cx="9" cy="8" r="3"/><path d="M3.5 19c.8-3 3-4.5 5.5-4.5s4.7 1.5 5.5 4.5"/><path d="M15 5.3a3 3 0 0 1 0 5.4M17.5 14.8c1.6.6 2.6 2 3 4.2"/>' },
  { href: "/owner/orders", label: "Orders", icon: '<path d="M5.5 8h13l-1 12.2a1 1 0 0 1-1 .8H7.5a1 1 0 0 1-1-.8z"/><path d="M9 8V6.5a3 3 0 0 1 6 0V8"/>' },
  { href: "/owner/alerts", label: "Alerts", icon: '<path d="M6 16v-5a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 20.5a2 2 0 0 0 4 0"/>' },
];

export function OwnerShell({
  current,
  title,
  back,
  unread = 0,
  action,
  children,
}: {
  current?: string;
  title?: string;
  back?: string;
  unread?: number;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="lw-app mx-auto flex min-h-screen max-w-[520px] flex-col bg-ivory text-ink">
      <header className="sticky top-0 z-20 flex items-center gap-2 bg-ivory/95 px-3 pb-2 pt-[max(12px,env(safe-area-inset-top))] backdrop-blur">
        {back ? (
          <Link href={back} aria-label="Back" className="grid h-11 w-11 place-items-center rounded-full hover:bg-beige">
            <Icon d='<path d="m15 6-6 6 6 6"/>' />
          </Link>
        ) : (
          <span className="grid h-11 w-11 place-items-center" aria-hidden="true">
            <Logo variant="monogram" alt="" className="h-auto w-9" />
          </span>
        )}
        <h1 className="min-w-0 flex-1 truncate text-[17px] font-semibold">{title ?? "London Wash Owner"}</h1>
        {action}
      </header>
      <main className="flex flex-1 flex-col gap-4 px-4 pb-28 pt-1">{children}</main>
      <nav className="fixed inset-x-0 bottom-0 z-30 mx-auto grid max-w-[520px] grid-cols-5 border-t border-hair bg-white px-1.5 pb-[max(14px,env(safe-area-inset-bottom))] pt-1.5" aria-label="Main">
        {TABS.map((t) => {
          const active = t.href === current;
          return (
            <Link
              key={t.href}
              href={t.href}
              aria-current={active ? "page" : undefined}
              className={"relative flex min-h-[52px] flex-col items-center justify-center gap-0.5 text-[11px] font-semibold " + (active ? "text-ink" : "text-ink-3")}
            >
              <Icon d={t.icon} className="h-[23px] w-[23px]" />
              {t.label}
              {t.href === "/owner/alerts" && unread > 0 && (
                <span className="absolute left-1/2 top-0.5 ml-2 grid min-w-[18px] place-items-center rounded-full bg-[#9c3326] px-1 text-[10.5px] font-bold leading-[18px] text-white">
                  {unread > 9 ? "9+" : unread}
                </span>
              )}
              {active && <span className="h-1 w-1 rounded-full bg-brass" />}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

export const rupees = (minor: number) => `₹${Math.round((minor || 0) / 100).toLocaleString("en-IN")}`;

export function Stat({ label, value, note, href }: { label: string; value: string | number; note?: string; href?: string }) {
  const inner = (
    <div className="flex h-full flex-col gap-0.5 rounded-[14px] border border-hair bg-white px-3.5 py-3 shadow-[0_1px_2px_rgba(21,33,58,.05)]">
      <span className="text-[11.5px] font-semibold uppercase tracking-[0.1em] text-ink-3">{label}</span>
      <span className="font-display text-[26px] font-medium leading-tight tabular-nums">{value}</span>
      {note && <span className="text-[12px] text-ink-2">{note}</span>}
    </div>
  );
  return href ? <Link href={href}>{inner}</Link> : inner;
}
