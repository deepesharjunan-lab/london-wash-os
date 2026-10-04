import { pumpCampaigns } from "@/lib/engage/campaigns";
import { pumpAutomations } from "@/lib/engage/automations";

// Sends Engage work that is due: scheduled campaigns whose time has come,
// queued campaign messages, and automation messages (plus the hourly check for
// win-back, birthday and expiring points). Called every minute by Supabase
// pg_cron (see migration 2026-10-05_engage_campaigns.sql) and every few seconds
// by an open campaign page (?quick=1, campaigns only). Public on purpose: it
// can only send what is already queued or scheduled, and parallel calls never
// send a message twice.

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req: Request) {
  const quick = new URL(req.url).searchParams.get("quick") === "1"; // the campaign page asks for short rounds
  try {
    const campaigns = await pumpCampaigns(quick ? 8000 : 25000);
    const automations = quick ? null : await pumpAutomations(20000);
    return Response.json({ ok: true, ...campaigns, automations }, { headers: { "Cache-Control": "no-store" } });
  } catch (e: any) {
    console.error("engage pump failed", e);
    return Response.json({ ok: false, error: e?.message ?? "failed" }, { status: 500 });
  }
}
