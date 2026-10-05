import { getSiteSettings } from "@/lib/site/settings";

// /robots.txt on every host (rewritten here by middleware.ts). The website may
// be indexed (unless switched off in the CMS); the apps and console never are.

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const host = (req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "").toLowerCase().split(":")[0];
  const website = host === "thelondonwash.com" || host === "www.thelondonwash.com";
  const st = await getSiteSettings();
  const base = st.seo.canonical.replace(/\/+$/, "") || "https://www.thelondonwash.com";
  const body =
    website && st.seo.indexing
      ? `User-agent: *\nAllow: /\nDisallow: /api/\n\nSitemap: ${base}/sitemap.xml\n`
      : `User-agent: *\nDisallow: /\n`;
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, s-maxage=600" } });
}
