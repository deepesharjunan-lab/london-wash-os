import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";

// Google sign-in for the Business Profile connection. The owner connects once
// from Website → Google Business; Google gives us a long-lived refresh token,
// kept encrypted in google_connection, and we trade it for short access tokens
// as needed. Needs GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET in
// Vercel (Google Cloud project london-wash-os). Server-only.

export const GOOGLE_SCOPE = "https://www.googleapis.com/auth/business.manage";
export const REDIRECT_URI = process.env.GOOGLE_OAUTH_REDIRECT_URI || "https://admin.thelondonwash.com/api/google/oauth/callback";

export const oauthConfigured = () => !!(process.env.GOOGLE_OAUTH_CLIENT_ID && process.env.GOOGLE_OAUTH_CLIENT_SECRET);

function key(purpose: string) {
  const base = process.env.GOOGLE_TOKEN_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!base) throw new Error("No token key available");
  return createHash("sha256").update(`lw-google-${purpose}:${base}`).digest();
}

/** AES-256-GCM, stored as base64url iv.tag.data */
export function encrypt(text: string) {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key("token"), iv);
  const data = Buffer.concat([c.update(text, "utf8"), c.final()]);
  return [iv, c.getAuthTag(), data].map((b) => b.toString("base64url")).join(".");
}

export function decrypt(enc: string) {
  const [iv, tag, data] = enc.split(".").map((p) => Buffer.from(p, "base64url"));
  const d = createDecipheriv("aes-256-gcm", key("token"), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(data), d.final()]).toString("utf8");
}

// The "state" sent through Google's sign-in: who started it and when, signed,
// so a callback can't be forged or replayed later.
export function makeState(userId: string) {
  const body = `${userId}.${Date.now()}`;
  return `${body}.${createHmac("sha256", key("state")).update(body).digest("base64url").slice(0, 22)}`;
}

export function checkState(state: string, userId: string) {
  const parts = state.split(".");
  if (parts.length !== 3) return false;
  const [uid, ts, sig] = parts;
  const want = createHmac("sha256", key("state")).update(`${uid}.${ts}`).digest("base64url").slice(0, 22);
  if (sig.length !== want.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(want))) return false;
  return uid === userId && Date.now() - Number(ts) < 15 * 60 * 1000;
}

export function authUrl(state: string) {
  const p = new URLSearchParams({
    client_id: process.env.GOOGLE_OAUTH_CLIENT_ID!,
    redirect_uri: REDIRECT_URI,
    response_type: "code",
    scope: GOOGLE_SCOPE,
    access_type: "offline",
    prompt: "consent", // always return a refresh token
    include_granted_scopes: "true",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${p}`;
}

async function tokenCall(params: Record<string, string>) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_OAUTH_CLIENT_ID!,
      client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET!,
      ...params,
    }),
    cache: "no-store",
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error_description || json.error || `Google sign-in failed (${res.status})`);
  return json as { access_token: string; expires_in: number; refresh_token?: string; scope?: string };
}

export const exchangeCode = (code: string) => tokenCall({ code, grant_type: "authorization_code", redirect_uri: REDIRECT_URI });

let cached: { token: string; exp: number; for: string } | null = null;

/** A fresh access token for the connected account, or null when not connected. */
export async function accessToken(): Promise<string | null> {
  const db = createAdminClient();
  const { data } = await db.from("google_connection").select("refresh_token_enc").eq("id", "main").maybeSingle();
  const enc = (data as { refresh_token_enc: string } | null)?.refresh_token_enc;
  if (!enc) return null;
  if (cached && cached.for === enc && cached.exp > Date.now() + 60_000) return cached.token;
  try {
    const t = await tokenCall({ refresh_token: decrypt(enc), grant_type: "refresh_token" });
    cached = { token: t.access_token, exp: Date.now() + t.expires_in * 1000, for: enc };
    return t.access_token;
  } catch (e: any) {
    // invalid_grant: the owner removed access in their Google account, or the token expired.
    await db
      .from("google_connection")
      .update({ last_error: `Google sign-in no longer works (${e?.message}). Connect again.`, last_error_at: new Date().toISOString() })
      .eq("id", "main");
    throw new Error("Google sign-in no longer works. Disconnect and connect again.");
  }
}

export async function revokeToken(enc: string) {
  try {
    await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(decrypt(enc))}`, { method: "POST", cache: "no-store" });
  } catch {
    // best effort
  }
  cached = null;
}
