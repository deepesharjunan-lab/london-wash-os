// Fields a WhatsApp template can contain. In the template builder staff pick
// one of these for each {{1}}, {{2}} …; campaigns and automations later fill
// them in per customer. Keep keys stable: they are saved with each template.
// Safe to import from client components (no server code here).

export type EngageVariable = { key: string; label: string; example: string; hint?: string };

export const ENGAGE_VARIABLES: EngageVariable[] = [
  { key: "first_name", label: "Customer first name", example: "Anu" },
  { key: "full_name", label: "Customer full name", example: "Anu Mathew" },
  { key: "points", label: "Club points balance", example: "1,250" },
  { key: "tier", label: "Club tier", example: "Signature" },
  { key: "last_order_number", label: "Last order number", example: "LW-1024" },
  { key: "last_order_date", label: "Last order date", example: "12 Sep" },
  { key: "order_number", label: "Order number (automations)", example: "LW-1031", hint: "Filled from the order that triggered an automation" },
  { key: "order_total", label: "Order total (automations)", example: "₹640" },
  { key: "balance_due", label: "Balance due on the order (automations)", example: "₹240" },
  { key: "invoice_link", label: "Invoice link code (automations)", example: "a1b2c3", hint: "Use as the end of a URL button" },
  { key: "pickup_time", label: "Pickup time (automations)", example: "Sat 4 Oct, 10 am" },
  { key: "expiring_points", label: "Points about to expire", example: "300" },
  { key: "expiry_date", label: "Points expiry date", example: "31 Oct" },
  { key: "coupon_code", label: "Coupon code (set per campaign)", example: "DIWALI20" },
  { key: "offer_text", label: "Offer text (set per campaign)", example: "20% off dry cleaning" },
  { key: "store_phone", label: "Store phone", example: "+91 85900 00868" },
];

export const variableByKey = (key: string) => ENGAGE_VARIABLES.find((v) => v.key === key);

export const TEMPLATE_LANGUAGES = [
  { code: "en", label: "English" },
  { code: "ml", label: "Malayalam" },
  { code: "hi", label: "Hindi" },
];

/** Meta's rules for template names: lowercase letters, numbers and underscores. */
export const slugTemplateName = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60);

/** Turns named placeholders like {{first_name}} into Meta's {{1}}, {{2}} … (in order of first use). */
export function toPositional(text: string, known: string[] = []) {
  const order: string[] = [...known];
  const out = text.replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (_m, key: string) => {
    let i = order.indexOf(key);
    if (i === -1) {
      order.push(key);
      i = order.length - 1;
    }
    return `{{${i + 1}}}`;
  });
  return { text: out, keys: order };
}
