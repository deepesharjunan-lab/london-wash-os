import { esc, liteToHtml } from "./defs";
import { priceHtml, renderHome } from "./render";
import type { SiteSettings } from "./settings";
import type { ServicePage } from "./pages-defaults";

// Service pages: www.thelondonwash.com/services/<slug>. Same header, footer,
// switches and business details as the home page (renderHome), with their own
// content and head tags (title, description, canonical, Service + FAQ + breadcrumb
// details for Google). Pure function, no database.

const paragraphs = (s: string) =>
  s
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p class="lw-lead" style="margin:0 0 14px">${liteToHtml(p).replace(/\n/g, "<br>")}</p>`)
    .join("");

const base = (st: SiteSettings) => st.seo.canonical.replace(/\/+$/, "") || "https://www.thelondonwash.com";

function pageSeo(st: SiteSettings, p: ServicePage) {
  const url = `${base(st)}/services/${p.slug}`;
  const b = st.business;
  const svc = st.services.find((s) => s.title === p.service);
  const ld: unknown[] = [
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: `${base(st)}/` },
        { "@type": "ListItem", position: 2, name: p.nav_label, item: url },
      ],
    },
    {
      "@context": "https://schema.org",
      "@type": "Service",
      name: p.h1,
      serviceType: p.nav_label,
      description: p.seo_description || p.intro,
      url,
      areaServed: { "@type": "City", name: b.city || "Pathanamthitta" },
      provider: {
        "@type": "DryCleaningOrLaundry",
        name: "The London Wash",
        url: `${base(st)}/`,
        telephone: "+" + b.whatsapp.replace(/\D/g, ""),
        address: { "@type": "PostalAddress", streetAddress: b.street, addressLocality: b.city, addressRegion: "Kerala", postalCode: b.postcode, addressCountry: "IN" },
      },
      ...(svc && svc.price > 0 ? { offers: { "@type": "Offer", priceCurrency: "INR", price: String(svc.price), description: `From ₹${svc.price} per ${svc.unit}` } } : {}),
    },
  ];
  if (p.faq.length) {
    ld.push({
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: p.faq.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
    });
  }
  const index = st.seo.indexing && p.published;
  return [
    `<title>${esc(p.seo_title || `${p.h1} | The London Wash`)}</title>`,
    `<meta name="description" content="${esc(p.seo_description || p.intro.slice(0, 155))}">`,
    `<link rel="canonical" href="${esc(url)}">`,
    `<meta name="robots" content="${index ? "index, follow, max-image-preview:large" : "noindex, nofollow"}">`,
    `<meta property="og:type" content="website">`,
    `<meta property="og:site_name" content="The London Wash">`,
    `<meta property="og:locale" content="en_IN">`,
    `<meta property="og:title" content="${esc(p.seo_title || p.h1)}">`,
    `<meta property="og:description" content="${esc(p.seo_description || p.intro)}">`,
    `<meta property="og:url" content="${esc(url)}">`,
    `<meta property="og:image" content="${esc(st.seo.og_image)}">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    ...ld.map((x) => `<script type="application/ld+json">${JSON.stringify(x).replace(/</g, "\\u003c")}</script>`),
  ].join("\n");
}

function pageMain(st: SiteSettings, p: ServicePage) {
  const svc = st.services.find((s) => s.title === p.service && !s.hidden);
  const others = st.pages.filter((x) => x.published && x.slug !== p.slug);
  const sections = p.sections
    .filter((s) => s.heading.trim() || s.body.trim())
    .map((s) => `<div style="margin:0 0 34px">${s.heading.trim() ? `<h2 class="lw-h2" style="font-size:clamp(22px,3vw,30px);margin:0 0 12px">${esc(s.heading)}</h2>` : ""}${paragraphs(s.body)}</div>`)
    .join("\n");
  const faq = p.faq.filter((f) => f.q.trim() && f.a.trim());

  return `
  <section class="lw-hero" id="top" style="padding-bottom:90px">
    <div class="lw-pattern"></div>
    <div class="lw-wrap" style="position:relative;max-width:860px">
      <nav aria-label="Breadcrumb" style="font-size:13px;opacity:.75;margin-bottom:14px"><a href="/" style="color:inherit">Home</a> › <a href="/#services" style="color:inherit">Services</a> › ${esc(p.nav_label)}</nav>
      <span class="lw-eyebrow">${esc(p.eyebrow || p.nav_label)}</span>
      <h1>${liteToHtml(p.h1)}</h1>
      <p class="lw-lead">${liteToHtml(p.intro)}</p>
      ${svc ? `<p style="margin:6px 0 22px;font-size:16px">${esc(svc.title)} ${priceHtml(svc)}</p>` : ""}
      <div class="lw-hero-actions">
        <a class="lw-btn lw-btn-saffron" href="{{WAQUOTE}}" target="_blank" rel="noopener"><i data-i="whatsapp"></i>WhatsApp us</a>
        <!--if:pickup--><a class="lw-btn lw-btn-ghost" href="{{BOOK}}">Book a pickup</a><!--/if:pickup-->
        <!--ifnot:pickup--><a class="lw-btn lw-btn-ghost" href="{{MAPLINK}}" target="_blank" rel="noopener">Get directions</a><!--/ifnot:pickup-->
      </div>
    </div>
    <div class="lw-wave" aria-hidden="true"><svg viewBox="0 0 1440 130" preserveAspectRatio="none"><path fill="#ffffff" d="M0 70c180 40 360 60 540 45s360-70 540-75 270 30 360 50v65H0z"/></svg></div>
  </section>

  <section class="lw-section">
    <div class="lw-wrap" style="max-width:860px">
${sections}
    </div>
  </section>
${
  faq.length
    ? `
  <section class="lw-section lw-services">
    <div class="lw-wrap" style="max-width:860px">
      <div class="lw-section-head"><span class="lw-eyebrow">Questions</span><h2 class="lw-h2">Frequently asked questions</h2></div>
      ${faq
        .map(
          (f) =>
            `<details style="background:#fff;border-radius:14px;padding:16px 20px;margin:0 0 10px;box-shadow:0 1px 0 rgba(0,0,0,.04)"><summary style="cursor:pointer;font-weight:700;font-size:16px">${esc(f.q)}</summary><p style="margin:10px 0 0;line-height:1.6">${liteToHtml(f.a)}</p></details>`
        )
        .join("\n      ")}
    </div>
  </section>`
    : ""
}

  <section class="lw-section lw-book">
    <div class="lw-wrap">
      <div class="lw-book-panel">
        <div class="lw-pattern"></div>
        <div>
          <span class="lw-eyebrow" style="color:var(--lw-elephant)">Visit or message us</span>
          <h2 class="lw-h2">The London Wash, Vettipuram</h2>
          <p style="white-space:pre-line">{{ADDRESS}}
{{HOURS_SHORT}}</p>
        </div>
        <div class="lw-book-actions">
          <a class="lw-btn lw-btn-wa" href="{{WA}}" target="_blank" rel="noopener"><i data-i="whatsapp"></i>WhatsApp us</a>
          <a class="lw-btn lw-btn-ghost-dark" href="{{TEL}}"><i data-i="phone"></i>Call {{PHONE}}</a>
          <a class="lw-btn lw-btn-dark" href="{{MAPLINK}}" target="_blank" rel="noopener"><i data-i="pin"></i>Get directions</a>
        </div>
      </div>
${
  others.length
    ? `      <p style="margin:26px 0 0;text-align:center;font-size:14px;line-height:1.9">Other services: ${others
        .map((o) => `<a href="/services/${o.slug}" style="color:inherit;font-weight:600">${esc(o.nav_label)}</a>`)
        .join(" · ")} · <a href="/#services" style="color:inherit;font-weight:600">All prices</a></p>`
    : ""
}
    </div>
  </section>`;
}

/** A published service page, or null. `preview` also renders unpublished pages (for the CMS). */
export function renderServicePage(st: SiteSettings, slug: string, preview = false): string | null {
  const p = st.pages.find((x) => x.slug === slug);
  if (!p || (!p.published && !preview)) return null;
  return renderHome(st, undefined, { main: pageMain(st, p), seo: pageSeo(st, p) });
}

export function renderNotFound(st: SiteSettings): string {
  const links = st.pages
    .filter((p) => p.published)
    .map((p) => `<a href="/services/${p.slug}" style="color:inherit;font-weight:600">${esc(p.nav_label)}</a>`)
    .join(" · ");
  const main = `
  <section class="lw-section" style="padding-top:140px">
    <div class="lw-wrap" style="max-width:760px;text-align:center">
      <h1 class="lw-h2">Page not found</h1>
      <p class="lw-lead">That page doesn't exist. Try the <a href="/" style="color:inherit;font-weight:600">home page</a>${links ? ` or one of our services: ${links}` : ""}.</p>
    </div>
  </section>`;
  return renderHome(st, undefined, { main, seo: `<title>Page not found | The London Wash</title>\n<meta name="robots" content="noindex">` });
}
