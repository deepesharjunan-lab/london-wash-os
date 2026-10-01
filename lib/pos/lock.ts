import { createHash, createHmac, randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";

// Reception POS lock: one 4-digit PIN per branch, set by an Admin/Manager.
// The PIN's hash lives in app_secret (server-only; staff can't read it), and
// unlocking sets a signed cookie for that branch + console user. The POS also
// re-locks itself after 15 minutes without use (see PosIdleLock).
// Server-only.

const COOKIE = "lw_pos";
const MAX_HOURS = 12;
const MAX_FAILS = 5;
const LOCKOUT_MIN = 5;

const pinKey = (branchId: string) => `pos_pin:${branchId}`;
const failKey = (branchId: string) => `pos_pin_fail:${branchId}`;

function key() {
  const base = process.env.POS_SESSION_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!base) throw new Error("No session secret available");
  return createHash("sha256").update(`lw-pos-lock:${base}`).digest();
}
const sign = (payload: string) => createHmac("sha256", key()).update(payload).digest("base64url");
const cookieOpts = { httpOnly: true, secure: true, sameSite: "lax" as const, path: "/" };

export async function hasPosPin(branchId: string) {
  const { data } = await createAdminClient().from("app_secret").select("key").eq("key", pinKey(branchId)).maybeSingle();
  return !!data;
}

export async function setPosPin(branchId: string, pin: string) {
  const salt = randomBytes(16).toString("base64url");
  const hash = scryptSync(pin, salt, 32).toString("base64url");
  const db = createAdminClient();
  await db.from("app_secret").delete().eq("key", pinKey(branchId));
  const { error } = await db.from("app_secret").insert({ key: pinKey(branchId), value: { salt, hash, set_at: new Date().toISOString() } });
  await db.from("app_secret").delete().eq("key", failKey(branchId));
  return !error;
}

/** Checks a PIN, counting wrong tries. */
export async function checkPosPin(branchId: string, pin: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const db = createAdminClient();
  const [{ data: rec }, { data: failRec }] = await Promise.all([
    db.from("app_secret").select("value").eq("key", pinKey(branchId)).maybeSingle(),
    db.from("app_secret").select("value").eq("key", failKey(branchId)).maybeSingle(),
  ]);
  const fail = ((failRec as { value: { count: number; until: string | null } } | null)?.value) ?? { count: 0, until: null };
  if (fail.until && new Date(fail.until) > new Date()) {
    const mins = Math.ceil((new Date(fail.until).getTime() - Date.now()) / 60000);
    return { ok: false, error: `Too many wrong PINs. Try again in ${mins} min.` };
  }
  const v = (rec as { value: { salt: string; hash: string } } | null)?.value;
  if (!v) return { ok: false, error: "No POS PIN is set yet." };
  const a = Buffer.from(v.hash, "base64url");
  const b = scryptSync(pin, v.salt, 32);
  if (a.length === b.length && timingSafeEqual(a, b)) {
    if (fail.count) await db.from("app_secret").delete().eq("key", failKey(branchId));
    return { ok: true };
  }
  const count = (fail.until ? 0 : fail.count) + 1;
  const next = count >= MAX_FAILS ? { count: 0, until: new Date(Date.now() + LOCKOUT_MIN * 60000).toISOString() } : { count, until: null };
  await db.from("app_secret").delete().eq("key", failKey(branchId));
  await db.from("app_secret").insert({ key: failKey(branchId), value: next });
  return { ok: false, error: count >= MAX_FAILS ? `Too many wrong PINs. The POS is locked for ${LOCKOUT_MIN} minutes.` : `Wrong PIN. ${MAX_FAILS - count} ${MAX_FAILS - count === 1 ? "try" : "tries"} left.` };
}

export function setPosUnlocked(branchId: string, userId: string) {
  const exp = Date.now() + MAX_HOURS * 3600e3;
  const payload = Buffer.from(JSON.stringify({ b: branchId, u: userId, exp })).toString("base64url");
  cookies().set(COOKIE, `${payload}.${sign(payload)}`, { ...cookieOpts, maxAge: MAX_HOURS * 3600 });
}

export function lockPos() {
  cookies().set(COOKIE, "", { ...cookieOpts, maxAge: 0 });
}

export function isPosUnlocked(branchId: string, userId: string) {
  const raw = cookies().get(COOKIE)?.value;
  if (!raw) return false;
  const [payload, sig] = raw.split(".");
  if (!payload || !sig) return false;
  const a = Buffer.from(sig);
  const b = Buffer.from(sign(payload));
  if (a.length !== b.length || !timingSafeEqual(a, b)) return false;
  try {
    const s = JSON.parse(Buffer.from(payload, "base64url").toString()) as { b: string; u: string; exp: number };
    return s.b === branchId && s.u === userId && Date.now() < s.exp;
  } catch {
    return false;
  }
}
