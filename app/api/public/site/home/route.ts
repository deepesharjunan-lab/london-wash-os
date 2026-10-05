import { getSiteSettings, getSiteSettingsFresh } from "@/lib/site/settings";
import { renderHome } from "@/lib/site/render";

// The public home page (www.thelondonwash.com/), rendered from the website CMS.
// middleware.ts rewrites "/" on the website domain to this route.
// ?fresh=1 skips the 5-minute settings cache (used by the CMS preview).

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const fresh = new URL(req.url).searchParams.get("fresh") === "1";
  const settings = fresh ? await getSiteSettingsFresh() : await getSiteSettings();
  return new Response(renderHome(settings), {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": fresh ? "no-store" : "public, s-maxage=60, stale-while-revalidate=300",
    },
  });
}
