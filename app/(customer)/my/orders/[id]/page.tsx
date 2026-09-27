import { notFound } from "next/navigation";
import { requireMember } from "@/lib/customer/session";
import { STAGES, stageIndex } from "@/lib/customer/member";
import { inr } from "@/lib/loyalty/engine";
import { reviewAction } from "../../actions";
import { AppShell, Card, Notice, btn, input } from "../../ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Order · The London Wash Club" };

export default async function MemberOrderPage({ params, searchParams }: { params: { id: string }; searchParams: { reviewed?: string; error?: string } }) {
  const { customerId, db } = requireMember();
  // Only this customer's own order.
  const { data } = await db
    .from("order")
    .select("id, order_number, status, subtotal_minor, discount_minor, loyalty_redeemed_minor, tax_minor, total_minor, created_at, updated_at")
    .eq("id", params.id)
    .eq("customer_id", customerId)
    .maybeSingle();
  const o = data as {
    id: string;
    order_number: string;
    status: string;
    subtotal_minor: number;
    discount_minor: number;
    loyalty_redeemed_minor: number;
    tax_minor: number;
    total_minor: number;
    created_at: string;
    updated_at: string;
  } | null;
  if (!o) notFound();

  const [itemsRes, loyaltyRes, reviewRes, paysRes] = await Promise.all([
    db.from("order_item").select("id, quantity, line_total_minor, service:service_id(name), item:item_id(name)").eq("order_id", o.id),
    db.from("loyalty_transaction").select("status, points, pending_points, description").eq("order_id", o.id).eq("customer_id", customerId).order("created_at"),
    db.from("order_review").select("stars, created_at").eq("order_id", o.id).maybeSingle(),
    db.from("payment").select("amount_minor, status").eq("order_id", o.id),
  ]);
  type Named = { name: string } | { name: string }[] | null;
  const nm = (x: Named) => (Array.isArray(x) ? x[0]?.name : x?.name) ?? "";
  const items = (itemsRes.data ?? []) as unknown as { id: string; quantity: number; line_total_minor: number; service: Named; item: Named }[];
  const loyalty = (loyaltyRes.data ?? []) as { status: string; points: number; pending_points: number; description: string | null }[];
  const review = reviewRes.data as { stars: number; created_at: string } | null;
  const paid = ((paysRes.data ?? []) as { amount_minor: number; status: string }[]).filter((p) => p.status === "captured").reduce((a, p) => a + Number(p.amount_minor), 0);
  const idx = stageIndex(o.status);
  const cancelled = o.status === "cancelled";

  return (
    <AppShell current="/my/orders" title={o.order_number} back="/my/orders">
      {searchParams.reviewed !== undefined && (
        <Notice tone="ok">Thank you for your review.{Number(searchParams.reviewed) > 0 ? ` ${searchParams.reviewed} points added.` : ""}</Notice>
      )}
      {searchParams.error && <Notice tone="danger">{searchParams.error}</Notice>}

      <Card className="p-4">
        {cancelled ? (
          <p className="font-semibold">This order was cancelled.</p>
        ) : (
          <ol className="flex flex-col">
            {STAGES.map((s, k) => {
              const state = k < idx ? "done" : k === idx ? "cur" : "todo";
              return (
                <li key={s.status} className="grid grid-cols-[24px_1fr] gap-3" aria-current={state === "cur" ? "step" : undefined}>
                  <span className="flex flex-col items-center">
                    <span
                      className={
                        "mt-0.5 h-4 w-4 rounded-full border-2 " +
                        (state === "done" ? "border-ink bg-ink" : state === "cur" ? "border-brass bg-brass shadow-[0_0_0_5px_rgba(154,131,88,.2)]" : "border-hair-2 bg-ivory")
                      }
                    />
                    {k < STAGES.length - 1 && <span className={"my-1 min-h-[22px] w-0.5 flex-1 " + (k < idx ? "bg-ink" : "bg-hair-2")} />}
                  </span>
                  <span className="pb-4">
                    <b className={"block text-[14px] " + (state === "todo" ? "font-medium text-ink-3" : "")}>{s.label}</b>
                    {state === "cur" && <span className="text-[12.5px] text-ink-2">{s.note}</span>}
                  </span>
                </li>
              );
            })}
          </ol>
        )}
      </Card>

      <section className="flex flex-col gap-2.5">
        <h2 className="text-[15px] font-semibold">Items</h2>
        <Card>
          <ul className="divide-y divide-hair">
            {items.map((it) => (
              <li key={it.id} className="flex justify-between gap-3 px-4 py-2.5 text-[13.5px]">
                <span>
                  {nm(it.item) || nm(it.service)} <span className="text-ink-3">· {nm(it.service)}</span> × {it.quantity}
                </span>
                <span className="tabular-nums">{inr(Number(it.line_total_minor))}</span>
              </li>
            ))}
          </ul>
          <div className="space-y-1 border-t border-hair px-4 py-3 text-[14px]">
            <div className="flex justify-between text-ink-2"><span>Items</span><span className="tabular-nums">{inr(Number(o.subtotal_minor))}</span></div>
            {Number(o.discount_minor) > 0 && (
              <div className="flex justify-between text-ink-2">
                <span>Discount{Number(o.loyalty_redeemed_minor) > 0 ? " (incl. points)" : ""}</span>
                <span className="tabular-nums">−{inr(Number(o.discount_minor))}</span>
              </div>
            )}
            <div className="flex justify-between border-t border-hair pt-2 font-bold"><span>Total</span><span className="tabular-nums">{inr(Number(o.total_minor))}</span></div>
            {paid > 0 && <div className="flex justify-between text-[12.5px] text-ink-3"><span>Paid</span><span className="tabular-nums">{inr(paid)}</span></div>}
          </div>
        </Card>
      </section>

      {loyalty.length > 0 && (
        <section className="flex flex-col gap-2.5">
          <h2 className="text-[15px] font-semibold">Points for this order</h2>
          <Card>
            <ul className="divide-y divide-hair">
              {loyalty.map((l, i) => {
                const p = Number(l.points) || Number(l.pending_points);
                return (
                  <li key={i} className="flex justify-between gap-3 px-4 py-2.5 text-[13.5px]">
                    <span>
                      {l.description}
                      <span className="ml-1.5 text-[11px] uppercase tracking-wide text-ink-3">{l.status}</span>
                    </span>
                    <b className={"tabular-nums " + (p >= 0 ? "text-[#2c6a4e]" : "text-[#9c3326]")}>
                      {p >= 0 ? "+" : "−"}
                      {Math.abs(p).toLocaleString("en-IN", { maximumFractionDigits: 1 })}
                    </b>
                  </li>
                );
              })}
            </ul>
          </Card>
        </section>
      )}

      {o.status === "delivered" &&
        (review ? (
          <Notice tone="ok">You rated this order {review.stars} out of 5. Thank you.</Notice>
        ) : (
          <Card className="p-4">
            <form action={reviewAction} className="flex flex-col gap-3">
              <input type="hidden" name="order_id" value={o.id} />
              <h2 className="font-display text-[22px] font-medium leading-tight">How was your London Wash experience?</h2>
              <fieldset className="flex gap-2" aria-label="Rating">
                {[5, 4, 3, 2, 1].map((s) => (
                  <label key={s} className="flex cursor-pointer items-center gap-1 rounded-full border border-hair-2 px-3 py-2 text-[14px] has-[:checked]:border-navy has-[:checked]:bg-navy has-[:checked]:text-[#f8f5ef]">
                    <input type="radio" name="stars" value={s} defaultChecked={s === 5} className="sr-only" />
                    {s}★
                  </label>
                ))}
              </fieldset>
              <label className="flex flex-col gap-1.5">
                <span className="text-[12.5px] font-semibold text-ink-2">Tell us more (optional)</span>
                <textarea name="body" className={input + " min-h-[90px] py-3"} maxLength={1000} placeholder="What did we do well? What could be better?" />
              </label>
              <button type="submit" className={btn}>Submit review</button>
            </form>
          </Card>
        ))}
    </AppShell>
  );
}
