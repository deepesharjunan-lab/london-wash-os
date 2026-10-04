"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { playChime, subscribePulse, unlockSound, type Pulse } from "@/lib/whatsapp/pulse-client";

type NavGroup = { section: string; items: { href: string; label: string; badge?: number }[] };

// 24px line icons, 1.6 stroke, keyed by route.
const ICONS: Record<string, string> = {
  "/dashboard": '<rect x="4" y="4" width="7" height="7" rx="1"/><rect x="13" y="4" width="7" height="7" rx="1"/><rect x="4" y="13" width="7" height="7" rx="1"/><rect x="13" y="13" width="7" height="7" rx="1"/>',
  "/services": '<path d="M3.5 12V4.5a1 1 0 0 1 1-1H12l8.5 8.5-8.5 8.5z"/><circle cx="8" cy="8" r="1.3"/>',
  "/services/products": '<path d="M9 4 4 7v3h3v10h10V10h3V7l-5-3c0 1.7-1.3 3-3 3S9 5.7 9 4z"/>',
  "/services/sub-categories": '<rect x="3.5" y="4" width="7" height="7" rx="1"/><rect x="13.5" y="4" width="7" height="7" rx="1"/><rect x="3.5" y="14" width="7" height="7" rx="1"/><path d="M14 17.5h6M17 14.5v6"/>',
  "/services/price-lists": '<rect x="5" y="3.5" width="14" height="17" rx="1.5"/><path d="M8.5 8h7M8.5 12h7M8.5 16h4"/>',
  "/services/prices": '<path d="M3.5 12V4.5a1 1 0 0 1 1-1H12l8.5 8.5-8.5 8.5z"/><path d="M8 7v4M6 9h4"/>',
  "/pos": '<rect x="3" y="4" width="18" height="12" rx="1.5"/><path d="M8 20h8M12 16v4M7 8h4M7 11h7"/>',
  "/orders": '<path d="M5.5 8h13l-1 12.2a1 1 0 0 1-1 .8H7.5a1 1 0 0 1-1-.8z"/><path d="M9 8V6.5a3 3 0 0 1 6 0V8"/>',
  "/whatsapp": '<path d="M4.5 19.5 5.6 16A7.8 7.8 0 1 1 8.4 18.6z"/><path d="M9.3 9.2c.3 2.4 2.1 4.3 4.6 4.8l1-1.1 1.6.8-.4 1.5c-3.6.2-7.2-3.3-7-7l1.5-.4.8 1.6z"/>',
  "/engage/campaigns": '<path d="M4 10v4a1 1 0 0 0 1 1h2l5 4V5L7 9H5a1 1 0 0 0-1 1z"/><path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a7.5 7.5 0 0 1 0 11"/>',
  "/engage/automations": '<path d="M13 3 5 13.5h6L10 21l8-10.5h-6z"/>',
  "/engage/audiences": '<circle cx="9" cy="8" r="3"/><path d="M3.5 19c.8-3 3-4.5 5.5-4.5s4.7 1.5 5.5 4.5"/><path d="M15 9.5h6M15 13h4M15 16.5h2.5"/>',
  "/engage/templates": '<rect x="4" y="3.5" width="16" height="17" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/><path d="m15.5 15.5 1.5 1.5 3-3"/>',
  "/customers": '<circle cx="9" cy="8" r="3"/><path d="M3.5 19c.8-3 3-4.5 5.5-4.5s4.7 1.5 5.5 4.5"/><path d="M15 5.3a3 3 0 0 1 0 5.4M17.5 14.8c1.6.6 2.6 2 3 4.2"/>',
  "/corporate": '<rect x="4" y="7" width="16" height="13" rx="1"/><path d="M9 7V4.5h6V7M4 12h16"/>',
  "/crm": '<path d="M4.5 19.5 5.6 16A7.8 7.8 0 1 1 8.4 18.6z"/><path d="M9 10h6M9 13h4"/>',
  "/promotions": '<path d="M5 19 19 5"/><circle cx="7" cy="7" r="2"/><circle cx="17" cy="17" r="2"/>',
  "/referrals": '<circle cx="6" cy="12" r="2.5"/><circle cx="17" cy="6" r="2.5"/><circle cx="17" cy="18" r="2.5"/><path d="m8.2 10.8 6.6-3.6M8.2 13.2l6.6 3.6"/>',
  "/production": '<path d="M4 20h16M7 16v-5M12 16V7M17 16v-8"/>',
  "/quality": '<path d="M12 3 5 6v5c0 5 3 8.5 7 10 4-1.5 7-5 7-10V6z"/><path d="m9 12 2 2 4-4"/>',
  "/garments": '<path d="M12 8.2a2 2 0 1 1 2-2.1c0 1.2-2 1.6-2 3.1L3.6 15.2a1 1 0 0 0 .6 1.8h15.6a1 1 0 0 0 .6-1.8L12 9.2"/>',
  "/packing": '<path d="m12 4 8 4v8l-8 4-8-4V8z"/><path d="m4 8 8 4 8-4M12 12v8"/>',
  "/workflows": '<rect x="3" y="4" width="7" height="5" rx="1"/><rect x="14" y="15" width="7" height="5" rx="1"/><path d="M6.5 9v4.5a2 2 0 0 0 2 2H14"/>',
  "/wallet": '<path d="M4 7h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a1 1 0 0 1-1-1z"/><path d="M4 7l11-3v3M16 13.5h.01"/>',
  "/club": '<circle cx="12" cy="9" r="5"/><path d="m9 13.5-1.5 7L12 18l4.5 2.5-1.5-7"/>',
  "/loyalty": '<rect x="3" y="6" width="18" height="12.5" rx="2"/><path d="M3 10h18M7 15h4"/>',
  "/payroll": '<rect x="3" y="6" width="18" height="12.5" rx="2"/><path d="M3 10h18M7 15h4"/>',
  "/incentives": '<path d="m12 4 2.4 5 5.4.7-4 3.8 1 5.4-4.8-2.6-4.8 2.6 1-5.4-4-3.8 5.4-.7z"/>',
  "/complaints": '<path d="M12 4 2.8 19.5h18.4z"/><path d="M12 10v4M12 16.8h.01"/>',
  "/expenses": '<path d="M7 4.5h10M7 8.5h10M7 4.5h3.5a4 4 0 0 1 0 8H7l7.5 7"/>',
  "/inventory": '<path d="m12 4 9 5-9 5-9-5z"/><path d="m3 14 9 5 9-5"/>',
  "/staff": '<circle cx="12" cy="8.5" r="3.5"/><path d="M5 20c1-3.5 3.8-5 7-5s6 1.5 7 5"/>',
  "/staff/attendance": '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M8 3.5v3M16 3.5v3M4 10h16M8.5 14.5l2 2 4-4"/>',
  "/owner": '<rect x="7" y="3" width="10" height="18" rx="2"/><path d="M11 18h2"/>',
  "/approvals": '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  "/purchasing": '<circle cx="9" cy="19" r="1.5"/><circle cx="17" cy="19" r="1.5"/><path d="M3 4h2.5l2.2 11h10.6L20 8H6.6"/>',
  "/delivery": '<path d="M3 7h11v9H3zM14 10h4l3 3v3h-7"/><circle cx="7" cy="17.5" r="1.8"/><circle cx="17" cy="17.5" r="1.8"/>',
  "/claims": '<path d="M12 21s7-6.2 7-11.5a7 7 0 0 0-14 0C5 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
  "/family": '<circle cx="9" cy="8" r="3"/><path d="M3.5 19c.8-3 3-4.5 5.5-4.5s4.7 1.5 5.5 4.5"/><circle cx="17" cy="9" r="2.3"/><path d="M16.2 14.5c2.2.1 3.8 1.4 4.3 4"/>',
  "/messages": '<path d="M6 16v-5a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 20.5a2 2 0 0 0 4 0"/>',
  "/privacy": '<rect x="5" y="10" width="14" height="10" rx="1.5"/><path d="M8 10V7.5a4 4 0 0 1 8 0V10"/>',
  "/roles": '<circle cx="8" cy="12" r="3.5"/><path d="M11.5 12H21M18 12v3M15 12v2"/>',
  "/system-settings": '<path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/>',
  "/sysops": '<rect x="3" y="4" width="18" height="12" rx="1.5"/><path d="M8 20h8M12 16v4"/>',
  "/settings": '<path d="M4 20V10l8-6 8 6v10"/><path d="M9 20v-6h6v6"/>',
};
const FALLBACK = '<circle cx="12" cy="12" r="3"/>';

/**
 * WhatsApp Inbox badge, live on every console page: open chats with the team
 * that have unread customer messages. Plays a chime when a chat is handed to
 * the team or a customer writes in one, and shows the count in the tab title.
 */
function useWaitingChats(initial: number) {
  const [count, setCount] = useState(initial);
  useEffect(() => setCount(initial), [initial]);
  useEffect(() => {
    unlockSound();
    let last: Pulse | null = null;
    const off = subscribePulse((p) => {
      setCount(p.waiting);
      if (last) {
        const newHandOff = p.waiting > last.waiting;
        const newMessage = !!p.alert_at && (!last.alert_at || new Date(p.alert_at) > new Date(last.alert_at));
        if (newHandOff || newMessage) playChime();
      }
      last = p;
    });
    return off;
  }, []);
  useEffect(() => {
    const base = document.title.replace(/^\(\d+\+?\) /, "");
    document.title = count > 0 ? `(${count > 99 ? "99+" : count}) ${base}` : base;
  }, [count]);
  return count;
}

export function NavLinks({ groups }: { groups: NavGroup[] }) {
  const pathname = usePathname() || "";
  const initialWaiting = groups.flatMap((g) => g.items).find((i) => i.href === "/whatsapp")?.badge ?? 0;
  const waitingChats = useWaitingChats(initialWaiting);
  return (
    <nav className="lw-nav flex flex-1 gap-1 overflow-x-auto px-3 pb-3 lg:block lg:overflow-y-auto lg:overflow-x-hidden lg:py-2" aria-label="Console">
      {groups.map((group) => (
        <div key={group.section} className="contents lg:block">
          <div className="hidden px-2.5 pb-1.5 pt-4 text-[10px] font-bold uppercase tracking-[0.18em] text-[#7f8796] lg:block">
            {group.section}
          </div>
          {group.items.map((item) => {
            const active =
              pathname === item.href ||
              (pathname.startsWith(item.href + "/") && !group.items.some((o) => o.href !== item.href && o.href.startsWith(item.href + "/") && pathname.startsWith(o.href)));
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={
                  "flex shrink-0 items-center gap-2.5 whitespace-nowrap rounded-[10px] px-2.5 py-2 text-[13.5px] font-medium transition " +
                  (active
                    ? "bg-[rgba(199,181,143,0.14)] text-[#f3ecdd]"
                    : "text-[#c9c3b6] hover:bg-white/5 hover:text-white")
                }
              >
                <svg
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                  className={"h-[18px] w-[18px] shrink-0 " + (active ? "text-brass-2" : "text-[#8d93a0]")}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.6}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  dangerouslySetInnerHTML={{ __html: ICONS[item.href] || FALLBACK }}
                />
                {item.label}
                {(() => {
                  const n = item.href === "/whatsapp" ? waitingChats : item.badge ?? 0;
                  return n > 0 ? (
                    <span
                      className="ml-auto grid h-[22px] min-w-[22px] place-items-center rounded-full bg-[#1fa855] px-1.5 text-[11.5px] font-bold leading-none text-white"
                      aria-label={`${n} ${n === 1 ? "chat" : "chats"} waiting for the team`}
                      title={`${n} ${n === 1 ? "chat" : "chats"} waiting for the team`}
                    >
                      {n > 99 ? "99+" : n}
                    </span>
                  ) : null;
                })()}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
