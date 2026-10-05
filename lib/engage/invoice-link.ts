import { createHash, createHmac, timingSafeEqual } from "crypto";

// Private online invoice links: club.thelondonwash.com/i/<code>. The code is
// the order id plus a signature, so it can't be guessed or changed to open
// someone else's invoice, and nothing extra is stored. Server-only.

export const INVOICE_BASE = "https://club.thelondonwash.com/i/";

function key() {
  const base = process.env.INVOICE_LINK_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!base) throw new Error("No invoice link secret available");
  return createHash("sha256").update(`lw-invoice-link:${base}`).digest();
}
const sig = (id: Buffer) => createHmac("sha256", key()).update(id).digest().subarray(0, 9).toString("base64url"); // 12 chars

/** The code for an order (goes after INVOICE_BASE). */
export function invoiceCode(orderId: string) {
  const id = Buffer.from(orderId.replace(/-/g, ""), "hex");
  return id.toString("base64url") + sig(id);
}

export const invoiceUrl = (orderId: string) => INVOICE_BASE + invoiceCode(orderId);

/** The order id in a code, or null if the code isn't genuine. */
export function orderIdFromCode(code: string): string | null {
  if (!/^[A-Za-z0-9_-]{34}$/.test(code)) return null;
  const id = Buffer.from(code.slice(0, 22), "base64url");
  if (id.length !== 16) return null;
  const given = Buffer.from(code.slice(22));
  const want = Buffer.from(sig(id));
  if (given.length !== want.length || !timingSafeEqual(given, want)) return null;
  const h = id.toString("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
