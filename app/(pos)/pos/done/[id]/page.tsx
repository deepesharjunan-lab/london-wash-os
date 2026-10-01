import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PrintPreviewButton } from "@/lib/print/PrintPreviewButton";

export const dynamic = "force-dynamic";

const rupees = (minor: number) => `₹${(minor / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const one = (x: any) => (Array.isArray(x) ? x[0] : x);

export default async function PosDonePage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data } = await supabase
    .from("order")
    .select("id, order_number, total_minor, discount_minor, created_at, customer:customer_id(id, full_name, phone)")
    .eq("id", params.id)
    .maybeSingle();
  const o = data as any;
  if (!o) notFound();
  const [{ data: items }, { data: pays }] = await Promise.all([
    supabase.from("order_item").select("id, quantity, line_total_minor, notes, service:service_id(name), item:item_id(name)").eq("order_id", o.id),
    supabase.from("payment").select("amount_minor, method, status").eq("order_id", o.id),
  ]);
  const itemIds = ((items ?? []) as any[]).map((i) => i.id);
  const { count: tags } = itemIds.length ? await supabase.from("garment").select("id", { count: "exact", head: true }).in("order_item_id", itemIds) : { count: 0 };
  const paid = ((pays ?? []) as any[]).filter((p) => p.status !== "failed" && p.status !== "refunded").reduce((a, p) => a + Number(p.amount_minor), 0);
  const due = Number(o.total_minor) - paid;
  const c = one(o.customer);
  const printBtn = "inline-flex h-12 items-center justify-center rounded-xl px-5 text-[14.5px] font-semibold";

  return (
    <div className="h-full overflow-y-auto p-5">
      <div className="mx-auto max-w-[640px] rounded-2xl bg-white p-6 shadow-sm sm:p-8">
        <div className="flex items-center gap-3">
          <span className="grid h-12 w-12 place-items-center rounded-full bg-[#e2eee7] text-[#2c6a4e]">
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="m5 12.5 4.5 4.5L19 7.5" />
            </svg>
          </span>
          <div>
            <div className="text-[12px] font-semibold uppercase tracking-[0.14em] text-ink-3">Order created</div>
            <h1 className="font-display text-[30px] font-medium leading-tight">{o.order_number}</h1>
          </div>
        </div>

        <div className="mt-5 grid gap-3 rounded-xl bg-ivory p-4 text-[14px] sm:grid-cols-3">
          <div>
            <div className="text-[11.5px] font-semibold uppercase tracking-[0.1em] text-ink-3">Customer</div>
            <b className="block">{c?.full_name ?? "—"}</b>
            <span className="text-[12.5px] text-ink-2">{c?.phone}</span>
          </div>
          <div>
            <div className="text-[11.5px] font-semibold uppercase tracking-[0.1em] text-ink-3">Total</div>
            <b className="block text-[18px]">{rupees(Number(o.total_minor))}</b>
            <span className={"text-[12.5px] " + (due > 0 ? "text-[#8a5a12]" : "text-[#2c6a4e]")}>{due > 0 ? `${rupees(due)} due at collection` : "Fully paid"}</span>
          </div>
          <div>
            <div className="text-[11.5px] font-semibold uppercase tracking-[0.1em] text-ink-3">Garment tags</div>
            <b className="block text-[18px]">{tags ?? 0}</b>
            <span className="text-[12.5px] text-ink-2">print and attach</span>
          </div>
        </div>

        <ul className="mt-4 divide-y divide-hair rounded-xl border border-hair text-[13.5px]">
          {((items ?? []) as any[]).map((i) => (
            <li key={i.id} className="flex items-start justify-between gap-3 px-4 py-2.5">
              <span className="min-w-0">
                <b>
                  {i.quantity} × {one(i.item)?.name ?? "Any item"}
                </b>{" "}
                <span className="text-ink-3">· {one(i.service)?.name}</span>
                {i.notes && <span className="block text-[12px] text-[#8a5a12]">{i.notes}</span>}
              </span>
              <span className="shrink-0 tabular-nums">{rupees(Number(i.line_total_minor))}</span>
            </li>
          ))}
        </ul>

        <div className="mt-6 grid gap-2 sm:grid-cols-2">
          <PrintPreviewButton label="Print garment tags" url={`/orders/${o.id}/print/tags`} className={printBtn + " bg-navy text-white"} />
          <PrintPreviewButton label="Print invoice" url={`/orders/${o.id}/print/invoice`} className={printBtn + " border border-hair-2 bg-white text-ink"} />
        </div>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <Link href="/pos" className={printBtn + " bg-[#c7b58f] text-[#15213a]"}>
            Next order
          </Link>
          <Link href={c?.id ? `/pos?customer=${c.id}` : "/pos"} className={printBtn + " border border-hair-2 bg-white text-ink"}>
            Another order for {c?.full_name?.split(" ")[0] ?? "this customer"}
          </Link>
        </div>
        <Link href={`/orders/${o.id}`} className="mt-4 block text-center text-[13px] font-semibold text-ink-2 hover:underline">
          Open the full order in the console
        </Link>
      </div>
    </div>
  );
}
