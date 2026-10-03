import { TEMPLATE_DEFS } from "@/lib/whatsapp/templates";

// One-off helper: submits The London Wash message templates (lib/whatsapp/templates.ts)
// to Meta for approval on a WhatsApp Business Account, then lists their status.
// Templates that already exist are left as they are. Open in a browser:
//   /api/public/whatsapp/templates?waba=<WhatsApp Business Account ID>&key=<WHATSAPP_VERIFY_TOKEN>
// Add &check=1 to only list the current status without submitting.

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const waba = (url.searchParams.get("waba") ?? "").replace(/\D/g, "");
  const key = url.searchParams.get("key") ?? "";
  const checkOnly = url.searchParams.get("check") === "1";
  const expected = process.env.WHATSAPP_VERIFY_TOKEN;
  const token = process.env.WHATSAPP_TOKEN;
  if (!expected || key !== expected) return Response.json({ ok: false, error: "Wrong or missing key" }, { status: 403 });
  if (!token) return Response.json({ ok: false, error: "WHATSAPP_TOKEN is not set" }, { status: 500 });
  if (!waba) return Response.json({ ok: false, error: "Add ?waba=<WhatsApp Business Account ID>" }, { status: 400 });

  const base = `https://graph.facebook.com/${process.env.WHATSAPP_GRAPH_VERSION || "v23.0"}/${waba}/message_templates`;
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  const lang = process.env.WHATSAPP_TEMPLATE_LANG || "en";

  const submitted: Record<string, string> = {};
  if (!checkOnly) {
    for (const def of TEMPLATE_DEFS) {
      const res = await fetch(base, { method: "POST", headers, body: JSON.stringify({ ...def, language: lang }) });
      const body = (await res.json().catch(() => ({}))) as any;
      submitted[def.name] = res.ok ? `submitted (${body?.status ?? "PENDING"})` : `not submitted: ${body?.error?.error_user_msg ?? body?.error?.message ?? res.status}`;
    }
  }

  const list = await fetch(`${base}?fields=name,status,category,language,rejected_reason&limit=100`, { headers });
  const listBody = (await list.json().catch(() => ({}))) as any;
  const ours = new Set<string>(TEMPLATE_DEFS.map((d) => d.name));
  const status = ((listBody?.data ?? []) as any[])
    .filter((t) => ours.has(t.name))
    .map((t) => ({ name: t.name, status: t.status, category: t.category, language: t.language, rejected_reason: t.rejected_reason && t.rejected_reason !== "NONE" ? t.rejected_reason : undefined }));

  return Response.json({ ok: true, waba, submitted: checkOnly ? undefined : submitted, templates: status });
}
