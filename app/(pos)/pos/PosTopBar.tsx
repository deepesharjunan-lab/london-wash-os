"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { lockPosAction } from "./lock-actions";

const TABS = [
  { href: "/pos", label: "New Order", icon: '<path d="M12 5v14M5 12h14"/>' },
  { href: "/pos/orders?view=today", label: "Today's Orders", icon: '<path d="M5.5 8h13l-1 12.2a1 1 0 0 1-1 .8H7.5a1 1 0 0 1-1-.8z"/><path d="M9 8V6.5a3 3 0 0 1 6 0V8"/>' },
  { href: "/pos/orders?view=ready", label: "Ready to Collect", icon: '<path d="m5 12.5 4.5 4.5L19 7.5"/>' },
  { href: "/pos/orders?view=pickups", label: "Pickups", icon: '<path d="M3 7h11v9H3zM14 10h4l3 3v3h-7"/><circle cx="7" cy="17.5" r="1.8"/><circle cx="17" cy="17.5" r="1.8"/>' },
];

function Icon({ d, className = "h-[18px] w-[18px]" }: { d: string; className?: string }) {
  return <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" dangerouslySetInnerHTML={{ __html: d }} />;
}

export function PosTopBar({ userName, branchName }: { userName: string; branchName: string }) {
  const path = usePathname() || "";
  const params = useSearchParams();
  const router = useRouter();
  const view = params?.get("view") ?? "";
  const [q, setQ] = useState("");
  const isActive = (href: string) => {
    const [p, query] = href.split("?");
    if (p === "/pos") return path === "/pos";
    return path === p && (query ? query === `view=${view || "today"}` : true);
  };
  const initials = userName
    .split(/[\s@]/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0])
    .join("")
    .toUpperCase();

  return (
    <header className="flex h-[64px] shrink-0 items-center gap-4 bg-[#101828] px-4 text-[#e8e2d6] sm:px-5">
      <Link href="/pos" className="flex shrink-0 items-center gap-2.5" aria-label="New order">
        <span className="grid h-9 w-9 place-items-center rounded-lg bg-[#1c2a45] font-display text-[17px] text-[#e3d2ac]">LW</span>
        <span className="hidden leading-tight lg:block">
          <b className="block text-[14px] font-bold tracking-wide text-white">Reception POS</b>
          <span className="text-[11px] text-white/50">{branchName}</span>
        </span>
      </Link>

      <nav className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto" aria-label="POS">
        {TABS.map((t) => {
          const active = isActive(t.href);
          return (
            <Link
              key={t.href}
              href={t.href}
              aria-current={active ? "page" : undefined}
              className={
                "flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-[13.5px] font-semibold transition " +
                (active ? "bg-[#e3d2ac] text-[#15213a]" : "text-white/70 hover:bg-white/10 hover:text-white")
              }
            >
              <Icon d={t.icon} />
              <span className="hidden md:inline">{t.label}</span>
            </Link>
          );
        })}
      </nav>

      <form
        className="hidden items-center lg:flex"
        onSubmit={(e) => {
          e.preventDefault();
          if (q.trim()) router.push(`/pos/orders?view=all&q=${encodeURIComponent(q.trim())}`);
        }}
        role="search"
      >
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Find order, tag or phone"
          aria-label="Find order, tag or phone"
          className="h-9 w-56 rounded-lg border border-white/10 bg-white/5 px-3 text-[13px] text-white outline-none placeholder:text-white/40 focus:border-[#c7b58f]"
        />
      </form>

      <Link href="/dashboard" className="hidden shrink-0 rounded-lg border border-white/15 px-3 py-1.5 text-[12.5px] font-semibold text-white/70 hover:bg-white/10 sm:block">
        Console
      </Link>
      <form action={lockPosAction}>
        <button type="submit" title="Lock the POS" className="flex shrink-0 items-center gap-1.5 rounded-lg border border-white/15 px-3 py-1.5 text-[12.5px] font-semibold text-white/70 hover:bg-white/10">
          <Icon d='<rect x="5" y="10.5" width="14" height="10" rx="1.5"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/>' className="h-4 w-4" />
          <span className="hidden sm:inline">Lock</span>
        </button>
      </form>
      <span className="flex shrink-0 items-center gap-2">
        <span className="grid h-9 w-9 place-items-center rounded-full bg-[#c7b58f] text-[12px] font-bold text-[#15213a]">{initials || "?"}</span>
        <span className="hidden max-w-[140px] truncate text-[12.5px] font-semibold xl:block">{userName}</span>
      </span>
    </header>
  );
}
