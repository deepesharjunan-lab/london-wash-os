// Flat line icons for products in the POS, picked from the product name.
// 24x24 viewBox, drawn with stroke="currentColor" (no fills), so they take the
// tile's colour. Safe to import anywhere.

const ICONS: Record<string, string> = {
  shirt: '<path d="M8.5 3.5 12 6l3.5-2.5L20 6l-1.5 4-2-.8V20.5h-9V9.2l-2 .8L4 6z"/><path d="M12 6v14.5M10.5 3.8 12 6l1.5-2.2"/>',
  tshirt: '<path d="M8.5 4h7l4.5 2.5-1.8 3.5-2.2-1v11.5H8V9l-2.2 1L4 6.5z"/><path d="M9.5 4a2.5 2 0 0 0 5 0"/>',
  trouser: '<path d="M7 3.5h10l1 17h-4l-2-11-2 11H6z"/><path d="M7 6.5h10M12 6.5v3"/>',
  shorts: '<path d="M6 6h12l1.5 10h-5.5L12 11l-2 5H4.5z"/><path d="M6 8.5h12"/>',
  saree: '<path d="M6 3.5c3 1.5 5 4 5 8v9H6z"/><path d="M11 11.5c2.5-3 5-4.5 7-4.5v13.5h-7"/><path d="M6 17h12"/>',
  kurta: '<path d="M9 3.5h6l4 3-1.5 3-1.5-.8V20.5H8V8.7l-1.5.8L5 6.5z"/><path d="M12 3.5v5M10.5 8.5h3"/>',
  dress: '<path d="M9 3.5h6l-1 4 4.5 13h-13L10 7.5z"/><path d="M10 7.5h4"/>',
  skirt: '<path d="M8 5h8l3.5 15h-15z"/><path d="M8 7.5h8M10 7.5 9 20M14 7.5l1 12.5"/>',
  suit: '<path d="M8 3.5h8l3 3v14H5v-14z"/><path d="M8 3.5 12 10l4-6.5M12 10v10.5M9 13h1.5M13.5 13H15"/>',
  jacket: '<path d="M8.5 3.5h7L20 7l-1 13.5H5L4 7z"/><path d="M12 5v15.5M8.5 3.5 12 7l3.5-3.5M7.5 13.5h2M14.5 13.5h2"/>',
  sweater: '<path d="M8.5 4h7l4.5 3-1.5 5.5-2-1V20h-9v-8.5l-2 1L4 7z"/><path d="M10 4.2a2 1.5 0 0 0 4 0M8 17.5h8"/>',
  dhoti: '<rect x="4.5" y="5" width="15" height="14" rx="1"/><path d="M4.5 9h15M8 5v14M16 5v14"/>',
  bedsheet: '<path d="M3.5 17V9.5a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2V17"/><path d="M3.5 13.5h17M3.5 17v2.5M20.5 17v2.5M6.5 7.5v-2h4v2"/>',
  blanket: '<path d="M4 7h16v10.5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"/><path d="M4 11h16M4 15h16M7 4.5h10"/>',
  pillow: '<path d="M5 7c4-2 10-2 14 0 1.5 3.5 1.5 6.5 0 10-4 2-10 2-14 0-1.5-3.5-1.5-6.5 0-10z"/><path d="M8 10.5c2.5-.8 5.5-.8 8 0"/>',
  curtain: '<path d="M3.5 4h17M5 4v16c2-2 3-6 3-10V4M19 4v16c-2-2-3-6-3-10V4"/><path d="M8 13c1.5 1 6.5 1 8 0"/>',
  towel: '<rect x="6" y="3.5" width="12" height="17" rx="1.5"/><path d="M6 15.5h12M6 17.5h12M9 6.5h6"/>',
  shoe: '<path d="M3.5 15.5V9l4 .5 3 3.5 6 1.5c2.2.5 4 1.6 4 3.5v.5H3.5z"/><path d="M3.5 17.5h17M9 11l1.5-1.5M10.5 13l1.5-1.5"/>',
  helmet: '<path d="M4 15a8 8 0 0 1 16 0v1.5H4z"/><path d="M4 16.5h9.5l2 3H6"/><path d="M12 7v3.5"/>',
  toy: '<circle cx="7.5" cy="6.5" r="2"/><circle cx="16.5" cy="6.5" r="2"/><circle cx="12" cy="11" r="4.5"/><path d="M8.5 14.5 7 19.5h10l-1.5-5"/><path d="M10.5 11h.01M13.5 11h.01"/>',
  bag: '<path d="M5 8.5h14l-1 11.5H6z"/><path d="M9 8.5V6.5a3 3 0 0 1 6 0v2"/>',
  cap: '<path d="M4.5 15a7.5 7.5 0 0 1 15 0z"/><path d="M12 7.5V6M19.5 15h2.5"/>',
  tie: '<path d="M10 3.5h4l-.8 3 2.3 10L12 20.5l-3.5-4 2.3-10z"/><path d="M10.8 6.5h2.4"/>',
  socks: '<path d="M7 3.5h5v8l3.5 3.5a2.5 2.5 0 0 1-3.5 3.5L7 13.5z"/><path d="M7 6.5h5"/>',
  carpet: '<rect x="4" y="5" width="16" height="14" rx="1"/><rect x="7" y="8" width="10" height="8" rx=".5"/><path d="M4 7H2.5M4 12H2.5M4 17H2.5M20 7h1.5M20 12h1.5M20 17h1.5"/>',
  sofa: '<path d="M5 11V8a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v3"/><path d="M3.5 11.5a1.5 1.5 0 0 1 3 0V14h11v-2.5a1.5 1.5 0 0 1 3 0V18h-17z"/><path d="M5.5 18v1.5M18.5 18v1.5"/>',
  scarf: '<path d="M8 3.5c2 1.2 6 1.2 8 0l-1 6-2 11h-3l1-8z"/><path d="M8 3.5 9 9"/>',
  baby: '<path d="M8 4h8l3.5 3-2 2.5L16 8.5v5l1.5 6.5h-3L12 16l-2.5 4h-3L8 13.5v-5L6.5 9.5l-2-2.5z"/><path d="M10 4a2 1.5 0 0 0 4 0"/>',
  gloves: '<path d="M8 20.5v-4L5 11.5a1.3 1.3 0 0 1 2.2-1.4L9 12.5V5a1.2 1.2 0 0 1 2.4 0v5V4a1.2 1.2 0 0 1 2.4 0v6V5.5a1.2 1.2 0 0 1 2.4 0V16l-1 4.5z"/>',
  basket: '<path d="M3.5 9.5h17l-2 10.5h-13z"/><path d="M8 9.5 11 4M16 9.5 13 4M8.5 13v4M12 13v4M15.5 13v4"/>',
  iron: '<path d="M4 17.5h15.5a.5.5 0 0 0 .5-.5c0-4.5-3-7.5-8-7.5H8.5"/><path d="M4 17.5c0-3 1.5-6 4.5-8M10 6.5h6.5a1.5 1.5 0 0 1 1.5 1.5v1.5"/><path d="M8 13.5h.01M11 13.5h.01"/>',
  washer: '<rect x="4.5" y="3.5" width="15" height="17" rx="2"/><path d="M4.5 7.5h15M7.5 5.5h.01M10 5.5h3"/><circle cx="12" cy="14" r="4"/><path d="M9.5 14.5c1-.8 2-.8 3 0s2 .8 3 0"/>',
  sparkle: '<path d="M12 3.5c.6 3.8 2.7 5.9 6.5 6.5-3.8.6-5.9 2.7-6.5 6.5-.6-3.8-2.7-5.9-6.5-6.5 3.8-.6 5.9-2.7 6.5-6.5z"/><path d="M18.5 15.5v4M16.5 17.5h4"/>',
  hanger: '<path d="M12 7.5a1.8 1.8 0 1 0-1.8-1.8"/><path d="M12 7.5v1.5L3.5 15a1 1 0 0 0 .6 1.8h15.8a1 1 0 0 0 .6-1.8L12 9"/>',
};

// First match wins, so more specific words come before general ones.
const RULES: [RegExp, keyof typeof ICONS][] = [
  [/t[\s-]?shirt|tee\b|polo/i, "tshirt"],
  [/shirt|blouse/i, "shirt"],
  [/jeans|trouser|pant|pyjama|pajama|legging|track/i, "trouser"],
  [/shorts|bermuda/i, "shorts"],
  [/saree|sari\b/i, "saree"],
  [/kurt|churidar|salwar|kameez|top\b|tunic|nighty|night\s?dress/i, "kurta"],
  [/lehenga|skirt|ghagra/i, "skirt"],
  [/gown|frock|dress|abaya|burqa|burka/i, "dress"],
  [/suit|blazer|sherwani|waistcoat|coat\b|tuxedo/i, "suit"],
  [/jacket|hoodie|overcoat|raincoat/i, "jacket"],
  [/sweater|pullover|cardigan|jersey|woollen|woolen/i, "sweater"],
  [/dhoti|mundu|lungi|veshti|dupatta|stole|shawl|scarf|muffler/i, "scarf"],
  [/bed\s?sheet|bedspread|bed cover|mattress/i, "bedsheet"],
  [/blanket|quilt|comforter|duvet|razai|rajai|rug blanket/i, "blanket"],
  [/pillow|cushion/i, "pillow"],
  [/curtain|drape|blind/i, "curtain"],
  [/towel|napkin|kerchief|handkerchief/i, "towel"],
  [/shoe|sneaker|boot|sandal|slipper|chappal|footwear/i, "shoe"],
  [/helmet/i, "helmet"],
  [/toy|teddy|soft toy|doll/i, "toy"],
  [/bag|backpack|purse|handbag/i, "bag"],
  [/cap\b|hat\b|turban|topi/i, "cap"],
  [/\btie\b|bow\s?tie/i, "tie"],
  [/sock|stocking/i, "socks"],
  [/carpet|rug|mat\b|doormat|runner/i, "carpet"],
  [/sofa|couch|seat cover|chair/i, "sofa"],
  [/baby|infant|kid|child|romper|onesie/i, "baby"],
  [/glove/i, "gloves"],
  [/uniform|coverall|apron/i, "shirt"],
  [/table\s?cloth|linen|sheet/i, "dhoti"],
  [/\bkg\b|per kg|wash\s?&?\s?fold|laundry|load/i, "basket"],
];

/** SVG inner markup for a product's icon. Falls back to a hanger. */
export function garmentIcon(name: string | null | undefined, opts?: { serviceLevel?: boolean }): string {
  if (opts?.serviceLevel) return ICONS.basket;
  const n = name ?? "";
  for (const [re, key] of RULES) if (re.test(n)) return ICONS[key];
  return ICONS.hanger;
}

/** Icon for a service card, from the service name. */
export function serviceIcon(name: string | null | undefined): string {
  const n = name ?? "";
  if (/iron|press|starch|steam/i.test(n) && !/wash/i.test(n)) return ICONS.iron;
  if (/wash|laundry|fold/i.test(n)) return ICONS.washer;
  if (/dry\s?clean|dryclean/i.test(n)) return ICONS.hanger;
  if (/shoe/i.test(n)) return ICONS.shoe;
  if (/helmet/i.test(n)) return ICONS.helmet;
  if (/toy/i.test(n)) return ICONS.toy;
  if (/blanket|quilt/i.test(n)) return ICONS.blanket;
  if (/saree|rolling/i.test(n)) return ICONS.saree;
  if (/carpet|rug|sofa/i.test(n)) return ICONS.carpet;
  if (/deep|special|spl|premium/i.test(n)) return ICONS.sparkle;
  return ICONS.hanger;
}
