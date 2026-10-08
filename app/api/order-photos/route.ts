import { NextResponse } from "next/server";
import { consoleUserId } from "@/lib/auth/console-user";
import { orderPhotoSet, savePhoto } from "@/lib/photos/order-photos";

// Garment photos for the console and POS (signed-in staff only).
//   GET  ?order=<id>                 -> garments with their photos
//   POST form: order_id, garment_id, file, width, height -> adds one photo
export const dynamic = "force-dynamic";

const uuid = /^[0-9a-f-]{36}$/i;

export async function GET(req: Request) {
  if (!(await consoleUserId())) return NextResponse.json({ error: "Sign in again." }, { status: 401 });
  const order = new URL(req.url).searchParams.get("order") ?? "";
  if (!uuid.test(order)) return NextResponse.json({ error: "Unknown order" }, { status: 400 });
  return NextResponse.json(await orderPhotoSet(order), { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: Request) {
  const userId = await consoleUserId();
  if (!userId) return NextResponse.json({ error: "Sign in again." }, { status: 401 });
  const form = await req.formData();
  const order = String(form.get("order_id") ?? "");
  const garment = String(form.get("garment_id") ?? "");
  const file = form.get("file");
  if (!uuid.test(order) || !(file instanceof File)) return NextResponse.json({ error: "Missing photo or order" }, { status: 400 });
  const res = await savePhoto(order, file, {
    source: "counter",
    userId,
    garmentId: uuid.test(garment) ? garment : null,
    width: Number(form.get("width")) || undefined,
    height: Number(form.get("height")) || undefined,
  });
  return NextResponse.json(res, { status: "error" in res ? 400 : 200 });
}
