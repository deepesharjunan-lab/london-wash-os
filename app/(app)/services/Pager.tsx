"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

export const PER_PAGE_OPTIONS = [10, 25, 50, 100];

/** Page numbers plus a "per page" dropdown. Keeps the other query parameters (search etc.). */
export function Pager({ total, page, per }: { total: number; page: number; per: number }) {
  const router = useRouter();
  const path = usePathname() || "";
  const params = useSearchParams();
  const pages = Math.max(1, Math.ceil(total / per));
  const href = (p: number, n = per) => {
    const q = new URLSearchParams(params?.toString() ?? "");
    q.set("page", String(p));
    q.set("per", String(n));
    return `${path}?${q.toString()}`;
  };
  // A short run of page numbers around the current one.
  const nums = [...new Set([1, page - 1, page, page + 1, pages].filter((n) => n >= 1 && n <= pages))].sort((a, b) => a - b);
  const from = total ? (page - 1) * per + 1 : 0;
  const to = Math.min(total, page * per);
  const btn = "grid h-8 min-w-[32px] place-items-center rounded-md border px-2 text-[13px] font-semibold";

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t-2 border-black/10 px-4 py-3 text-[13px] text-ink/60">
      <span>
        {from}–{to} of {total}
      </span>
      <nav className="flex items-center gap-1" aria-label="Pages">
        {page > 1 ? (
          <Link href={href(page - 1)} className={btn + " border-black/10 bg-white text-ink"} aria-label="Previous page">
            ‹
          </Link>
        ) : (
          <span className={btn + " border-black/5 text-ink/30"}>‹</span>
        )}
        {nums.map((n, i) => (
          <span key={n} className="flex items-center gap-1">
            {i > 0 && n - nums[i - 1] > 1 && <span className="px-1 text-ink/40">…</span>}
            <Link
              href={href(n)}
              aria-current={n === page ? "page" : undefined}
              className={btn + (n === page ? " border-navy bg-navy text-[#f8f5ef]" : " border-black/10 bg-white text-ink")}
            >
              {n}
            </Link>
          </span>
        ))}
        {page < pages ? (
          <Link href={href(page + 1)} className={btn + " border-black/10 bg-white text-ink"} aria-label="Next page">
            ›
          </Link>
        ) : (
          <span className={btn + " border-black/5 text-ink/30"}>›</span>
        )}
      </nav>
      <label className="flex items-center gap-2">
        Show
        <select value={per} onChange={(e) => router.push(href(1, Number(e.target.value)))} className="border border-black/10 px-2 py-1 text-[13px]" aria-label="Items per page">
          {PER_PAGE_OPTIONS.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
        per page
      </label>
    </div>
  );
}
