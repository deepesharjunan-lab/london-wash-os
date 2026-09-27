import { redirect } from "next/navigation";
import { requireMember } from "@/lib/customer/session";
import { loadMember } from "@/lib/customer/member";
import { inr, mult, pts, pointsValueMinor } from "@/lib/loyalty/engine";
import { AppShell, Card, Notice, fmtDate } from "../ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "My points · The London Wash Club" };

const LABEL: Record<string, string> = { pending: "Pending", earned: "Earned", redeemed: "Redeemed", expired: "Expired", reversed: "Reversed", cancelled: "Cancelled" };

export default async function MemberPointsPage({ searchParams }: { searchParams: { show?: string } }) {
  const { customerId, db } = requireMember();
  const m = await loadMember(db, customerId, { ledger: true });
  if (!m) redirect("/my/login");
  const w = m.wallet;
  const filter = searchParams.show ?? "all";
  const rows = m.rows
    .slice()
    .reverse()
    .filter((r) => filter === "all" || r.status === filter);
  const orderIds = Array.from(new Set(m.rows.map((r) => r.order_id).filter(Boolean))) as string[];
  const { data: orders } = orderIds.length
    ? await db.from("order").select("id, order_number").eq("customer_id", customerId).in("id", orderIds)
    : { data: [] };
  const orderNo = new Map<string, string>(((orders ?? []) as { id: string; order_number: string }[]).map((o) => [o.id, o.order_number] as [string, string]));
  const chips: [string, string][] = [["all", "All"], ["earned", "Earned"], ["pending", "Pending"], ["redeemed", "Redeemed"], ["expired", "Expired"], ["reversed", "Reversed"]];

  return (
    <AppShell current="/my/membership" title="My points" back="/my">
      <div className="py-2 text-center">
        <div className="font-display text-[52px] font-medium leading-none tabular-nums">{pts(m.cfg, w?.available ?? 0)}</div>
        <div className="mt-1.5 text-[12px] font-semibold uppercase tracking-[0.18em] text-ink-2">Points available</div>
        <p className="mt-2 text-[13.5px] text-ink-2">Worth about {inr(pointsValueMinor(m.cfg, w?.available ?? 0))} on your next order</p>
      </div>

      <div className="grid grid-cols-3 gap-px overflow-hidden rounded-[14px] border border-hair bg-hair text-center">
        {[
          ["Pending", w?.pending ?? 0],
          ["Lifetime", w?.lifetime ?? 0],
          ["Redeemed", w?.redeemed ?? 0],
        ].map(([k, v]) => (
          <div key={String(k)} className="bg-white px-2 py-3">
            <div className="text-[16px] font-bold tabular-nums">{pts(m.cfg, Number(v))}</div>
            <div className="text-[11px] text-ink-2">{k}</div>
          </div>
        ))}
      </div>

      {w && w.expiringSoon > 0 && w.nextExpiry ? (
        <Notice tone="warn">
          <b>{pts(m.cfg, w.expiringSoon)} points</b> expire from {fmtDate(w.nextExpiry)}.
        </Notice>
      ) : null}
      {w && w.expired > 0 && <p className="text-[12.5px] text-ink-3">{pts(m.cfg, w.expired)} points have expired so far.</p>}

      <Notice tone="info">
        You earn 1 point per {inr(m.cfg.spend_per_point_minor)}, and {m.tier.name} members earn {mult(m.tier.points_multiplier)}. Order points are pending until the order is delivered, and they expire{" "}
        {m.cfg.points_expiry_months} months after you earn them.
      </Notice>

      <nav className="-mx-5 flex gap-2 overflow-x-auto px-5" aria-label="Filter history">
        {chips.map(([k, l]) => (
          <a
            key={k}
            href={k === "all" ? "/my/points" : `/my/points?show=${k}`}
            aria-current={filter === k ? "page" : undefined}
            className={"whitespace-nowrap rounded-full border px-3.5 py-2 text-[13px] font-semibold " + (filter === k ? "border-navy bg-navy text-[#f8f5ef]" : "border-hair-2 bg-white text-ink-2")}
          >
            {l}
          </a>
        ))}
      </nav>

      {rows.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-10 text-center">
          <h3 className="font-display text-[21px] font-medium">Nothing here yet</h3>
          <p className="max-w-[32ch] text-[14px] text-ink-2">Your points history appears here after your first order.</p>
        </div>
      ) : (
        <Card>
          <ul className="divide-y divide-hair">
            {rows.map((r) => {
              const p = Number(r.points) || Number(r.pending_points);
              return (
                <li key={r.id}>
                  <details>
                    <summary className="flex cursor-pointer list-none items-start gap-3 px-4 py-3.5">
                      <span className="min-w-0 flex-1">
                        <b className="block text-[14px] font-semibold leading-snug">{r.description}</b>
                        <span className="text-[12.5px] text-ink-2">
                          {fmtDate(r.created_at)}
                          {r.order_id && orderNo.get(r.order_id) ? ` · Order ${orderNo.get(r.order_id)}` : ""} · {LABEL[r.status] ?? r.status}
                        </span>
                      </span>
                      <span className={"whitespace-nowrap text-right font-bold tabular-nums " + (r.status === "pending" ? "text-ink-3" : p > 0 ? "text-[#2c6a4e]" : p < 0 ? "text-[#9c3326]" : "text-ink-3")}>
                        {p > 0 ? "+" : p < 0 ? "−" : ""}
                        {pts(m.cfg, Math.abs(p))}
                        <span className="block text-[11px] font-normal text-ink-3">Balance {pts(m.cfg, Number(r.balance_after))}</span>
                      </span>
                    </summary>
                    <div className="mx-4 mb-3.5 space-y-1.5 rounded-xl bg-beige px-3.5 py-3 text-[12.5px]">
                      {r.breakdown && r.breakdown.length > 0 ? (
                        r.breakdown.map((l, i) => (
                          <div key={i} className="flex justify-between gap-3">
                            <span>{l.label}</span>
                            <b className="tabular-nums">
                              {l.points >= 0 ? "+" : "−"}
                              {pts(m.cfg, Math.abs(l.points))}
                            </b>
                          </div>
                        ))
                      ) : (
                        <div>{r.description}</div>
                      )}
                      {r.expires_at && <div className="text-ink-2">Expires {fmtDate(r.expires_at)}</div>}
                    </div>
                  </details>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </AppShell>
  );
}
