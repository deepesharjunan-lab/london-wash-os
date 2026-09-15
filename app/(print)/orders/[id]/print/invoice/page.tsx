import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { LOGO_DATA_URI, ORG_EMAIL, ORG_NAME } from "@/lib/print/branding";

const TERMS = [
  "Delivery: 2-4 working days (express charges extra).",
  "Check garments at delivery; report issues within 24 hours.",
  "We are not responsible for valuables left in pockets.",
  "Fabric damage, colour bleeding, or shrinkage are beyond our control.",
  "Liability, if any, is limited to service value only.",
];

function formatMoney(minor: number) {
  return (minor / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDateTime(iso: string) {
  const d = new Date(iso);
  return `${d.toLocaleDateString("en-GB")} ${d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`;
}

function formatDate(d: Date) {
  return d.toLocaleDateString("en-GB");
}

export default async function OrderInvoicePrintPage({ params }: { params: { id: string } }) {
  const supabase = createClient();

  const { data: order } = await supabase
    .from("order")
    .select(
      "id, order_number, created_at, subtotal_minor, discount_minor, tax_minor, total_minor, customer:customer_id(full_name, phone), branch:branch_id(name, address, city, state, phone), placed_by:placed_by_user_id(full_name)"
    )
    .eq("id", params.id)
    .single();

  if (!order) notFound();

  const customer: any = Array.isArray(order.customer) ? order.customer[0] : order.customer;
  const branch: any = Array.isArray(order.branch) ? order.branch[0] : order.branch;
  const placedBy: any = Array.isArray(order.placed_by) ? order.placed_by[0] : order.placed_by;

  const { data: items } = await supabase
    .from("order_item")
    .select("id, quantity, unit_price_minor, line_total_minor, service:service_id(name), item:item_id(name)")
    .eq("order_id", params.id)
    .order("created_at", { ascending: true });

  const { data: payments } = await supabase
    .from("payment")
    .select("amount_minor, status")
    .eq("order_id", params.id);

  const paidMinor = (payments || [])
    .filter((p: any) => p.status !== "failed" && p.status !== "refunded")
    .reduce((sum: number, p: any) => sum + Number(p.amount_minor), 0);
  const balanceMinor = Number(order.total_minor) - paidMinor;

  const totalQty = (items || []).reduce((sum: number, it: any) => sum + Number(it.quantity), 0);
  const estDelivery = new Date(new Date(order.created_at as string).getTime() + 3 * 24 * 60 * 60 * 1000);

  const branchAddressLine = [branch?.address, branch?.city, branch?.state].filter(Boolean).join(", ");

  return (
    <>
      <style>{`
        @page { size: 80mm auto; margin: 2mm; }
        html, body { margin: 0; padding: 0; background: #fff; }
        * { box-sizing: border-box; }
        .inv {
          width: 76mm;
          margin: 0 auto;
          font-family: "Courier New", ui-monospace, monospace;
          font-size: 8.5pt;
          line-height: 1.35;
          color: #000;
        }
        .inv-center { text-align: center; }
        .inv-logo { max-width: 32mm; display: block; margin: 0 auto 1mm; }
        .inv-org { font-size: 11pt; font-weight: 800; }
        .inv-small { font-size: 7.5pt; }
        .inv-dashed { border-top: 1px dashed #000; margin: 1.5mm 0; }
        .inv-row { display: flex; justify-content: space-between; gap: 4px; }
        .inv-bold { font-weight: 700; }
        table.inv-items { width: 100%; border-collapse: collapse; margin-top: 1mm; }
        table.inv-items td { padding: 0.5mm 0; vertical-align: top; }
        .inv-item-name { font-weight: 700; }
        .inv-item-meta { font-size: 7.5pt; }
        .inv-totals .inv-row { padding: 0.3mm 0; }
        .inv-grand { font-size: 10.5pt; font-weight: 800; }
        .inv-terms { font-size: 6.8pt; }
        .inv-terms ol { margin: 1mm 0 0; padding-left: 3.5mm; }
        .inv-terms li { margin-bottom: 0.5mm; }
        .inv-sign { margin-top: 4mm; font-size: 7.5pt; }
        .inv-thanks { margin-top: 3mm; font-size: 8pt; font-weight: 700; }
        @media screen {
          body { background: #e5e5e5; padding: 16px 0; }
          .inv { background: #fff; padding: 4mm; box-shadow: 0 0 0 1px #ccc; }
        }
      `}</style>

      <div className="inv">
        <div className="inv-center">
          <img src={LOGO_DATA_URI} alt={ORG_NAME} className="inv-logo" />
          <div className="inv-org">{ORG_NAME}</div>
          {branchAddressLine && <div className="inv-small">{branchAddressLine}</div>}
          {branch?.phone && <div className="inv-small">Mobile: {branch.phone}</div>}
          <div className="inv-small">Email: {ORG_EMAIL}</div>
        </div>

        <div className="inv-dashed" />

        <div className="inv-row">
          <span className="inv-bold">Invoice No:</span>
          <span className="inv-bold">{order.order_number}</span>
        </div>
        <div className="inv-row">
          <span>Created:</span>
          <span>{formatDateTime(order.created_at as string)}</span>
        </div>
        <div className="inv-row">
          <span>Expected delivery:</span>
          <span>{formatDate(estDelivery)}</span>
        </div>

        <div className="inv-dashed" />

        <div>Customer: {customer?.full_name || "-"}</div>
        {customer?.phone && <div>Mobile: {customer.phone}</div>}
        {placedBy?.full_name && <div className="inv-small">Created by: {placedBy.full_name}</div>}

        <div className="inv-dashed" />

        <table className="inv-items">
          <tbody>
            {(items || []).map((it: any) => {
              const service = Array.isArray(it.service) ? it.service[0] : it.service;
              const item = Array.isArray(it.item) ? it.item[0] : it.item;
              const label = item?.name
                ? `${item.name} (${service?.name || "-"})`
                : service?.name || "Item";
              return (
                <tr key={it.id}>
                  <td>
                    <div className="inv-item-name">{label}</div>
                    <div className="inv-item-meta">
                      {it.quantity} x ₹{formatMoney(Number(it.unit_price_minor))}
                    </div>
                  </td>
                  <td style={{ textAlign: "right", whiteSpace: "nowrap" }} className="inv-bold">
                    ₹{formatMoney(Number(it.line_total_minor))}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <div className="inv-dashed" />

        <div className="inv-totals">
          <div className="inv-row">
            <span>Total Qty</span>
            <span>{totalQty}</span>
          </div>
          <div className="inv-row">
            <span>Subtotal</span>
            <span>₹{formatMoney(Number(order.subtotal_minor))}</span>
          </div>
          {Number(order.discount_minor) > 0 && (
            <div className="inv-row">
              <span>Discount</span>
              <span>-₹{formatMoney(Number(order.discount_minor))}</span>
            </div>
          )}
          {Number(order.tax_minor) > 0 && (
            <div className="inv-row">
              <span>Tax</span>
              <span>₹{formatMoney(Number(order.tax_minor))}</span>
            </div>
          )}
          <div className="inv-dashed" />
          <div className="inv-row inv-grand">
            <span>Total Payable</span>
            <span>₹{formatMoney(Number(order.total_minor))}</span>
          </div>
          {balanceMinor > 0 ? (
            <div className="inv-row inv-bold">
              <span>Balance Due</span>
              <span>₹{formatMoney(balanceMinor)}</span>
            </div>
          ) : (
            <div className="inv-row inv-bold">
              <span>Status</span>
              <span>PAID IN FULL</span>
            </div>
          )}
        </div>

        <div className="inv-dashed" />

        <div className="inv-terms">
          <div className="inv-bold inv-center">Terms &amp; Condition</div>
          <ol>
            {TERMS.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ol>
        </div>

        <div className="inv-sign">Customer Sign: ____________________</div>

        <div className="inv-thanks inv-center">Thank you for choosing {ORG_NAME}!</div>
      </div>
    </>
  );
}
