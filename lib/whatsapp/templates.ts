import { createAdminClient } from "@/lib/supabase/admin";
import { sendTemplate, waConfigured } from "./client";

// Approved WhatsApp message templates: the only way to message a customer
// first, or after 24 hours without a reply. Server-only. Never throws.
// Switched on with Vercel variables (both off by default):
//   WHATSAPP_LOGIN_CODES=1  customer-app sign-in codes by WhatsApp
//   WHATSAPP_NOTIFY=1       order ready / out for delivery / delivered, pickup booked
// The template definitions below are submitted to Meta by
// /api/public/whatsapp/templates (see that route).

const APP = "https://club.thelondonwash.com/my";
const LANG = () => process.env.WHATSAPP_TEMPLATE_LANG || "en";
const FOOTER = { type: "FOOTER", text: "The London Wash · the art of laundry." };

export const TEMPLATE_DEFS = [
  {
    name: "lw_login_code",
    category: "AUTHENTICATION",
    components: [
      { type: "BODY", add_security_recommendation: true },
      { type: "FOOTER", code_expiration_minutes: 15 },
      { type: "BUTTONS", buttons: [{ type: "OTP", otp_type: "COPY_CODE", text: "Copy code" }] },
    ],
  },
  {
    name: "lw_order_ready",
    category: "UTILITY",
    components: [
      {
        type: "BODY",
        text: "Hi {{1}}, your London Wash order {{2}} is cleaned, packed and ready. You can collect it at our Vettipuram store, or we will deliver it as arranged.",
        example: { body_text: [["Priya", "LW-1024"]] },
      },
      FOOTER,
      { type: "BUTTONS", buttons: [{ type: "URL", text: "Track order", url: `${APP}/orders` }] },
    ],
  },
  {
    name: "lw_out_for_delivery",
    category: "UTILITY",
    components: [
      {
        type: "BODY",
        text: "Hi {{1}}, your London Wash order {{2}} is out for delivery. Our delivery partner will reach you shortly.",
        example: { body_text: [["Priya", "LW-1024"]] },
      },
      FOOTER,
      { type: "BUTTONS", buttons: [{ type: "URL", text: "Track order", url: `${APP}/orders` }] },
    ],
  },
  {
    name: "lw_order_delivered",
    category: "UTILITY",
    components: [
      {
        type: "BODY",
        text: "Hi {{1}}, your London Wash order {{2}} has been delivered. Thank you for choosing us! Your Club points have been added to your account.",
        example: { body_text: [["Priya", "LW-1024"]] },
      },
      FOOTER,
      { type: "BUTTONS", buttons: [{ type: "URL", text: "My Club points", url: `${APP}/points` }] },
    ],
  },
  {
    name: "lw_pickup_booked",
    category: "UTILITY",
    components: [
      {
        type: "BODY",
        text: "Hi {{1}}, your pickup is booked for {{2}}. Our team will collect your clothes from the address you chose. Reply to this message if you need to change anything.",
        example: { body_text: [["Priya", "Sat 4 Oct, 10 am"]] },
      },
      FOOTER,
      { type: "BUTTONS", buttons: [{ type: "URL", text: "My orders", url: `${APP}/orders` }] },
    ],
  },
] as const;

export const waCodesOn = () => waConfigured() && process.env.WHATSAPP_LOGIN_CODES === "1";
export const waNotifyOn = () => waConfigured() && process.env.WHATSAPP_NOTIFY === "1";

/** Customer phone → WhatsApp number (digits with country code; Indian numbers get 91). */
export function toWaNumber(phone: string | null | undefined): string | null {
  const d = (phone ?? "").replace(/\D/g, "");
  if (d.length === 10) return `91${d}`;
  if (d.length === 11 && d.startsWith("0")) return `91${d.slice(1)}`;
  if (d.length >= 11 && d.length <= 15) return d;
  return null;
}

const param = (t: string) => ({ type: "text", text: String(t).slice(0, 100) });
const firstName = (full: string | null | undefined) => String(full ?? "").trim().split(" ")[0] || "there";

/** Sends a customer-app sign-in code. Returns true if WhatsApp accepted it. */
export async function sendLoginCodeWhatsApp(phone: string, code: string): Promise<boolean> {
  try {
    const to = toWaNumber(phone);
    if (!to || !waCodesOn()) return false;
    const res = await sendTemplate(to, "lw_login_code", LANG(), [
      { type: "body", parameters: [param(code)] },
      { type: "button", sub_type: "url", index: "0", parameters: [param(code)] },
    ]);
    return res.ok;
  } catch (e) {
    console.error("WhatsApp login code failed", e);
    return false;
  }
}

// An active ENGAGE automation for the same event replaces the built-in message
// (so customers never get both). Errors (e.g. table not created yet) count as "no".
async function automationCovers(trigger: string) {
  const { count, error } = await createAdminClient().from("engage_automation").select("id", { count: "exact", head: true }).eq("trigger", trigger).eq("active", true);
  return !error && !!count;
}
const ORDER_TRIGGER: Record<string, string> = { ready: "order_ready", out_for_delivery: "out_for_delivery", delivered: "order_delivered" };

const ORDER_TEMPLATE: Record<string, string> = {
  ready: "lw_order_ready",
  out_for_delivery: "lw_out_for_delivery",
  delivered: "lw_order_delivered",
};

/** WhatsApp update for an order status change (ready, out for delivery, delivered). */
export async function sendOrderUpdateWhatsApp(orderId: string, status: string) {
  try {
    const name = ORDER_TEMPLATE[status];
    if (!name || !waNotifyOn()) return;
    if (await automationCovers(ORDER_TRIGGER[status])) return;
    const { data } = await createAdminClient()
      .from("order")
      .select("order_number, customer:customer_id(full_name, phone)")
      .eq("id", orderId)
      .maybeSingle();
    const o = data as any;
    const c = Array.isArray(o?.customer) ? o.customer[0] : o?.customer;
    const to = toWaNumber(c?.phone);
    if (!o || !to) return;
    await sendTemplate(to, name, LANG(), [{ type: "body", parameters: [param(firstName(c?.full_name)), param(o.order_number)] }]);
  } catch (e) {
    console.error("WhatsApp order update failed", e);
  }
}

/** WhatsApp confirmation when a customer books a pickup. */
export async function sendPickupBookedWhatsApp(customerId: string, when: string) {
  try {
    if (!waNotifyOn()) return;
    if (await automationCovers("pickup_booked")) return;
    const { data } = await createAdminClient().from("customer").select("full_name, phone").eq("id", customerId).maybeSingle();
    const c = data as { full_name: string; phone: string } | null;
    const to = toWaNumber(c?.phone);
    if (!to) return;
    await sendTemplate(to, "lw_pickup_booked", LANG(), [{ type: "body", parameters: [param(firstName(c?.full_name)), param(when)] }]);
  } catch (e) {
    console.error("WhatsApp pickup confirmation failed", e);
  }
}
