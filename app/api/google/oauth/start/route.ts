import { NextResponse } from "next/server";
import { consoleUserId } from "@/lib/auth/console-user";
import { authUrl, makeState, oauthConfigured } from "@/lib/google/oauth";

// "Connect Google Business Profile" button: sends the signed-in console user to
// Google's consent screen. The console login gate (middleware) protects /api/google.
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const back = new URL("/google", req.url);
  if (!oauthConfigured()) {
    back.searchParams.set("error", "Google sign-in isn't set up yet (GOOGLE_OAUTH_CLIENT_ID / SECRET missing in Vercel).");
    return NextResponse.redirect(back);
  }
  const userId = await consoleUserId();
  if (!userId) return NextResponse.redirect(new URL("/login?next=/google", req.url));
  return NextResponse.redirect(authUrl(makeState(userId)));
}
