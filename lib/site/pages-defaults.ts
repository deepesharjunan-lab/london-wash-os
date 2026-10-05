// Website CMS: service pages (www.thelondonwash.com/services/<slug>).
// Each page targets one search, e.g. "dry cleaning Pathanamthitta". These are the
// starting pages; the owner edits, adds, hides or deletes them in Website → Service pages.
// Pure data, safe for client components.

export type PageSection = { heading: string; body: string };
export type PageFaq = { q: string; a: string };
export type ServicePage = {
  slug: string; // URL part: lowercase letters, numbers and dashes
  published: boolean;
  nav_label: string; // short name for links ("Dry cleaning")
  service: string; // which service card the price comes from (title in Services & prices)
  eyebrow: string;
  h1: string;
  intro: string;
  sections: PageSection[];
  faq: PageFaq[];
  seo_title: string;
  seo_description: string;
};

export const DEFAULT_PAGES: ServicePage[] = [
  {
    slug: "dry-cleaning",
    published: true,
    nav_label: "Dry cleaning",
    service: "Dry Cleaning",
    eyebrow: "Dry cleaning",
    h1: "Dry cleaning in Pathanamthitta",
    intro:
      "Suits, sarees, silks, woollens, blazers and party wear, dry cleaned with care at our Vettipuram store. Every garment is tagged, checked for stains and hand finished before it goes back to you.",
    sections: [
      {
        heading: "What we dry clean",
        body: "Suits and blazers, sarees and silk, lehengas and party wear, woollens and sweaters, jackets, school and office uniforms, curtains and anything with a “dry clean only” label. Not sure about a garment? Send us a photo on WhatsApp and we will tell you the best way to clean it.",
      },
      {
        heading: "How we look after your clothes",
        body: "Each piece gets its own tag, so nothing goes missing. We check pockets, buttons and stains when you drop off, choose the right process for the fabric, treat stains before cleaning and press by hand. You get WhatsApp updates as your order moves along, and a message when it is ready.",
      },
      {
        heading: "Prices you can see before we start",
        body: "Dry cleaning starts from the price shown on this page. The final price depends on the garment and fabric, and you see it on your bill before we begin. Every order also earns London Wash Club points you can use on your next bill.",
      },
    ],
    faq: [
      { q: "How long does dry cleaning take?", a: "Most garments are ready in 2 to 4 working days. Ask us if you need something sooner and we will do our best." },
      { q: "Can you remove old or tough stains?", a: "We treat every stain before cleaning. Many old stains come out; some can only be lightened. We will tell you honestly when you drop off." },
      { q: "Is dry cleaning safe for silk and zari work?", a: "Yes. Delicate fabrics and zari or embroidery are cleaned on gentle settings and hand finished." },
      { q: "Where is your store?", a: "Near Kerala PSC Office, Thazhe, Vettipuram, Pathanamthitta. Open Monday to Saturday 9 AM to 9 PM and Sunday 11 AM to 6 PM." },
    ],
    seo_title: "Dry Cleaning in Pathanamthitta | The London Wash",
    seo_description: "Dry cleaning for suits, sarees, silks and woollens in Pathanamthitta. Tagged, stain-treated and hand finished. Rated 4.9 on Google. WhatsApp +91 85900 00868.",
  },
  {
    slug: "wash-and-iron",
    published: true,
    nav_label: "Wash & iron",
    service: "Wash & Ironing",
    eyebrow: "Laundry",
    h1: "Laundry: wash & iron in Pathanamthitta",
    intro:
      "Your everyday clothes washed, ironed and returned on hangers or neatly folded. Pay per piece, or by weight for the whole family's weekly laundry.",
    sections: [
      {
        heading: "Per piece or by kg",
        body: "Choose wash & iron per piece for shirts, trousers, kurtas and office wear, or wash & iron by kg for a full weekly load. We also do wash & fold for home wear, towels and bed linen.",
      },
      {
        heading: "Washed the right way",
        body: "Whites and colours are washed separately at the right temperature, with detergents that are kind to fabric. Clothes are dried properly, ironed crisp and folded or hung, ready to wear.",
      },
      {
        heading: "Tagged, tracked and on time",
        body: "Every piece is tagged so nothing gets mixed up, and you get a WhatsApp message when your laundry is ready to collect.",
      },
    ],
    faq: [
      { q: "What is the difference between per piece and by kg?", a: "Per piece is best for a few office clothes. By kg works out cheaper for a big family load of everyday clothes." },
      { q: "Do you wash whites separately?", a: "Yes. Whites and colours are always washed separately." },
      { q: "Can I get clothes folded instead of on hangers?", a: "Yes, just tell us when you drop off." },
    ],
    seo_title: "Laundry Service in Pathanamthitta | Wash & Iron | The London Wash",
    seo_description: "Laundry in Pathanamthitta: wash & iron per piece or by kg, wash & fold for linen. Tagged, ironed crisp and ready on time. WhatsApp +91 85900 00868.",
  },
  {
    slug: "saree-silk-care",
    published: true,
    nav_label: "Saree & silk care",
    service: "Dry Cleaning",
    eyebrow: "Saree & silk care",
    h1: "Saree and silk dry cleaning in Pathanamthitta",
    intro:
      "Kanchipuram, Kasavu, Banarasi, silk and designer sarees, cleaned gently and pressed by hand so the fall, colour and zari stay beautiful.",
    sections: [
      {
        heading: "Gentle care for precious sarees",
        body: "Silk and zari need a light touch. We check every saree for stains and loose threads, clean it with fabric-safe dry cleaning, and press it by hand with the pleats and pallu in mind.",
      },
      {
        heading: "Wedding and festival wear",
        body: "Bridal sarees, lehengas, set mundu, kasavu and festival wear are welcome. Send us a photo on WhatsApp for heavy work or very old pieces and we will advise before you drop off.",
      },
      {
        heading: "Stored and returned with care",
        body: "Sarees come back folded and wrapped, ready to store or wear.",
      },
    ],
    faq: [
      { q: "Will dry cleaning damage the zari?", a: "No. Zari and embroidery are cleaned on gentle settings and finished by hand." },
      { q: "Can you clean a Kasavu saree or set mundu?", a: "Yes, we clean and press Kasavu sarees and set mundu regularly." },
      { q: "How do I get a price for a bridal saree?", a: "Send a photo on WhatsApp to +91 85900 00868 and we will quote it." },
    ],
    seo_title: "Saree & Silk Dry Cleaning in Pathanamthitta | The London Wash",
    seo_description: "Saree and silk dry cleaning in Pathanamthitta: Kanchipuram, Kasavu, bridal and zari work, cleaned gently and pressed by hand. WhatsApp +91 85900 00868.",
  },
  {
    slug: "ironing",
    published: true,
    nav_label: "Ironing & starch",
    service: "Starch Iron",
    eyebrow: "Ironing",
    h1: "Ironing and starch press in Pathanamthitta",
    intro:
      "Crisp, professional ironing for clothes you have already washed, starch press for cottons and mundus, and express ironing when you need it today.",
    sections: [
      {
        heading: "Ironing, express and starch",
        body: "Ironing only for washed clothes, express ironing with priority turnaround, and starch iron for a sharp finish on cotton shirts, sarees and mundus. Ironing by kg is available for a full bag.",
      },
      {
        heading: "The right heat for every fabric",
        body: "Cottons, linens, synthetics and blends are pressed at the right temperature, so nothing shines or scorches.",
      },
    ],
    faq: [
      { q: "Can I get ironing done the same day?", a: "Yes, choose express ironing and ask at the counter for today's ready time." },
      { q: "Do you starch mundus and cotton sarees?", a: "Yes, starch iron gives cottons and mundus a crisp, sharp finish." },
    ],
    seo_title: "Ironing & Starch Press in Pathanamthitta | The London Wash",
    seo_description: "Ironing in Pathanamthitta: press-only, express ironing and starch iron for cottons and mundus, by piece or by kg. WhatsApp +91 85900 00868.",
  },
  {
    slug: "shoe-cleaning",
    published: true,
    nav_label: "Shoe cleaning",
    service: "Shoe Cleaning",
    eyebrow: "Shoe care",
    h1: "Shoe cleaning in Pathanamthitta",
    intro: "Sneakers, sports shoes, leather and suede, deep cleaned, deodorised and restored. We also clean helmets and soft toys.",
    sections: [
      {
        heading: "Sneakers, leather and suede",
        body: "Each pair is cleaned inside and out with methods made for its material: gentle brushing for suede, conditioning for leather, and a deep clean for canvas and sports shoes. Laces are washed and soles scrubbed.",
      },
      {
        heading: "Fresh inside too",
        body: "Shoes are deodorised and dried properly, so they come back fresh, not just clean on the outside.",
      },
      {
        heading: "Helmets and soft toys",
        body: "Helmet inner padding is washed and sanitised and the shell cleaned and polished. Soft toys are gently washed and sanitised, safe for little ones.",
      },
    ],
    faq: [
      { q: "How long does shoe cleaning take?", a: "Usually 2 to 4 days, depending on the material and how much drying is needed." },
      { q: "Can you clean white sneakers?", a: "Yes, white sneakers are one of the most common pairs we clean." },
    ],
    seo_title: "Shoe Cleaning in Pathanamthitta | Sneakers & Leather | The London Wash",
    seo_description: "Shoe cleaning in Pathanamthitta for sneakers, leather and suede: deep cleaned, deodorised and restored. Helmet and soft toy cleaning too. WhatsApp +91 85900 00868.",
  },
  {
    slug: "blanket-quilt-cleaning",
    published: true,
    nav_label: "Blankets & quilts",
    service: "Blankets & Quilts",
    eyebrow: "Home linen",
    h1: "Blanket and quilt cleaning in Pathanamthitta",
    intro: "Blankets, quilts, comforters, duvets and bed linen deep washed and properly dried, so they are fresh, soft and ready for the season.",
    sections: [
      {
        heading: "Big items, washed properly",
        body: "Heavy blankets and quilts are hard to wash and dry at home. We deep wash them in large machines and dry them fully, so there is no damp smell.",
      },
      {
        heading: "Curtains and linen too",
        body: "Bed sheets, pillow covers, towels and curtains can be washed and folded. For heavy curtains or carpets, send us a photo on WhatsApp for a quote.",
      },
    ],
    faq: [
      { q: "Can you wash a double quilt or duvet?", a: "Yes, quilts, comforters and duvets of all sizes." },
      { q: "Do you clean curtains and carpets?", a: "Curtains, yes. For carpets and heavy items, send a photo on WhatsApp and we will quote." },
    ],
    seo_title: "Blanket & Quilt Cleaning in Pathanamthitta | The London Wash",
    seo_description: "Blanket, quilt, comforter and duvet cleaning in Pathanamthitta: deep washed and fully dried. Curtains and bed linen too. WhatsApp +91 85900 00868.",
  },
];

export const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
