import { getSiteSettings, getSiteSettingsFresh } from "@/lib/site/settings";
import { renderNotFound, renderServicePage } from "@/lib/site/pages";

// Service pages: www.thelondonwash.com/services/<slug> (middleware.ts rewrites
// here with ?slug=). ?fresh=1&preview=1 (CMS preview) skips the cache and also
// shows unpublished pages.

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const fresh = q.get("fresh") === "1";
  const slug = (q.get("slug") ?? "").toLowerCase().replace(/[^a-z0-9-]/g, "");
  const st = fresh ? await getSiteSettingsFresh() : await getSiteSettings();
  const html = renderServicePage(st, slug, fresh && q.get("preview") === "1");
  const headers = { "Content-Type": "text/html; charset=utf-8", "Cache-Control": fresh ? "no-store" : "public, s-maxage=60, stale-while-revalidate=300" };
  if (!html) return new Response(renderNotFound(st), { status: 404, headers: { ...headers, "Cache-Control": "no-store" } });
  return new Response(html, { headers });
}
