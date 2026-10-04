import type { NextRequest } from "next/server";

// Checks the console sign-in cookie inside the middleware without calling
// Supabase. The access token is a JWT signed with the project's ES256 key;
// its signature, expiry, issuer and audience are verified locally with Web
// Crypto (about a millisecond, instead of a round trip to Supabase Auth in
// Seoul on every page click). Anything unusual (no ES256, unknown key, about to
// expire, unreadable cookie) returns "check", and the middleware falls back
// to the full Supabase check, which also refreshes the session.

const PROJECT_REF = "solvgxxfdqdoztoicdwd";
const ISSUER = `https://${PROJECT_REF}.supabase.co/auth/v1`;
const COOKIE = `sb-${PROJECT_REF}-auth-token`;
const REFRESH_MARGIN_S = 120; // let Supabase refresh the session in its last two minutes

// Public signing key from https://<project>.supabase.co/auth/v1/.well-known/jwks.json
// (public, not a secret). If the project rotates keys, tokens with a new
// key id simply take the full check until this list is updated.
const KEYS: Record<string, JsonWebKey> = {
  "c70ff06c-58c4-4c90-972d-140296e250f3": {
    kty: "EC",
    crv: "P-256",
    x: "MhFUDldf3BU2NhGZXaTTS50UNpS92IBVY7UDm19TcmA",
    y: "3Cj28pzpTpsFFD8IVZ4K93uR-UIyh2GVvVK3hs0iZFY",
  },
};
const imported = new Map<string, Promise<CryptoKey>>();

function b64urlBytes(s: string): Uint8Array {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
const b64urlJson = (s: string) => JSON.parse(new TextDecoder().decode(b64urlBytes(s)));

/** The session cookie (it can be split into .0, .1 … chunks), or null. */
function readCookie(req: NextRequest): string | null {
  const whole = req.cookies.get(COOKIE)?.value;
  if (whole) return whole;
  let joined = "";
  for (let i = 0; i < 10; i++) {
    const part = req.cookies.get(`${COOKIE}.${i}`)?.value;
    if (part === undefined) break;
    joined += part;
  }
  return joined || null;
}

export type FastSession = { state: "valid"; userId: string } | { state: "none" } | { state: "check" };

export async function fastSession(req: NextRequest): Promise<FastSession> {
  const raw = readCookie(req);
  if (!raw) return { state: "none" };
  try {
    const value = decodeURIComponent(raw);
    const session = value.startsWith("base64-") ? b64urlJson(value.slice(7)) : JSON.parse(value);
    const token: string | undefined = Array.isArray(session) ? session[0] : session?.access_token;
    if (!token) return { state: "check" };

    const [h, p, sig] = token.split(".");
    const header = b64urlJson(h);
    const jwk = header?.alg === "ES256" ? KEYS[header.kid] : undefined;
    if (!jwk || !sig) return { state: "check" };

    let key = imported.get(header.kid);
    if (!key) {
      key = crypto.subtle.importKey("jwk", { ...jwk, ext: true }, { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
      imported.set(header.kid, key);
    }
    const ok = await crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      await key,
      b64urlBytes(sig) as BufferSource,
      new TextEncoder().encode(`${h}.${p}`) as BufferSource
    );
    if (!ok) return { state: "check" };

    const claims = b64urlJson(p);
    const now = Math.floor(Date.now() / 1000);
    const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    if (claims.iss !== ISSUER || !aud.includes("authenticated") || !claims.sub) return { state: "check" };
    if (typeof claims.exp !== "number" || claims.exp - REFRESH_MARGIN_S <= now) return { state: "check" };
    return { state: "valid", userId: String(claims.sub) };
  } catch {
    return { state: "check" };
  }
}
