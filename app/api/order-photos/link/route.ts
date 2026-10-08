import { NextResponse } from "next/server";
import QRCode from "qrcode";
import { consoleUserId } from "@/lib/auth/console-user";
import { createLink } from "@/lib/photos/order-photos";

// "Use phone" on the desktop POS: a 2-hour link (as a QR code) that opens the
// phone photo page for this order without signing in.
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const userId = await consoleUserId();
  if (!userId) return NextResponse.json({ error: "Sign in again." }, { status: 401 });
  const { order_id } = await req.json().catch(() => ({}));
  if (!/^[0-9a-f-]{36}$/i.test(order_id ?? "")) return NextResponse.json({ error: "Unknown order" }, { status: 400 });
  const { token, expires } = await createLink(order_id, userId);
  const url = `https://admin.thelondonwash.com/p/${token}`;
  const qr = await QRCode.toDataURL(url, { margin: 1, width: 320 });
  return NextResponse.json({ url, qr, expires });
}
