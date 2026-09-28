import { createHash, createHmac, randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAppRole, type AppRole } from "./roles";

// Staff app session. Like the customer app, staff never get a Supabase
// session: the server checks a signed, httpOnly cookie, then reads data with
// the service-role client, limited to what the staff member's role allows.
// Server-only: never import from a client component.

const COOKIE = "lw_staff";
const DEVICE = "lw_device";
const MAX_AGE_DAYS = 30;

function key() {
  const base = process.env.STAFF_SESSION_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!base) throw new Error("No session secret available");
  return createHash("sha256").update(`lw-staff-session:${base}`).digest();
}
const sign = (payload: string) => createHmac("sha256", key()).update(payload).digest("base64url");
const cookieOpts = { httpOnly: true, secure: true, sameSite: "lax" as const, path: "/" };

export function setStaffSession(employeeId: string, version: number) {
  const exp = Date.now() + MAX_AGE_DAYS * 864e5;
  const payload = Buffer.from(JSON.stringify({ eid: employeeId, v: version, exp })).toString("base64url");
  cookies().set(COOKIE, `${payload}.${sign(payload)}`, { ...cookieOpts, maxAge: MAX_AGE_DAYS * 86400 });
}

export function clearStaffSession() {
  cookies().set(COOKIE, "", { ...cookieOpts, maxAge: 0 });
}

function readSession(): { eid: string; v: number } | null {
  const raw = cookies().get(COOKIE)?.value;
  if (!raw) return null;
  const [payload, sig] = raw.split(".");
  if (!payload || !sig) return null;
  const a = Buffer.from(sig);
  const b = Buffer.from(sign(payload));
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const s = JSON.parse(Buffer.from(payload, "base64url").toString()) as { eid: string; v: number; exp: number };
    if (!s.eid || Date.now() > s.exp) return null;
    return { eid: s.eid, v: s.v };
  } catch {
    return null;
  }
}

/** This phone's id. Created on first sign-in and kept for 5 years. Only call from a server action. */
export function ensureDeviceId() {
  const existing = cookies().get(DEVICE)?.value;
  if (existing && /^[A-Za-z0-9_-]{16,64}$/.test(existing)) return existing;
  const id = randomBytes(18).toString("base64url");
  cookies().set(DEVICE, id, { ...cookieOpts, maxAge: 5 * 365 * 86400 });
  return id;
}

export type StaffBranch = { id: string; name: string; latitude: number | null; longitude: number | null; punch_radius_m: number };
export type StaffMe = {
  id: string;
  full_name: string;
  firstName: string;
  phone: string | null;
  app_role: AppRole;
  branch_id: string;
  branch: StaffBranch | null;
  driver_id: string | null;
};

/** The signed-in staff member, or null (signed out, disabled, role removed, or signed out by the owner). */
export async function currentStaff(): Promise<StaffMe | null> {
  const s = readSession();
  if (!s) return null;
  const db = createAdminClient();
  const { data } = await db
    .from("employee")
    .select("id, full_name, phone, app_role, branch_id, session_version, is_active, deleted_at, branch:branch_id(id, name, latitude, longitude, punch_radius_m)")
    .eq("id", s.eid)
    .maybeSingle();
  const e = data as any;
  if (!e || !e.is_active || e.deleted_at || !isAppRole(e.app_role) || Number(e.session_version) !== Number(s.v)) return null;
  const b = Array.isArray(e.branch) ? e.branch[0] : e.branch;
  const { data: drv } = e.app_role === "driver" ? await db.from("driver").select("id").eq("employee_id", e.id).maybeSingle() : { data: null };
  return {
    id: e.id,
    full_name: e.full_name,
    firstName: String(e.full_name || "").split(" ")[0] || e.full_name,
    phone: e.phone,
    app_role: e.app_role,
    branch_id: e.branch_id,
    branch: b
      ? {
          id: b.id,
          name: b.name,
          latitude: b.latitude == null ? null : Number(b.latitude),
          longitude: b.longitude == null ? null : Number(b.longitude),
          punch_radius_m: Number(b.punch_radius_m) || 100,
        }
      : null,
    driver_id: (drv as { id: string } | null)?.id ?? null,
  };
}

/** For staff-app pages and actions: the staff member plus a service-role client, or a redirect. */
export async function requireStaff(roles?: AppRole[]) {
  const me = await currentStaff();
  if (!me) redirect("/work/login");
  if (roles && !roles.includes(me.app_role)) redirect("/work");
  return { me, db: createAdminClient() };
}

/* ------------------------------------------------------------------ */
/* PINs                                                                */
/* ------------------------------------------------------------------ */

export function hashPin(pin: string) {
  const salt = randomBytes(16).toString("base64url");
  const hash = scryptSync(pin, salt, 32).toString("base64url");
  return `s1$${salt}$${hash}`;
}

export function checkPin(pin: string, stored: string | null) {
  if (!stored) return false;
  const [v, salt, hash] = stored.split("$");
  if (v !== "s1" || !salt || !hash) return false;
  const a = Buffer.from(hash, "base64url");
  const b = scryptSync(pin, salt, 32);
  return a.length === b.length && timingSafeEqual(a, b);
}

export const digits = (s: string | null | undefined) => (s || "").replace(/\D/g, "");
export const last10 = (s: string | null | undefined) => digits(s).slice(-10);
