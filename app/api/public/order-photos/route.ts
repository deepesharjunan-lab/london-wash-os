import { NextResponse } from "next/server";
import { linkOrder, orderPhotoSet, savePhoto } from "@/lib/photos/order-photos";

// Phone photo page (opened from the POS QR code). The random link token is the
// only access: it is limited to one order and expires after 2 hours.
//   GET  ?t=<token>                  -> garments with their photos
//   POST form: t, garment_id, file, width, height -> adds one photo
export const dynamic = "force-dynamic";

const expired = () => NextResponse.json({ error: "This photo link has expired. Open a new QR code on the POS." }, { status: 403 });

export async function GET(req: Request) {
  const link = await linkOrder(new URL(req.url).searchParams.get("t") ?? "");
  if (!link) return expired();
  return NextResponse.json(await orderPhotoSet(link.orderId), { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: Request) {
  const form = await req.formData();
  const link = await linkOrder(String(form.get("t") ?? ""));
  if (!link) return expired();
  const garment = String(form.get("garment_id") ?? "");
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Missing photo" }, { status: 400 });
  const res = await savePhoto(link.orderId, file, {
    source: "phone",
    userId: link.userId,
    garmentId: /^[0-9a-f-]{36}$/i.test(garment) ? garment : null,
    width: Number(form.get("width")) || undefined,
    height: Number(form.get("height")) || undefined,
  });
  return NextResponse.json(res, { status: "error" in res ? 400 : 200 });
}
