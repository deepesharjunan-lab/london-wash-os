import webpush from "web-push";
import type { SupabaseClient } from "@supabase/supabase-js";

// Phone push notifications (Web Push). The signing keys (VAPID) are made on
// first use and kept in app_secret, which only the server can read. Set
// VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY in Vercel to use your own instead.
// Server-only.

type Supa = SupabaseClient<any, "public", any>;
type Keys = { publicKey: string; privateKey: string };

let cached: Keys | null = null;

export async function vapidKeys(db: Supa): Promise<Keys> {
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    return { publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY };
  }
  if (cached) return cached;
  const read = async () => ((await db.from("app_secret").select("value").eq("key", "vapid").maybeSingle()).data as { value: Keys } | null)?.value ?? null;
  let keys = await read();
  if (!keys) {
    // Two servers racing here both insert; the primary key keeps the first, and both read it back.
    await db.from("app_secret").insert({ key: "vapid", value: webpush.generateVAPIDKeys() });
    keys = await read();
  }
  if (!keys?.publicKey || !keys?.privateKey) throw new Error("Push keys unavailable");
  cached = keys;
  return keys;
}

/** The public key phones need to subscribe, or null if push isn't available. */
export async function vapidPublicKey(db: Supa) {
  try {
    return (await vapidKeys(db)).publicKey;
  } catch (e) {
    console.error("push keys", e);
    return null;
  }
}

export type PushOwner = { employee_id: string } | { user_id: string } | { customer_id: string };
export type BrowserSubscription = { endpoint: string; keys: { p256dh: string; auth: string } };

export async function saveSubscription(db: Supa, owner: PushOwner, sub: BrowserSubscription, userAgent: string | null) {
  if (!sub?.endpoint || !/^https:\/\//.test(sub.endpoint) || !sub.keys?.p256dh || !sub.keys?.auth) return { error: "That subscription isn't valid." };
  // A phone moves to whoever signs in on it last.
  await db.from("push_subscription").delete().eq("endpoint", sub.endpoint);
  const { error } = await db.from("push_subscription").insert({
    ...owner,
    endpoint: sub.endpoint,
    p256dh: sub.keys.p256dh,
    auth: sub.keys.auth,
    user_agent: userAgent?.slice(0, 300) ?? null,
  });
  return error ? { error: "Couldn't turn on notifications. Please try again." } : { ok: true };
}

export async function removeSubscription(db: Supa, endpoint: string) {
  if (endpoint) await db.from("push_subscription").delete().eq("endpoint", endpoint);
}

type Sub = { id: string; endpoint: string; p256dh: string; auth: string };
export type PushPayload = { title: string; body?: string; url?: string; tag?: string };

/** Sends to each subscription. Removes subscriptions the phone has cancelled. Never throws. */
export async function pushTo(db: Supa, subs: Sub[], payload: PushPayload) {
  if (!subs.length) return;
  let keys: Keys;
  try {
    keys = await vapidKeys(db);
  } catch (e) {
    console.error("push keys", e);
    return;
  }
  const subject = process.env.VAPID_SUBJECT || "mailto:hello@thelondonwash.com";
  const body = JSON.stringify(payload);
  await Promise.allSettled(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body, {
          vapidDetails: { subject, publicKey: keys.publicKey, privateKey: keys.privateKey },
          TTL: 24 * 3600,
          urgency: "high",
          timeout: 5000,
        });
      } catch (e: any) {
        if (e?.statusCode === 404 || e?.statusCode === 410) await db.from("push_subscription").delete().eq("id", s.id);
        else console.error("push failed", e?.statusCode ?? e);
      }
    })
  );
}
