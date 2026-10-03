// One-off helper: subscribes a WhatsApp Business Account to this app's webhook
// (Meta: POST /{waba-id}/subscribed_apps), using WHATSAPP_TOKEN from Vercel.
// Open once in a browser:
//   /api/public/whatsapp/subscribe?waba=<WhatsApp Business Account ID>&key=<WHATSAPP_VERIFY_TOKEN>
// Needed for the Meta test number's account (the dashboard has no switch for it)
// and for the real account after its number is connected.

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const waba = (url.searchParams.get("waba") ?? "").replace(/\D/g, "");
  const key = url.searchParams.get("key") ?? "";
  const expected = process.env.WHATSAPP_VERIFY_TOKEN;
  const token = process.env.WHATSAPP_TOKEN;
  if (!expected || key !== expected) return Response.json({ ok: false, error: "Wrong or missing key" }, { status: 403 });
  if (!token) return Response.json({ ok: false, error: "WHATSAPP_TOKEN is not set" }, { status: 500 });
  if (!waba) return Response.json({ ok: false, error: "Add ?waba=<WhatsApp Business Account ID>" }, { status: 400 });

  const graph = `https://graph.facebook.com/${process.env.WHATSAPP_GRAPH_VERSION || "v23.0"}/${waba}/subscribed_apps`;
  const headers = { Authorization: `Bearer ${token}` };
  const sub = await fetch(graph, { method: "POST", headers });
  const subBody = await sub.json().catch(() => ({}));
  const list = await fetch(graph, { headers });
  const listBody = (await list.json().catch(() => ({}))) as any;
  const apps = ((listBody?.data ?? []) as any[]).map((a) => a?.whatsapp_business_api_data?.name ?? a?.name ?? a?.id);

  return Response.json(
    {
      ok: sub.ok,
      waba,
      subscribe: sub.ok ? subBody : { error: (subBody as any)?.error?.message ?? `HTTP ${sub.status}` },
      subscribedApps: apps,
    },
    { status: sub.ok ? 200 : 502 }
  );
}
