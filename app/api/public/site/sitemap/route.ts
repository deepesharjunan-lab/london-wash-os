import { getSiteSettings } from "@/lib/site/settings";

// www.thelondonwash.com/sitemap.xml (rewritten here by middleware.ts).

export const dynamic = "force-dynamic";

export async function GET() {
  const st = await getSiteSettings();
  const base = st.seo.canonical.replace(/\/+$/, "") || "https://www.thelondonwash.com";
  const lastmod = (st.updatedAt ?? new Date().toISOString()).slice(0, 10);
  const pages = st.seo.indexing ? [{ loc: `${base}/`, pri: "1.0", lastmod }, { loc: `${base}/privacy`, pri: "0.3", lastmod: "2026-10-04" }] : [];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${pages.map((p) => `  <url><loc>${p.loc}</loc><lastmod>${p.lastmod}</lastmod><priority>${p.pri}</priority></url>`).join("\n")}
</urlset>
`;
  return new Response(xml, { headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, s-maxage=600" } });
}
