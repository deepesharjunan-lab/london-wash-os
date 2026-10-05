import { HOME_TEMPLATE, SITE_ICONS } from "./template";
import { WA_TEXT, esc, liteToHtml, type ServiceItem } from "./defs";
import type { SiteSettings } from "./settings";

// Turns the home page template + the CMS settings into the finished HTML.
// Markers are described in lib/site/defs.ts. Pure function, no database.

const BOOK = "https://club.thelondonwash.com/my/book";
const APP = "https://club.thelondonwash.com/my";

function serviceCard(s: ServiceItem) {
  const icon = SITE_ICONS[s.icon] ?? SITE_ICONS.sparkle ?? "";
  const price =
    s.price > 0
      ? `from <strong>&#8377;${Number(s.price).toLocaleString("en-IN")}</strong> <em>/ ${esc(s.unit)}</em>`
      : "<strong>Ask us</strong> <em>priced per garment</em>";
  return `        <article class="lw-service"><div class="lw-ico">${icon}</div><h3>${esc(s.title)}</h3><p>${esc(s.text)}</p><div class="lw-price">${price}</div></article>`;
}

function seoHead(st: SiteSettings) {
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

function analytics(id: string) {
  if (!/^G-[A-Z0-9]{4,20}$/.test(id.trim())) return "";
  const g = id.trim();
  return `<script async src="https://www.googletagmanager.com/gtag/js?id=${g}"></script>
<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${g}');</script>`;
}

export function renderHome(st: SiteSettings, template = HOME_TEMPLATE): string {
  let html = template;

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
  html = html.replace(/<!--block:services-->[\s\S]*?<!--\/block:services-->/, st.services.filter((s) => !s.hidden).map(serviceCard).join("\n"));
  // Texts.
  html = html.replace(/<!--f:([\w.]+)-->([\s\S]*?)<!--\/f-->/g, (_m, key: string, def: string) => {
    const v = st.fields[key];
    return typeof v === "string" && v.trim() ? liteToHtml(v.trim()) : def;
  });
  // Head and tracking.
  html = html.replace(/<!--seo-->[\s\S]*?<!--\/seo-->/, seoHead(st));
  html = html.replace("<!--analytics-->", analytics(st.seo.ga_id));

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
