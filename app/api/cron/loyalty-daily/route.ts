import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadCtx, runDailyMaintenance } from "@/lib/loyalty/ledger";

// Nightly loyalty job, scheduled in vercel.json for 00:00 IST (18:30 UTC).
// Expires due points and adds birthday bonuses. Safe to run more than once:
// every award and expiry is guarded by a once-only key in the ledger.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  // If CRON_SECRET is set in Vercel, Vercel sends it as a Bearer token and we
  // require it. Without it, only accept Vercel's cron user agent.
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization") ?? "";
  const agent = request.headers.get("user-agent") ?? "";
  if (secret ? auth !== `Bearer ${secret}` : !agent.includes("vercel-cron")) {
    return NextResponse.json({ error: "Not allowed" }, { status: 401 });
  }

  const ctx = await loadCtx(createAdminClient());
  if (!ctx) return NextResponse.json({ ok: false, reason: "Loyalty Club is not set up" });
  const started = Date.now();
  const res = await runDailyMaintenance(ctx, "nightly");
  const summary = { ok: true, ...res, ms: Date.now() - started, at: new Date().toISOString() };
  console.log("loyalty-daily", summary);
  return NextResponse.json(summary);
}
