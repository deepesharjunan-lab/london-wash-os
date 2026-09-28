import Link from "next/link";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/staff/session";
import { normaliseTag } from "@/lib/staff/flow";
import { fmtDateTime, istDate, istDayStart } from "@/lib/time";
import { Card, Chip, STATUS_LABEL, StaffShell, input, unreadCount } from "../ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Orders · London Wash Staff" };

const VIEWS = [
  { key: "today", label: "Today" },
  { key: "active", label: "Active" },
  { key: "ready", label: "Ready" },
] as const;

const TONE: Record<string, "plain" | "ok" | "warn" | "info" | "danger" | "brass"> = {
  draft: "brass",
  confirmed: "info",
  in_production: "warn",
  ready: "ok",
  out_for_delivery: "info",
  delivered: "plain",
  cancelled: "danger",
};

export default async function StaffOrdersPage({ searchParams }: { searchParams: { view?: string; q?: string } }) {
  const { me, db } = await requireStaff();
  if (me.app_role === "driver") redirect("/work/runs");
  const view = VIEWS.find((v) => v.key === searchParams.view)?.key ?? "today";
  const q = String(searchParams.q ?? "").trim().slice(0, 40);
  const unread = await unreadCount(db, me.id);

  // A tag number jumps straight to its order.
  if (q && /^\d+$/.test(q)) {
    const { data: g } = await db.from("garment").select("order_item:order_item_id(order_id)").eq("tag_code", normaliseTag(q)).maybeSingle();
    const oi = (g as any)?.order_item;
    const orderId = (Array.isArray(oi) ? oi[0] : oi)?.order_id;
    if (orderId) redirect(`/work/orders/${orderId}`);
  }

  let query = db
    .from("order")
    .select("id, order_number, status, created_at, customer:customer_id(full_name), items:order_item(quantity)")
    .eq("branch_id", me.branch_id)
    .order("created_at", { ascending: false })
    .limit(60);
  if (q) query = query.ilike("order_number", `%${q}%`);
  else if (view === "today") query = query.gte("created_at", istDayStart(istDate()));
  else if (view === "active") query = query.in("status", ["draft", "confirmed", "in_production"]);
  else query = query.eq("status", "ready");
  const { data } = await query;
  const orders = (data ?? []) as any[];

  return (
    <StaffShell role={me.app_role} current="/work/orders" title="Orders" unread={unread}>
      <form className="flex gap-2" role="search">
        <input name="q" defaultValue={q} placeholder="Order number or tag" aria-label="Search orders" className={input} />
        <button type="submit" className="min-h-[48px] shrink-0 rounded-xl bg-navy px-4 text-[14px] font-semibold text-[#f8f5ef]">
          Find
        </button>
      </form>
      {!q && (
        <div className="grid grid-cols-3 gap-1 rounded-full bg-beige p-1">
          {VIEWS.map((v) => (
            <Link
              key={v.key}
              href={`/work/orders?view=${v.key}`}
              aria-current={view === v.key ? "page" : undefined}
              className={"grid min-h-[40px] place-items-center rounded-full text-[13px] font-semibold " + (view === v.key ? "bg-white text-ink shadow-sm" : "text-ink-2")}
            >
              {v.label}
            </Link>
          ))}
        </div>
      )}
      {orders.length ? (
        <Card>
          <ul className="divide-y divide-hair">
            {orders.map((o) => {
              const c = Array.isArray(o.customer) ? o.customer[0] : o.customer;
              const pcs = (o.items ?? []).reduce((a: number, i: any) => a + Number(i.quantity || 0), 0);
              return (
                <li key={o.id}>
                  <Link href={`/work/orders/${o.id}`} className="flex items-center gap-3 px-4 py-3">
                    <span className="min-w-0 flex-1">
                      <b className="block text-[14.5px]">{o.order_number}</b>
                      <span className="block truncate text-[12.5px] text-ink-2">
                        {c?.full_name ?? "Customer"} · {pcs} pcs · {fmtDateTime(o.created_at)}
                      </span>
                    </span>
                    <Chip tone={TONE[o.status] ?? "plain"}>{STATUS_LABEL[o.status] ?? o.status}</Chip>
                  </Link>
                </li>
              );
            })}
          </ul>
        </Card>
      ) : (
        <Card className="px-4 py-10 text-center text-[14px] text-ink-2">{q ? "No orders match." : "No orders here right now."}</Card>
      )}
    </StaffShell>
  );
}
