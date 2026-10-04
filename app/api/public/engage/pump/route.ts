import { pumpCampaigns } from "@/lib/engage/campaigns";

// Sends Engage work that is due: scheduled campaigns whose time has come, and
// queued campaign messages. Called every minute by Supabase pg_cron (see
// migration 2026-10-05_engage_campaigns.sql) and every few seconds by an open
// campaign page. Public on purpose: it can only send what staff have already
// queued or scheduled, and parallel calls never send a message twice.

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req: Request) {
  const quick = new URL(req.url).searchParams.get("quick") === "1"; // the campaign page asks for short rounds
  try {
    const summary = await pumpCampaigns(quick ? 8000 : 40000);
    return Response.json({ ok: true, ...summary }, { headers: { "Cache-Control": "no-store" } });
  } catch (e: any) {
    console.error("engage pump failed", e);
    return Response.json({ ok: false, error: e?.message ?? "failed" }, { status: 500 });
  }
}
