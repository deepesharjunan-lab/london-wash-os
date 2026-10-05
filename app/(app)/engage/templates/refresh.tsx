"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

// Asks Meta again for every template's status and updates the table in place
// (no full page reload; the server re-reads both WhatsApp accounts live).
export function RefreshStatus({ checkedAt }: { checkedAt: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const time = new Date(checkedAt).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", second: "2-digit", timeZone: "Asia/Kolkata" });
  return (
    <div className="flex items-center gap-2">
      <span className="hidden text-[12px] text-ink/45 sm:inline">{pending ? "Checking with Meta…" : `Checked with Meta at ${time}`}</span>
      <button
        type="button"
        onClick={() => start(() => router.refresh())}
        disabled={pending}
        className="flex items-center gap-1.5 rounded-md border border-black/10 bg-white px-3 py-2 text-sm font-medium text-ink hover:border-navy/40 disabled:opacity-60"
        title="Check the latest approval status with Meta"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true" className={"h-4 w-4 " + (pending ? "animate-spin" : "")} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 11a8 8 0 0 0-14.9-3.5M4 4v4h4M4 13a8 8 0 0 0 14.9 3.5M20 20v-4h-4" />
        </svg>
        {pending ? "Refreshing…" : "Refresh status"}
      </button>
    </div>
  );
}
