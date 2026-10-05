// ENGAGE → Automations: what can start an automation, the checks made just
// before sending, and ready-made recipes. Pure data, safe for client components.

export type TriggerKey = "order_placed" | "order_ready" | "out_for_delivery" | "order_delivered" | "pickup_booked" | "winback" | "birthday" | "points_expiring";
export type ConditionKey = "none" | "balance_due" | "not_collected" | "no_new_order";

export type TriggerDef = {
  key: TriggerKey;
  label: string;
  kind: "event" | "daily";
  help: string;
  daysLabel?: string; // daily triggers: what trigger_days means
  defaultDays?: number;
  fields: string[]; // extra fields this trigger can fill (besides the customer ones)
  order?: boolean; // the event is about one order
};

export const TRIGGERS: TriggerDef[] = [
  { key: "order_placed", label: "Order placed", kind: "event", help: "When an order is created at the counter or in the console.", fields: ["order_number", "order_total", "balance_due", "invoice_link"], order: true },
  { key: "order_ready", label: "Order ready", kind: "event", help: "When an order is finished and packed.", fields: ["order_number", "order_total", "balance_due", "invoice_link"], order: true },
  { key: "out_for_delivery", label: "Out for delivery", kind: "event", help: "When a driver starts the delivery.", fields: ["order_number", "order_total", "balance_due", "invoice_link"], order: true },
  { key: "order_delivered", label: "Order delivered / collected", kind: "event", help: "When an order is delivered or handed over at the counter.", fields: ["order_number", "order_total", "balance_due", "invoice_link"], order: true },
  { key: "pickup_booked", label: "Pickup booked", kind: "event", help: "When a customer books a pickup in the Club app.", fields: ["pickup_time"] },
  { key: "winback", label: "No order for a while", kind: "daily", help: "Once, when a customer's last order passes this many days.", daysLabel: "days since the last order", defaultDays: 45, fields: [] },
  { key: "birthday", label: "Birthday", kind: "daily", help: "Once a year, before or on the customer's birthday (needs a birthday saved).", daysLabel: "days before the birthday (0 = on the day)", defaultDays: 0, fields: [] },
  { key: "points_expiring", label: "Club points about to expire", kind: "daily", help: "When some of a member's points expire within this many days.", daysLabel: "days before the points expire", defaultDays: 7, fields: ["expiring_points", "expiry_date"] },
];
export const triggerByKey = (k: string) => TRIGGERS.find((t) => t.key === k);

export const CONDITIONS: { key: ConditionKey; label: string; orderOnly?: boolean }[] = [
  { key: "none", label: "Always send" },
  { key: "balance_due", label: "Only if a balance is still due on the order", orderOnly: true },
  { key: "not_collected", label: "Only if the order is still waiting to be collected (status Ready)", orderOnly: true },
  { key: "no_new_order", label: "Only if the customer hasn't placed a new order since" },
];

/** Fields an automation fills from the event (order, pickup, points). */
export const CONTEXT_FIELDS = new Set(["order_number", "order_total", "balance_due", "invoice_link", "pickup_time", "expiring_points", "expiry_date"]);

export const QUIET_START = 21; // 9 pm India time
export const QUIET_END = 9; // 9 am

export function describeDelay(minutes: number) {
  if (!minutes) return "straight away";
  if (minutes % 1440 === 0) return `${minutes / 1440} day${minutes === 1440 ? "" : "s"} later`;
  if (minutes % 60 === 0) return `${minutes / 60} hour${minutes === 60 ? "" : "s"} later`;
  return `${minutes} min later`;
}

export function describeWhen(a: { trigger: string; delay_minutes: number; trigger_days: number }) {
  const t = triggerByKey(a.trigger);
  if (!t) return a.trigger;
  if (t.kind === "event") return `${t.label} → ${describeDelay(a.delay_minutes)}`;
  if (t.key === "winback") return `${a.trigger_days} days after the last order`;
  if (t.key === "birthday") return a.trigger_days ? `${a.trigger_days} days before the birthday` : "On the birthday";
  return `${a.trigger_days} days before points expire`;
}

// Ready-made automations. Recipes that use a new template carry its text, so
// the console can create the template in one click (named {{fields}}, like the builder).
export type RecipeTemplate = {
  name: string;
  category: "MARKETING" | "UTILITY";
  body: string;
  footer: string;
  buttons: { type: "URL"; text: string; url: string; urlVariable?: string }[];
};
export type Recipe = {
  key: string;
  title: string;
  blurb: string;
  trigger: TriggerKey;
  delay_minutes?: number;
  trigger_days?: number;
  condition?: ConditionKey;
  respect_quiet: boolean;
  cooldown_days?: number;
  template: string; // template name
  newTemplate?: RecipeTemplate; // when the template must be created first
};

const FOOTER = "The London Wash · the art of laundry.";

export const RECIPES: Recipe[] = [
  {
    key: "invoice",
    title: "Invoice after every order",
    blurb: "Thanks the customer and sends a link to their private online invoice.",
    trigger: "order_placed",
    delay_minutes: 2,
    respect_quiet: false,
    template: "lw_invoice",
    newTemplate: {
      name: "lw_invoice",
      category: "UTILITY",
      body: "Hi {{first_name}}, thank you for choosing The London Wash. We have received your order {{order_number}} for {{order_total}}. Tap below to see your invoice.",
      footer: FOOTER,
      buttons: [{ type: "URL", text: "View invoice", url: "https://club.thelondonwash.com/i/", urlVariable: "invoice_link" }],
    },
  },
  { key: "ready", title: "Order ready", blurb: "Tells the customer their order is cleaned, packed and ready.", trigger: "order_ready", respect_quiet: false, template: "lw_order_ready" },
  { key: "out", title: "Out for delivery", blurb: "Lets the customer know the driver is on the way.", trigger: "out_for_delivery", respect_quiet: false, template: "lw_out_for_delivery" },
  { key: "delivered", title: "Delivered, thank you", blurb: "Thanks the customer once the order is delivered.", trigger: "order_delivered", respect_quiet: false, template: "lw_order_delivered" },
  { key: "pickup", title: "Pickup confirmation", blurb: "Confirms the pickup time when a customer books in the app.", trigger: "pickup_booked", respect_quiet: false, template: "lw_pickup_booked" },
  {
    key: "collect",
    title: "Reminder to collect",
    blurb: "If an order is still waiting at the store 3 days after it was ready.",
    trigger: "order_ready",
    delay_minutes: 3 * 1440,
    condition: "not_collected",
    respect_quiet: true,
    template: "lw_collect_reminder",
    newTemplate: {
      name: "lw_collect_reminder",
      category: "UTILITY",
      body: "Hi {{first_name}}, a friendly reminder that your order {{order_number}} is ready and waiting for you at our Vettipuram store. Reply here if you would like us to deliver it.",
      footer: FOOTER,
      buttons: [{ type: "URL", text: "View invoice", url: "https://club.thelondonwash.com/i/", urlVariable: "invoice_link" }],
    },
  },
  {
    key: "unpaid",
    title: "Payment reminder",
    blurb: "2 days after delivery, only if a balance is still due.",
    trigger: "order_delivered",
    delay_minutes: 2 * 1440,
    condition: "balance_due",
    respect_quiet: true,
    template: "lw_payment_reminder",
    newTemplate: {
      name: "lw_payment_reminder",
      category: "UTILITY",
      body: "Hi {{first_name}}, a balance of {{balance_due}} is still due on your London Wash order {{order_number}}. You can pay at the store or by UPI. Thank you!",
      footer: FOOTER,
      buttons: [{ type: "URL", text: "View invoice", url: "https://club.thelondonwash.com/i/", urlVariable: "invoice_link" }],
    },
  },
  {
    key: "review",
    title: "Ask for a Google review",
    blurb: "The day after delivery, asks happy customers to review you on Google.",
    trigger: "order_delivered",
    delay_minutes: 1440,
    respect_quiet: true,
    cooldown_days: 60,
    template: "lw_review_request",
    newTemplate: {
      name: "lw_review_request",
      category: "MARKETING",
      body: "Hi {{first_name}}, we hope you loved how your clothes came back from The London Wash. Could you spare a minute to review us on Google? It really helps a local business. Reply STOP to unsubscribe.",
      footer: FOOTER,
      buttons: [{ type: "URL", text: "Write a review", url: "https://g.page/r/CTraiq6EbHBIEBM/review" }],
    },
  },
  {
    key: "reorder",
    title: "Time for the next wash",
    blurb: "21 days after delivery, if the customer hasn't ordered again.",
    trigger: "order_delivered",
    delay_minutes: 21 * 1440,
    condition: "no_new_order",
    respect_quiet: true,
    template: "lw_reorder_nudge",
    newTemplate: {
      name: "lw_reorder_nudge",
      category: "MARKETING",
      body: "Hi {{first_name}}, ready for your next wash? Book a free pickup and The London Wash will take care of the rest. Reply STOP to unsubscribe.",
      footer: FOOTER,
      buttons: [{ type: "URL", text: "Book a pickup", url: "https://club.thelondonwash.com/my/book" }],
    },
  },
  {
    key: "winback",
    title: "We miss you (win-back)",
    blurb: "Once, when a customer hasn't ordered for 45 days.",
    trigger: "winback",
    trigger_days: 45,
    respect_quiet: true,
    template: "lw_we_miss_you",
    newTemplate: {
      name: "lw_we_miss_you",
      category: "MARKETING",
      body: "Hi {{first_name}}, it has been a while since we last cared for your clothes. Book a pickup this week and let The London Wash make them look their best again. Reply STOP to unsubscribe.",
      footer: FOOTER,
      buttons: [{ type: "URL", text: "Book a pickup", url: "https://club.thelondonwash.com/my/book" }],
    },
  },
  {
    key: "birthday",
    title: "Happy birthday",
    blurb: "On the customer's birthday (only customers with a birthday saved).",
    trigger: "birthday",
    trigger_days: 0,
    respect_quiet: true,
    template: "lw_happy_birthday",
    newTemplate: {
      name: "lw_happy_birthday",
      category: "MARKETING",
      body: "Happy birthday, {{first_name}}! Everyone at The London Wash wishes you a wonderful year ahead. Your birthday bonus points are waiting in the Club app. Reply STOP to unsubscribe.",
      footer: FOOTER,
      buttons: [{ type: "URL", text: "Open the Club", url: "https://club.thelondonwash.com/my" }],
    },
  },
  {
    key: "points",
    title: "Points about to expire",
    blurb: "7 days before some of a member's Club points expire.",
    trigger: "points_expiring",
    trigger_days: 7,
    respect_quiet: true,
    template: "lw_points_expiring",
    newTemplate: {
      name: "lw_points_expiring",
      category: "UTILITY",
      body: "Hi {{first_name}}, you have {{expiring_points}} London Wash Club points that expire on {{expiry_date}}. Use them on your next order before they go.",
      footer: FOOTER,
      buttons: [{ type: "URL", text: "View my points", url: "https://club.thelondonwash.com/my" }],
    },
  },
];
export const recipeByKey = (k: string | undefined) => RECIPES.find((r) => r.key === k);

// The built-in order-update templates (lib/whatsapp/templates.ts) were made
// before the template builder, so their fields are described here.
export const SYSTEM_TEMPLATE_FIELDS: Record<string, { pos: number; key: string; example: string }[]> = {
  lw_order_ready: [
    { pos: 1, key: "first_name", example: "Priya" },
    { pos: 2, key: "order_number", example: "LW-1024" },
  ],
  lw_out_for_delivery: [
    { pos: 1, key: "first_name", example: "Priya" },
    { pos: 2, key: "order_number", example: "LW-1024" },
  ],
  lw_order_delivered: [
    { pos: 1, key: "first_name", example: "Priya" },
    { pos: 2, key: "order_number", example: "LW-1024" },
  ],
  lw_pickup_booked: [
    { pos: 1, key: "first_name", example: "Priya" },
    { pos: 2, key: "pickup_time", example: "Sat 4 Oct, 10 am" },
  ],
};
