import { NextResponse } from "next/server";
import { consoleUserId } from "@/lib/auth/console-user";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkState, encrypt, exchangeCode, GOOGLE_SCOPE } from "@/lib/google/oauth";
import { findLocation } from "@/lib/google/gbp";
import { syncReviews } from "@/lib/google/reviews";

// Google sends the owner back here after they allow access. We keep the
// refresh token (encrypted), then try to find The London Wash and load its
// reviews. If Google hasn't approved API access yet, the connection is still
// saved and the page says it's waiting for approval.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const back = new URL("/google", req.url);
  const fail = (msg: string) => {
    back.searchParams.set("error", msg);
    return NextResponse.redirect(back);
  };

  if (url.searchParams.get("error")) return fail(url.searchParams.get("error") === "access_denied" ? "Google access was not allowed." : "Google sign-in was cancelled.");
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state") ?? "";
  const userId = await consoleUserId();
  if (!code || !userId || !checkState(state, userId)) return fail("That Google sign-in link has expired. Try Connect again.");

  let tokens;
  try {
    tokens = await exchangeCode(code);
  } catch (e: any) {
    return fail(`Google sign-in failed: ${e?.message ?? "unknown error"}`);
  }
  if (!tokens.refresh_token) return fail("Google didn't give a lasting sign-in. Remove 'London Wash OS' at myaccount.google.com/permissions, then connect again.");
  if (!(tokens.scope ?? "").includes(GOOGLE_SCOPE)) return fail("Please tick the Business Profile permission on Google's screen and try again.");

  const db = createAdminClient();
  const { error } = await db.from("google_connection").upsert(
    {
      id: "main",
      refresh_token_enc: encrypt(tokens.refresh_token),
      scope: tokens.scope ?? GOOGLE_SCOPE,
      account_name: null,
      location_name: null,
      location_title: null,
      connected_at: new Date().toISOString(),
      connected_by_user_id: userId,
      last_sync_at: null,
      last_error: null,
      last_error_at: null,
    },
    { onConflict: "id" }
  );
  if (error) return fail(`Couldn't save the connection: ${error.message}`);

  try {
    await findLocation();
    const synced = await syncReviews();
    back.searchParams.set("connected", synced.ok ? "1" : "pending");
  } catch (e: any) {
    await db.from("google_connection").update({ last_error: e?.message ?? "Couldn't load the business", last_error_at: new Date().toISOString() }).eq("id", "main");
    back.searchParams.set("connected", "pending");
  }
  return NextResponse.redirect(back);
}
