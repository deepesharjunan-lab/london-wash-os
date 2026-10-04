import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { orderIdFromCode } from "@/lib/engage/invoice-link";
import { ORG_EMAIL, ORG_NAME } from "@/lib/print/branding";
import { PrintButton } from "./print-button";

// Private online invoice, opened from the WhatsApp message after an order
// (club.thelondonwash.com/i/<code>). No sign-in: the signed code in the link is
// the key (lib/engage/invoice-link.ts). Shows the order as it is right now.

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Your invoice · The London Wash", robots: { index: false, follow: false } };

const STATUS: Record<string, string> = {
  draft: "Draft",
  confirmed: "Received",
  in_production: "Being cleaned",
  ready: "Ready",
  out_for_delivery: "Out for delivery",
  delivered: "Delivered",
  cancelled: "Cancelled",
};
const rupees = (minor: number) => "₹" + (minor / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? v[0] ?? null : v ?? null);

export default async function OnlineInvoicePage({ params }: { params: { code: string } }) {
  const orderId = orderIdFromCode(params.code);
  if (!orderId) notFound();
  const db = createAdminClient();
  const [{ data: order }, { data: items }, { data: payments }] = await Promise.all([
    db
      .from("order")
      .select(
        "id, order_number, status, created_at, subtotal_minor, discount_minor, tax_minor, total_minor, extra_charges, discount_note, customer:customer_id(full_name, phone), branch:branch_id(name, address, city, state, phone)"
      )
      .eq("id", orderId)
      .maybeSingle(),
    db.from("order_item").select("id, quantity, unit_price_minor, line_total_minor, notes, service:service_id(name), item:item_id(name)").eq("order_id", orderId).order("created_at"),
    db.from("payment").select("amount_minor, status, method, created_at").eq("order_id", orderId),
  ]);
  if (!order) notFound();
  const o = order as any;
  const customer = one<any>(o.customer);
  const branch = one<any>(o.branch);
  const paid = ((payments ?? []) as any[]).filter((p) => p.status !== "failed" && p.status !== "refunded").reduce((a, p) => a + Number(p.amount_minor), 0);
  const balance = Math.max(0, Number(o.total_minor) - paid);
  const qty = ((items ?? []) as any[]).reduce((a, it) => a + Number(it.quantity), 0);
  const created = new Date(o.created_at).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });
  const address = [branch?.address, branch?.city, branch?.state].filter(Boolean).join(", ");

  return (
    <main className="min-h-screen bg-ivory px-4 py-6 font-archivo text-ink print:bg-white print:p-0">
      <style>{`@media print { .no-print { display: none !important; } }`}</style>
      <div className="mx-auto max-w-[560px]">
        <div className="mb-4 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/logo-full.png" alt={`${ORG_NAME}, the art of laundry`} className="mx-auto h-auto w-[210px]" />
        </div>

        <section className="overflow-hidden rounded-lg2 border border-hair bg-white shadow-sm print:border-0 print:shadow-none">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-hair px-5 py-4">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-3">Invoice</div>
              <div className="font-display text-[26px] leading-tight">{o.order_number}</div>
              <div className="text-[13px] text-ink-2">{created}</div>
            </div>
            <div className="text-right">
              <span className="inline-block rounded-full bg-beige px-3 py-1 text-[12.5px] font-semibold text-navy">{STATUS[o.status] ?? o.status}</span>
              <div className="mt-2 text-[13px] text-ink-2">{customer?.full_name}</div>
            </div>
          </div>

          <table className="w-full text-[14px]">
            <tbody>
              {((items ?? []) as any[]).map((it) => {
                const item = one<any>(it.item);
                const service = one<any>(it.service);
                return (
                  <tr key={it.id} className="border-b border-hair/70 align-top">
                    <td className="px-5 py-2.5">
                      <div className="font-medium">{item?.name ?? service?.name ?? "Item"}</div>
                      <div className="text-[12.5px] text-ink-3">
                        {item?.name && service?.name ? `${service.name} · ` : ""}
                        {it.quantity} × {rupees(Number(it.unit_price_minor))}
                      </div>
                      {it.notes && <div className="text-[12px] italic text-ink-3">{it.notes}</div>}
                    </td>
                    <td className="whitespace-nowrap px-5 py-2.5 text-right font-medium">{rupees(Number(it.line_total_minor))}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <div className="space-y-1 px-5 py-4 text-[14px]">
            <Row label={`Subtotal (${qty} ${qty === 1 ? "piece" : "pieces"})`} value={rupees(Number(o.subtotal_minor))} />
            {Number(o.discount_minor) > 0 && <Row label={o.discount_note ? `Discount (${o.discount_note})` : "Discount"} value={"−" + rupees(Number(o.discount_minor))} />}
            {((o.extra_charges ?? []) as { label: string; amount_minor: number }[]).map((c, i) => (
              <Row key={i} label={c.label} value={rupees(Number(c.amount_minor))} />
            ))}
            {Number(o.tax_minor) > 0 && <Row label="Tax" value={rupees(Number(o.tax_minor))} />}
            <div className="!mt-2 flex justify-between border-t border-hair pt-2 text-[17px] font-bold">
              <span>Total</span>
              <span>{rupees(Number(o.total_minor))}</span>
            </div>
            {paid > 0 && <Row label="Paid" value={rupees(paid)} />}
            {balance > 0 ? (
              <div className="flex justify-between rounded-md bg-[#fdf0dc] px-3 py-2 font-semibold text-[#8a5a12]">
                <span>Balance due</span>
                <span>{rupees(balance)}</span>
              </div>
            ) : (
              <div className="rounded-md bg-[#e2eee7] px-3 py-2 text-center font-semibold text-[#2c6a4e]">Paid in full. Thank you!</div>
            )}
          </div>
        </section>

        <div className="no-print mt-4 grid grid-cols-2 gap-2 text-center text-[14px] font-semibold">
          <a href="/my/orders" className="rounded-md bg-navy px-4 py-3 text-white">
            Track my order
          </a>
          <PrintButton />
        </div>

        <p className="mt-5 text-center text-[12.5px] leading-relaxed text-ink-3">
          {ORG_NAME}
          {address ? ` · ${address}` : ""}
          <br />
          {branch?.phone ? `${branch.phone} · ` : ""}
          {ORG_EMAIL}
        </p>
      </div>
    </main>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-ink-2">
      <span>{label}</span>
      <span className="text-ink">{value}</span>
    </div>
  );
}
