import { createHash, createHmac, randomInt, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendLoginCodeWhatsApp, waCodesOn } from "@/lib/whatsapp/templates";

// Customer app session. Customers never get a Supabase session (the staff
// RLS policies are branch-based and would not restrict them). Instead they
// get a signed, httpOnly cookie naming their customer id, and every query in
// the customer app runs on the server with the service-role client, filtered
// to that customer. Server-only: never import from a client component.

const COOKIE = "lw_member";
const MAX_AGE_DAYS = 30;

function key() {
  const base = process.env.CUSTOMER_SESSION_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!base) throw new Error("No session secret available");
  return createHash("sha256").update(`lw-member-session:${base}`).digest();
}
const b64 = (s: string) => Buffer.from(s).toString("base64url");
const sign = (payload: string) => createHmac("sha256", key()).update(payload).digest("base64url");

export function setMemberSession(customerId: string) {
  const exp = Date.now() + MAX_AGE_DAYS * 864e5;
  const payload = b64(JSON.stringify({ cid: customerId, exp }));
  cookies().set(COOKIE, `${payload}.${sign(payload)}`, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE_DAYS * 86400,
  });
}

export function clearMemberSession() {
  cookies().set(COOKIE, "", { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 0 });
}

/** The signed-in customer's id, or null. */
export function memberId(): string | null {
  const raw = cookies().get(COOKIE)?.value;
  if (!raw) return null;
  const [payload, sig] = raw.split(".");
  if (!payload || !sig) return null;
  const expected = sign(payload);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const { cid, exp } = JSON.parse(Buffer.from(payload, "base64url").toString()) as { cid: string; exp: number };
    if (!cid || Date.now() > exp) return null;
    return cid;
  } catch {
    return null;
  }
}

/** For customer-app pages and actions: the member id plus a service-role client, or a redirect to sign in. */
export function requireMember() {
  const id = memberId();
  if (!id) redirect("/my/login");
  return { customerId: id, db: createAdminClient() };
}

/* ------------------------------------------------------------------ */
/* Sign-in codes                                                       */
/* ------------------------------------------------------------------ */

export const digits = (s: string) => (s || "").replace(/\D/g, "");
export const last10 = (s: string) => digits(s).slice(-10);
const hashCode = (customerId: string, code: string) => createHash("sha256").update(`${customerId}:${code}:${key().toString("hex")}`).digest("hex");

/** Customers whose stored phone matches (last 10 digits). */
export async function customersByPhone(phone: string) {
  const want = last10(phone);
  if (want.length !== 10) return [];
  const db = createAdminClient();
  const { data } = await db
    .from("customer")
    .select("id, full_name, phone")
    .ilike("phone", `%${want.slice(-4)}`)
    .is("deleted_at", null)
    .limit(200);
  return ((data ?? []) as { id: string; full_name: string; phone: string }[]).filter((c) => last10(c.phone) === want);
}

/** Creates a 6-digit sign-in code valid for 15 minutes. Returns the plain code (shown or sent once, stored hashed). */
export async function createLoginCode(customerId: string, createdByUserId: string | null) {
  const db = createAdminClient();
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  await db.from("customer_login_code").update({ used_at: new Date().toISOString() }).eq("customer_id", customerId).is("used_at", null);
  const { error } = await db.from("customer_login_code").insert({
    customer_id: customerId,
    code_hash: hashCode(customerId, code),
    expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    created_by_user_id: createdByUserId,
  });
  if (error) throw error;
  return code;
}

/** Checks a code for a phone number. At most 5 attempts per code. Returns the customer id on success. */
export async function verifyLoginCode(phone: string, code: string): Promise<string | null> {
  const matches = await customersByPhone(phone);
  if (!matches.length || !/^\d{6}$/.test(code)) return null;
  const db = createAdminClient();
  const now = new Date().toISOString();
  for (const c of matches) {
    const { data } = await db
      .from("customer_login_code")
      .select("id, code_hash, attempts")
      .eq("customer_id", c.id)
      .is("used_at", null)
      .gt("expires_at", now)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const row = data as { id: string; code_hash: string; attempts: number } | null;
    if (!row || row.attempts >= 5) continue;
    if (row.code_hash === hashCode(c.id, code)) {
      await db.from("customer_login_code").update({ used_at: now }).eq("id", row.id);
      return c.id;
    }
    await db.from("customer_login_code").update({ attempts: row.attempts + 1 }).eq("id", row.id);
  }
  return null;
}

/** True when sign-in codes go out by WhatsApp (Vercel WHATSAPP_LOGIN_CODES=1 and the API configured). */
export function canSendCodes() {
  return waCodesOn();
}

/**
 * Sends a sign-in code with the approved WhatsApp template "lw_login_code".
 * Returns false if it couldn't be sent; the app then tells the customer to
 * ask the store for a code.
 */
export async function sendLoginCode(phone: string, code: string): Promise<boolean> {
  return sendLoginCodeWhatsApp(phone, code);
}
