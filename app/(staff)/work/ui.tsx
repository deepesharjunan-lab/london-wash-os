import Link from "next/link";
import { Icon } from "@/app/(customer)/my/ui";
import type { AppRole } from "@/lib/staff/roles";
import { Logo } from "@/lib/brand/Logo";

export { Card, Icon, Notice, btn, btnGhost, input } from "@/app/(customer)/my/ui";

// Staff app shell. Tabs change with the staff member's role.

export const ICONS = {
  home: '<path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-4.5v-6h-5v6H5a1 1 0 0 1-1-1z"/>',
  scan: '<path d="M4 8V5.5A1.5 1.5 0 0 1 5.5 4H8M16 4h2.5A1.5 1.5 0 0 1 20 5.5V8M20 16v2.5a1.5 1.5 0 0 1-1.5 1.5H16M8 20H5.5A1.5 1.5 0 0 1 4 18.5V16"/><path d="M8 8v8M11 8v8M14 8v8M17 8v8"/>',
  work: '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M8 3.5v3M16 3.5v3M8 11h8M8 15h5"/>',
  orders: '<path d="M5.5 8h13l-1 12.2a1 1 0 0 1-1 .8H7.5a1 1 0 0 1-1-.8z"/><path d="M9 8V6.5a3 3 0 0 1 6 0V8"/>',
  runs: '<path d="M3 7h11v9H3zM14 10h4l3 3v3h-7"/><circle cx="7" cy="17.5" r="1.8"/><circle cx="17" cy="17.5" r="1.8"/>',
  me: '<circle cx="12" cy="8.5" r="3.5"/><path d="M5 20c1-3.5 3.8-5 7-5s6 1.5 7 5"/>',
  bell: '<path d="M6 16v-5a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 20.5a2 2 0 0 0 4 0"/>',
  pin: '<path d="M12 21s7-6.2 7-11.5a7 7 0 0 0-14 0C5 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
  phone: '<path d="M5 4h3.5l1.5 4-2 1.5a11 11 0 0 0 6.5 6.5l1.5-2 4 1.5V19a1 1 0 0 1-1 1A16 16 0 0 1 4 5a1 1 0 0 1 1-1z"/>',
  map: '<path d="m9 4-5 2v14l5-2 6 2 5-2V4l-5 2z"/><path d="M9 4v14M15 6v14"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
};

type Tab = { href: string; label: string; icon: string };

export function tabsFor(role: AppRole): Tab[] {
  const home = { href: "/work", label: "Home", icon: ICONS.home };
  const me = { href: "/work/me", label: "Me", icon: ICONS.me };
  if (role === "driver") return [home, { href: "/work/runs", label: "Runs", icon: ICONS.runs }, me];
  const scan = { href: "/work/scan", label: "Scan", icon: ICONS.scan };
  const work = { href: "/work/jobs", label: "My work", icon: ICONS.work };
  const orders = { href: "/work/orders", label: "Orders", icon: ICONS.orders };
  if (role === "receptionist") return [home, scan, orders, work, me];
  return [home, scan, work, orders, me];
}

export function StaffShell({
  role,
  current,
  title,
  back,
  unread = 0,
  children,
}: {
  role: AppRole;
  current?: string;
  title?: string;
  back?: string;
  unread?: number;
  children: React.ReactNode;
}) {
  const tabs = tabsFor(role);
  return (
    <div className="lw-app mx-auto flex min-h-screen max-w-[480px] flex-col bg-ivory text-ink">
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
        <h1 className="min-w-0 flex-1 truncate text-[17px] font-semibold">{title ?? "London Wash Staff"}</h1>
        <Link href="/work/alerts" aria-label={unread ? `Alerts, ${unread} unread` : "Alerts"} className="relative grid h-11 w-11 place-items-center rounded-full hover:bg-beige">
          <Icon d={ICONS.bell} />
          {unread > 0 && (
            <span className="absolute right-1.5 top-1.5 grid min-w-[18px] place-items-center rounded-full bg-[#9c3326] px-1 text-[10.5px] font-bold leading-[18px] text-white">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </Link>
      </header>
      <main className="flex flex-1 flex-col gap-4 px-4 pb-28 pt-1">{children}</main>
      <nav
        className="fixed inset-x-0 bottom-0 z-30 mx-auto grid max-w-[480px] border-t border-hair bg-white px-1.5 pb-[max(14px,env(safe-area-inset-bottom))] pt-1.5"
        style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}
        aria-label="Main"
      >
        {tabs.map((t) => {
          const active = t.href === current;
          return (
            <Link
              key={t.href}
              href={t.href}
              aria-current={active ? "page" : undefined}
              className={"flex min-h-[52px] flex-col items-center justify-center gap-0.5 text-[11px] font-semibold " + (active ? "text-ink" : "text-ink-3")}
            >
              <Icon d={t.icon} className="h-[23px] w-[23px]" />
              {t.label}
              {active && <span className="h-1 w-1 rounded-full bg-brass" />}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

export const STATUS_LABEL: Record<string, string> = {
  draft: "New",
  confirmed: "Received",
  in_production: "In production",
  ready: "Ready",
  out_for_delivery: "Out for delivery",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

export function Chip({ tone = "plain", children }: { tone?: "plain" | "ok" | "warn" | "info" | "danger" | "brass"; children: React.ReactNode }) {
  const map = {
    plain: "bg-beige text-ink-2",
    ok: "bg-[#e2eee7] text-[#2c6a4e]",
    warn: "bg-[#f5ebd9] text-[#8a5a12]",
    info: "bg-[#e2e9f2] text-[#2b5584]",
    danger: "bg-[#f6e4df] text-[#9c3326]",
    brass: "bg-[#efe6d3] text-[#6f5c36]",
  };
  return <span className={"inline-flex items-center rounded-full px-2.5 py-0.5 text-[11.5px] font-semibold " + map[tone]}>{children}</span>;
}

export async function unreadCount(db: any, employeeId: string) {
  const { count } = await db.from("app_notification").select("id", { count: "exact", head: true }).eq("employee_id", employeeId).is("read_at", null);
  return count ?? 0;
}
