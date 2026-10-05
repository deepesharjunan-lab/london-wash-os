import Link from "next/link";
import { getSiteSettingsFresh } from "@/lib/site/settings";
import { renderHome } from "@/lib/site/render";
import { SeoForm, type PageFacts } from "./form";

// WEBSITE → SEO: how the site appears on Google and when shared, plus a checklist.

export const dynamic = "force-dynamic";

const strip = (s: string) => s.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&[#\w]+;/g, " ").replace(/\s+/g, " ").trim();

export default async function WebsiteSeoPage() {
  const st = await getSiteSettingsFresh();
  // Facts about the page as it is now, for the checklist.
  const html = renderHome(st);
  const body = html.slice(html.indexOf("<body"));
  const h1 = [...body.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/g)].map((m) => strip(m[1]));
  const h2 = [...body.matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>/g)].map((m) => strip(m[1]));
  const imgs = [...body.matchAll(/<img\b[^>]*>/g)].map((m) => m[0]);
  const text = strip(body.replace(/<script[\s\S]*?<\/script>/g, "").replace(/<svg[\s\S]*?<\/svg>/g, ""));
  const facts: PageFacts = {
    h1,
    h2,
    imagesWithoutAlt: imgs.filter((i) => !/\balt="[^"]+"/.test(i)).length,
    images: imgs.length,
    words: text.split(" ").filter(Boolean).length,
    text: text.toLowerCase().slice(0, 20000),
    hasPhone: !!st.business.phone,
    hasAddress: !!st.business.address,
  };

  return (
    <div>
      <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-accent">
        <Link href="/website" className="hover:underline">
          Website
        </Link>
      </div>
      <h1 className="mb-2 font-archivo text-2xl font-extrabold text-ink">SEO</h1>
      <p className="mb-6 max-w-3xl text-sm text-ink/60">
        How www.thelondonwash.com shows up on Google and when someone shares the link on WhatsApp or Facebook. The checklist on the right updates as you type.
      </p>
      <SeoForm initial={st.seo} facts={facts} />

      <section className="mt-8 max-w-3xl border-2 border-black/10 bg-white p-5 text-[13.5px] text-ink/75">
        <h2 className="mb-2 font-archivo text-lg font-bold text-ink">Get found on Google: one-time steps</h2>
        <ol className="list-decimal space-y-1.5 pl-5">
          <li>
            Open{" "}
            <a href="https://search.google.com/search-console" target="_blank" rel="noopener" className="text-accent underline">
              Google Search Console
            </a>
            , add the property <b>https://www.thelondonwash.com</b> (URL prefix) and choose the <b>HTML tag</b> method. Paste the code into “Google verification” above, save, then
            click Verify in Search Console.
          </li>
          <li>
            In Search Console → Sitemaps, submit <b>https://www.thelondonwash.com/sitemap.xml</b>.
          </li>
          <li>
            Keep your{" "}
            <a href="https://business.google.com/" target="_blank" rel="noopener" className="text-accent underline">
              Google Business Profile
            </a>{" "}
            in step with the business details here (same name, address, phone and hours). For a local business this matters more than anything else.
          </li>
          <li>Ask happy customers for Google reviews (the WhatsApp rating already does this) and add new photos to the Business Profile now and then.</li>
        </ol>
        <p className="mt-3 text-[12.5px] text-ink/50">
          Files Google reads:{" "}
          <a href="https://www.thelondonwash.com/sitemap.xml" target="_blank" rel="noopener" className="underline">
            sitemap.xml
          </a>{" "}
          ·{" "}
          <a href="https://www.thelondonwash.com/robots.txt" target="_blank" rel="noopener" className="underline">
            robots.txt
          </a>
        </p>
      </section>
    </div>
  );
}
