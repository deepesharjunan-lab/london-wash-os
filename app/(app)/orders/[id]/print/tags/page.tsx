import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Barcode } from "@/lib/print/code128";
import { ORG_NAME } from "@/lib/print/branding";
import { PrintOnLoad } from "../PrintOnLoad";

// One 50mm x 30mm label per physical garment, sized for the TSC TE244.
const LABEL_WIDTH_MM = 50;
const LABEL_HEIGHT_MM = 30;

function formatTagDate(iso: string) {
  const d = new Date(iso);
  const weekday = d.toLocaleDateString("en-US", { weekday: "short" });
  const month = d.toLocaleDateString("en-US", { month: "short" });
  return `${weekday} ${d.getDate()} ${month} ${d.getFullYear()}`;
}

export default async function OrderTagsPrintPage({ params }: { params: { id: string } }) {
  const supabase = createClient();

  const { data: order } = await supabase
    .from("order")
    .select("id, order_number, created_at, customer:customer_id(full_name)")
    .eq("id", params.id)
    .single();

  if (!order) notFound();

  const customer: any = Array.isArray(order.customer) ? order.customer[0] : order.customer;

  const { data: items } = await supabase
    .from("order_item")
    .select("id, quantity, service:service_id(name), item:item_id(name)")
    .eq("order_id", params.id)
    .order("created_at", { ascending: true });

  const itemIds = (items || []).map((i: any) => i.id);

  const { data: garments } = itemIds.length
    ? await supabase
        .from("garment")
        .select("id, tag_code, order_item_id, created_at")
        .in("order_item_id", itemIds)
        .order("created_at", { ascending: true })
    : { data: [] as any[] };

  const garmentsByItem = new Map<string, any[]>();
  (garments || []).forEach((g: any) => {
    const list = garmentsByItem.get(g.order_item_id) || [];
    list.push(g);
    garmentsByItem.set(g.order_item_id, list);
  });

  const tags: {
    id: string;
    tagCode: string;
    itemName: string;
    serviceName: string;
    piece: number;
    total: number;
  }[] = [];

  (items || []).forEach((it: any) => {
    const service = Array.isArray(it.service) ? it.service[0] : it.service;
    const item = Array.isArray(it.item) ? it.item[0] : it.item;
    const list = garmentsByItem.get(it.id) || [];
    list.forEach((g: any, idx: number) => {
      tags.push({
        id: g.id,
        tagCode: g.tag_code || g.id.slice(0, 8),
        itemName: item?.name || service?.name || "Item",
        serviceName: service?.name || "-",
        piece: idx + 1,
        total: list.length || it.quantity,
      });
    });
  });

  const dateLabel = formatTagDate(order.created_at as string);

  return (
    <>
      <PrintOnLoad />
      <style>{`
        @page { size: ${LABEL_WIDTH_MM}mm ${LABEL_HEIGHT_MM}mm; margin: 0; }
        html, body { margin: 0; padding: 0; background: #fff; }
        * { box-sizing: border-box; }
        .tag-page {
          width: ${LABEL_WIDTH_MM}mm;
          height: ${LABEL_HEIGHT_MM}mm;
          padding: 1.5mm 2mm;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          text-align: center;
          font-family: Arial, Helvetica, sans-serif;
          page-break-after: always;
          overflow: hidden;
        }
        .tag-page:last-child { page-break-after: auto; }
        .tag-item { font-size: 10.5pt; font-weight: 800; line-height: 1.15; }
        .tag-service { font-size: 8pt; font-weight: 700; margin-top: 0.5mm; }
        .tag-order { font-size: 8.5pt; font-weight: 800; margin-top: 0.5mm; }
        .tag-org { font-size: 8.5pt; font-weight: 800; margin-top: 0.8mm; }
        .tag-code { font-size: 8pt; font-weight: 700; margin-top: 0.5mm; }
        .tag-date { font-size: 7pt; margin-top: 0.3mm; }
        .tag-divider { font-size: 8pt; letter-spacing: 1px; margin: 0.8mm 0 0.6mm; }
        @media screen {
          body { background: #e5e5e5; padding: 10px; }
          .tag-page {
            background: #fff;
            border: 1px solid #ccc;
            margin: 0 0 10px;
            page-break-after: auto;
          }
        }
      `}</style>

      {tags.length === 0 ? (
        <div className="tag-page">
          <div className="tag-item">No garment tags</div>
          <div className="tag-service">This order has none registered.</div>
        </div>
      ) : (
        tags.map((t) => (
          <div className="tag-page" key={t.id}>
            <div className="tag-item">{t.itemName}</div>
            <div className="tag-service">
              {t.serviceName} {t.piece}/{t.total}
            </div>
            <div className="tag-order">{order.order_number}</div>
            <div className="tag-org">{ORG_NAME}</div>
            <div className="tag-code">
              {t.tagCode} {customer?.full_name || ""}
            </div>
            <div className="tag-date">{dateLabel}</div>
            <div className="tag-divider">----------------</div>
            <Barcode value={t.tagCode} height={24} moduleWidth={1.1} />
          </div>
        ))
      )}
    </>
  );
}
