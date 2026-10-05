import { HOME_TEMPLATE, SITE_ICONS } from "./template";
import { WA_TEXT, esc, liteToHtml, type ServiceItem } from "./defs";
import type { SiteSettings } from "./settings";

// Turns the home page template + the CMS settings into the finished HTML.
// Markers are described in lib/site/defs.ts. Pure function, no database.

const BOOK = "https://club.thelondonwash.com/my/book";
const APP = "https://club.thelondonwash.com/my";

export function priceHtml(s: ServiceItem) {
  return s.price > 0
    ? `from <strong>&#8377;${Number(s.price).toLocaleString("en-IN")}</strong> <em>/ ${esc(s.unit)}</em>`
    : "<strong>Ask us</strong> <em>priced per garment</em>";
}

function serviceCard(s: ServiceItem, href?: string) {
  const icon = SITE_ICONS[s.icon] ?? SITE_ICONS.sparkle ?? "";
  const title = href ? `<a href="${href}" style="color:inherit;text-decoration:none">${esc(s.title)}</a>` : esc(s.title);
  return `        <article class="lw-service"><div class="lw-ico">${icon}</div><h3>${title}</h3><p>${esc(s.text)}</p><div class="lw-price">${priceHtml(s)}</div></article>`;
}

export function seoHead(st: SiteSettings) {
  const { seo, business: b, flags, pickup } = st;
  const t: string[] = [
    `<title>${esc(seo.title)}</title>`,
    `<meta name="description" content="${esc(seo.description)}">`,
    `<link rel="canonical" href="${esc(seo.canonical)}">`,
    `<meta name="robots" content="${seo.indexing ? "index, follow, max-image-preview:large" : "noindex, nofollow"}">`,
    `<meta property="og:type" content="website">`,
    `<meta property="og:site_name" content="The London Wash">`,
    `<meta property="og:locale" content="en_IN">`,
    `<meta property="og:title" content="${esc(seo.og_title || seo.title)}">`,
    `<meta property="og:description" content="${esc(seo.og_description || seo.description)}">`,
    `<meta property="og:url" content="${esc(seo.canonical)}">`,
    `<meta property="og:image" content="${esc(seo.og_image)}">`,
    `<meta name="twitter:card" content="summary_large_image">`,
  ];
  if (seo.google_verification.trim()) t.push(`<meta name="google-site-verification" content="${esc(seo.google_verification.trim())}">`);
  if (seo.bing_verification.trim()) t.push(`<meta name="msvalidate.01" content="${esc(seo.bing_verification.trim())}">`);
  if (seo.local_business) {
    const lat = Number(b.latitude), lng = Number(b.longitude);
    const geo = Number.isFinite(lat) && Number.isFinite(lng) ? { "@type": "GeoCoordinates", latitude: lat, longitude: lng } : undefined;
    const ld: Record<string, unknown> = {
      "@context": "https://schema.org",
      "@type": "DryCleaningOrLaundry",
      name: "The London Wash",
      alternateName: "The Art of Laundry Pvt Ltd",
      url: seo.canonical,
      logo: "https://www.thelondonwash.com/site/assets/logo-square.jpg",
      image: seo.og_image,
      slogan: "the art of laundry.",
      telephone: "+" + b.whatsapp.replace(/\D/g, ""),
      email: b.email,
      address: { "@type": "PostalAddress", streetAddress: b.street, addressLocality: b.city, addressRegion: "Kerala", postalCode: b.postcode, addressCountry: "IN" },
      geo,
      hasMap: b.map_link,
      sameAs: [b.instagram_url, b.facebook_url].filter(Boolean),
      openingHoursSpecification: [
        { "@type": "OpeningHoursSpecification", dayOfWeek: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"], opens: "09:00", closes: "21:00" },
        { "@type": "OpeningHoursSpecification", dayOfWeek: "Sunday", opens: "11:00", closes: "18:00" },
      ],
    };
    if (flags.pickup && geo) ld.areaServed = { "@type": "GeoCircle", geoMidpoint: geo, geoRadius: String(Math.round(pickup.radius_km * 1000)) };
    t.push(`<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, "\\u003c")}</script>`);
  }
  return t.join("\n");
}

export const validGtm = (id: string | undefined) => /^GTM-[A-Z0-9]{4,12}$/.test((id ?? "").trim());

/** Google Tag Manager and/or Google Analytics (gtag), as set in Website → SEO. */
function analytics(gaId: string, gtmId: string | undefined) {
  const out: string[] = [];
  if (validGtm(gtmId)) {
    const gtm = gtmId!.trim();
    out.push(
      `<script>(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','${gtm}');</script>`
    );
  }
  const g = gaId.trim();
  if (/^G-[A-Z0-9]{4,20}$/.test(g)) {
    out.push(`<script async src="https://www.googletagmanager.com/gtag/js?id=${g}"></script>
<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${g}');</script>`);
  }
  return out.join("\n");
}

/**
 * The finished page. Service pages (lib/site/pages.ts) reuse the home page's
 * header and footer: they pass their own main content and head tags.
 */
export function renderHome(st: SiteSettings, template = HOME_TEMPLATE, page?: { main: string; seo: string }): string {
  let html = template;
  if (page) {
    const start = html.indexOf('<main id="content" class="lw">');
    const end = html.indexOf("</main>");
    if (start >= 0 && end > start) html = html.slice(0, start) + '<main id="content" class="lw">\n' + page.main + "\n" + html.slice(end);
  }

  // Features (pickup on/off).
  for (const [flag, on] of Object.entries(st.flags)) {
    html = html.replace(new RegExp(`<!--if:${flag}-->([\\s\\S]*?)<!--/if:${flag}-->`, "g"), on ? "$1" : "");
    html = html.replace(new RegExp(`<!--ifnot:${flag}-->([\\s\\S]*?)<!--/ifnot:${flag}-->`, "g"), on ? "" : "$1");
  }
  // Sections switched off (repeated so sections inside sections, like the map, are handled too).
  for (let i = 0; i < 4 && /<!--section:/.test(html); i++) {
    html = html.replace(/<!--section:(\w+)-->([\s\S]*?)<!--\/section:\1-->/g, (_m, key: string, inner: string) => (st.sections[key] === false ? "" : inner));
  }
  // Services and prices.
  // Service cards link to their service page when there is one.
  const live = (st.pages ?? []).filter((p) => p.published);
  const pageFor = (title: string) => live.find((p) => p.service === title);
  html = html.replace(
    /<!--block:services-->[\s\S]*?<!--\/block:services-->/,
    st.services
      .filter((s) => !s.hidden)
      .map((s) => {
        const p = pageFor(s.title);
        return serviceCard(s, p ? `/services/${p.slug}` : undefined);
      })
      .join("\n")
  );
  html = html.replace(
    /<!--block:service_links-->[\s\S]*?<!--\/block:service_links-->/,
    live.length
      ? `      <p style="margin:18px 0 0;text-align:center;font-size:14px;line-height:1.9">More about: ${live
          .map((p) => `<a href="/services/${p.slug}" style="color:inherit;font-weight:600">${esc(p.nav_label)}</a>`)
          .join(" · ")}</p>`
      : ""
  );
  // Texts.
  html = html.replace(/<!--f:([\w.]+)-->([\s\S]*?)<!--\/f-->/g, (_m, key: string, def: string) => {
    const v = st.fields[key];
    return typeof v === "string" && v.trim() ? liteToHtml(v.trim()) : def;
  });
  // Head and tracking.
  html = html.replace(/<!--seo-->[\s\S]*?<!--\/seo-->/, page ? page.seo : seoHead(st));
  html = html.replace("<!--analytics-->", analytics(st.seo.ga_id, st.seo.gtm_id));
  if (validGtm(st.seo.gtm_id)) {
    html = html.replace(
      "<body>",
      `<body>\n<noscript><iframe src="https://www.googletagmanager.com/ns.html?id=${st.seo.gtm_id.trim()}" height="0" width="0" style="display:none;visibility:hidden"></iframe></noscript>`
    );
  }
  // Icons in content added at request time (service pages).
  html = html.replace(/<i data-i="(\w+)"><\/i>/g, (_m, k: string) => SITE_ICONS[k] ?? "");
  // On service pages the menu's #section links point back to the home page.
  if (page) html = html.replace(/href="#(?!content")/g, 'href="/#');

  // Business details.
  const b = st.business;
  const wa = `https://wa.me/${b.whatsapp.replace(/\D/g, "")}`;
  const tokens: Record<string, string> = {
    BOOK,
    APP,
    WA: `${wa}?text=${encodeURIComponent(st.flags.pickup ? WA_TEXT.pickup : WA_TEXT.general)}`,
    WAQUOTE: `${wa}?text=${encodeURIComponent(WA_TEXT.quote)}`,
    TEL: `tel:+${b.whatsapp.replace(/\D/g, "")}`,
    PHONE: esc(b.phone),
    EMAIL: esc(b.email),
    ADDRESS: esc(b.address),
    HOURS: esc(b.hours),
    HOURS_SHORT: esc(b.hours_short),
    MAPLINK: esc(b.map_link),
    REVIEW: esc(b.review_link),
    IG: esc(b.instagram_url),
    IG_HANDLE: esc(b.instagram_handle),
    FB: esc(b.facebook_url),
  };
  if (/^tel:\+?$/.test(tokens.TEL)) tokens.TEL = `tel:${b.phone.replace(/[^\d+]/g, "")}`;
  html = html.replace(/\{\{(\w+)\}\}/g, (m, k: string) => tokens[k] ?? m);

  // Tidy leftover markers and the blank lines they leave.
  html = html.replace(/<!--\/?(?:section|if|ifnot|block)(?::\w+)?-->/g, "").replace(/\n[ \t]*\n(?:[ \t]*\n)+/g, "\n\n");
  return html;
}
