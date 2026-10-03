import { handleIncoming } from "@/lib/whatsapp/bot";
import { recordStatus, verifySignature } from "@/lib/whatsapp/client";

// Meta WhatsApp Cloud API webhook.
//   GET  — Meta's one-time verification (hub.verify_token must match WHATSAPP_VERIFY_TOKEN).
//   POST — incoming messages and delivery statuses, signed with the app secret.
// Callback URL: https://admin.thelondonwash.com/api/public/whatsapp/webhook

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge") ?? "";
  const expected = process.env.WHATSAPP_VERIFY_TOKEN;
  if (mode === "subscribe" && expected && token === expected) return new Response(challenge, { status: 200 });
  return new Response("Forbidden", { status: 403 });
}

export async function POST(req: Request) {
  const raw = await req.text();
  if (!verifySignature(raw, req.headers.get("x-hub-signature-256"))) return new Response("Invalid signature", { status: 401 });

  let body: any;
  try {
    body = JSON.parse(raw);
  } catch {
    return new Response("Bad request", { status: 400 });
  }

  const ownNumber = process.env.WHATSAPP_PHONE_NUMBER_ID;
  for (const entry of body?.entry ?? []) {
    for (const change of entry?.changes ?? []) {
      const v = change?.value;
      if (!v || (ownNumber && v.metadata?.phone_number_id && v.metadata.phone_number_id !== ownNumber)) continue;
      for (const m of v.messages ?? []) {
        const name = (v.contacts ?? []).find((c: any) => c?.wa_id === m.from)?.profile?.name;
        await handleIncoming(m, name);
      }
      for (const s of v.statuses ?? []) await recordStatus(s);
    }
  }
  // Always 200 so Meta doesn't keep retrying; failures are logged.
  return new Response("ok", { status: 200 });
}
