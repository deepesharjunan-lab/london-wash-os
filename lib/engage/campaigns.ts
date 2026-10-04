import { createAdminClient } from "@/lib/supabase/admin";
import { sendTemplate } from "@/lib/whatsapp/client";
import { toWaNumber } from "@/lib/whatsapp/templates";
import { runSegment } from "./segments-server";
import type { Filter, Profile } from "./segments";

// ENGAGE → Campaigns: building the recipient list, filling each customer's
// template fields, and sending in batches. Server-only.
// The pump (/api/public/engage/pump) calls pumpCampaigns() every minute and
// while a campaign page is open; it only does work that is due.

export const STORE_PHONE = "+91 85900 00868";

/** Fields the system can fill for every customer. Anything else is set once per campaign. */
export const AUTO_FIELDS = new Set(["first_name", "full_name", "points", "tier", "last_order_number", "last_order_date", "store_phone"]);

export type Campaign = {
  id: string;
  name: string;
  template_name: string;
  template_language: string;
  template_category: string | null;
  template_components: any[];
  segment_id: string | null;
  field_values: Record<string, string>;
  skip_recent_days: number;
  status: string;
  scheduled_at: string | null;
  started_at: string | null;
};
type TemplateMeta = { variables: { pos: number; key: string }[]; header_type: string | null; header_image_url: string | null; url_button_variable: string | null };
type Recipient = { id: string; campaign_id: string; wa_id: string; params: Record<string, string>; name: string | null };

const day = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" });

/** One customer's value for a field (never empty: WhatsApp rejects blank fields). */
export function fieldValue(key: string, p: Partial<Profile>, extra: { lastOrderNumber?: string; lastOrderAt?: string }, fixed: Record<string, string>) {
  const first = (p.full_name ?? "").trim().split(/\s+/)[0];
  const v = (() => {
    switch (key) {
      case "first_name":
        return first;
      case "full_name":
        return (p.full_name ?? "").trim();
      case "points":
        return Math.floor(Number(p.points) || 0).toLocaleString("en-IN");
      case "tier":
        return p.tier_name ?? "";
      case "last_order_number":
        return extra.lastOrderNumber ?? "";
      case "last_order_date":
        return extra.lastOrderAt ? day(extra.lastOrderAt) : "";
      case "store_phone":
        return STORE_PHONE;
      default:
        return fixed[key] ?? "";
    }
  })();
  if (v) return v.slice(0, 200);
  return key === "first_name" || key === "full_name" ? "there" : key === "tier" ? "Member" : key === "last_order_number" ? "your last order" : fixed[key] || "-";
}

async function templateMeta(name: string): Promise<TemplateMeta | null> {
  const { data } = await createAdminClient().from("whatsapp_template_meta").select("variables, header_type, header_image_url, url_button_variable").eq("name", name).maybeSingle();
  return (data as TemplateMeta | null) ?? null;
}

/** Builds the recipient list (audience → reachable customers) and starts sending. Only one caller wins per campaign. */
export async function startCampaign(campaignId: string): Promise<{ ok: boolean; count?: number; error?: string }> {
  const db = createAdminClient();
  // Claim the start (protects against two pumps starting the same scheduled campaign).
  const { data: claimed } = await db
    .from("engage_campaign")
    .update({ started_at: new Date().toISOString(), status: "sending", updated_at: new Date().toISOString() })
    .eq("id", campaignId)
    .is("started_at", null)
    .in("status", ["draft", "scheduled"])
    .select("id, segment_id, template_name, field_values, skip_recent_days")
    .maybeSingle();
  if (!claimed) return { ok: false, error: "This campaign has already started." };
  const c = claimed as Pick<Campaign, "id" | "segment_id" | "template_name" | "field_values" | "skip_recent_days">;

  try {
    let filters: Filter[] = [];
    let match: "all" | "any" = "all";
    if (c.segment_id) {
      const { data: seg } = await db.from("engage_segment").select("filters, match").eq("id", c.segment_id).maybeSingle();
      if (!seg) throw new Error("The audience was deleted.");
      filters = (seg as any).filters ?? [];
      match = (seg as any).match === "any" ? "any" : "all";
    }
    const { reachable } = await runSegment(filters, match);

    // Skip customers another campaign reached recently.
    const recent = new Set<string>();
    if (c.skip_recent_days > 0 && reachable.length) {
      const since = new Date(Date.now() - c.skip_recent_days * 864e5).toISOString();
      const { data } = await db.from("engage_campaign_recipient").select("wa_id").gte("sent_at", since).in("status", ["sent", "delivered", "read"]).limit(20000);
      for (const r of (data ?? []) as { wa_id: string }[]) recent.add(r.wa_id);
    }

    // Last order number/date per customer, for templates that use them.
    const meta = await templateMeta(c.template_name);
    const keys = new Set((meta?.variables ?? []).map((v) => v.key));
    if (meta?.url_button_variable) keys.add(meta.url_button_variable);
    const lastOrder = new Map<string, { number: string; at: string }>();
    if (keys.has("last_order_number") || keys.has("last_order_date")) {
      const ids = reachable.map((p) => p.id);
      for (let i = 0; i < ids.length; i += 200) {
        const { data } = await db
          .from("order")
          .select("customer_id, order_number, created_at")
          .in("customer_id", ids.slice(i, i + 200))
          .not("status", "in", "(draft,cancelled)")
          .order("created_at", { ascending: false })
          .limit(5000);
        for (const o of (data ?? []) as { customer_id: string; order_number: string; created_at: string }[]) {
          if (!lastOrder.has(o.customer_id)) lastOrder.set(o.customer_id, { number: o.order_number, at: o.created_at });
        }
      }
    }

    const seen = new Set<string>();
    const rows: any[] = [];
    for (const p of reachable) {
      const wa = toWaNumber(p.phone);
      if (!wa || seen.has(wa) || recent.has(wa)) continue;
      seen.add(wa);
      const lo = lastOrder.get(p.id);
      const params: Record<string, string> = {};
      for (const k of keys) params[k] = fieldValue(k, p, { lastOrderNumber: lo?.number, lastOrderAt: lo?.at }, c.field_values ?? {});
      rows.push({ campaign_id: c.id, customer_id: p.id, wa_id: wa, name: p.full_name, params });
    }
    for (let i = 0; i < rows.length; i += 500) {
      const { error } = await db.from("engage_campaign_recipient").upsert(rows.slice(i, i + 500), { onConflict: "campaign_id,wa_id", ignoreDuplicates: true });
      if (error) throw new Error(error.message);
    }
    await db.from("engage_campaign").update({ total_count: rows.length, updated_at: new Date().toISOString() }).eq("id", c.id);
    return { ok: true, count: rows.length };
  } catch (e: any) {
    await db.from("engage_campaign").update({ status: "failed", error: e?.message ?? "Couldn't build the list", finished_at: new Date().toISOString() }).eq("id", c.id);
    return { ok: false, error: e?.message ?? "Couldn't build the list" };
  }
}

/** The WhatsApp template components for one customer. Also returns the readable text for the inbox log. */
export function buildComponents(campaign: Pick<Campaign, "template_components">, meta: TemplateMeta | null, params: Record<string, string>) {
  const comps: any[] = [];
  const header = campaign.template_components.find((x: any) => x.type === "HEADER");
  if (header?.format === "IMAGE" && meta?.header_image_url) comps.push({ type: "header", parameters: [{ type: "image", image: { link: meta.header_image_url } }] });
  const vars = [...(meta?.variables ?? [])].sort((a, b) => a.pos - b.pos);
  if (vars.length) comps.push({ type: "body", parameters: vars.map((v) => ({ type: "text", text: params[v.key] ?? "-" })) });
  const buttons: any[] = campaign.template_components.find((x: any) => x.type === "BUTTONS")?.buttons ?? [];
  const urlIndex = buttons.findIndex((b) => b.type === "URL" && /\{\{1\}\}/.test(b.url ?? ""));
  if (urlIndex >= 0 && meta?.url_button_variable) {
    comps.push({ type: "button", sub_type: "url", index: String(urlIndex), parameters: [{ type: "text", text: params[meta.url_button_variable] ?? "-" }] });
  }
  const bodyText: string = campaign.template_components.find((x: any) => x.type === "BODY")?.text ?? "";
  const text = bodyText.replace(/\{\{(\d+)\}\}/g, (_m, n) => params[vars.find((v) => v.pos === Number(n))?.key ?? ""] ?? `{{${n}}}`);
  return { comps, text };
}

async function inBatches<T>(items: T[], size: number, fn: (x: T) => Promise<void>) {
  for (let i = 0; i < items.length; i += size) await Promise.all(items.slice(i, i + size).map(fn));
}

/** Sends due work. Safe to call any time and from several places at once. */
export async function pumpCampaigns(budgetMs = 40000) {
  const started = Date.now();
  const db = createAdminClient();
  const summary = { started: 0, sent: 0, failed: 0, finished: 0 };

  // 1) Scheduled campaigns whose time has come.
  const { data: due } = await db.from("engage_campaign").select("id").eq("status", "scheduled").lte("scheduled_at", new Date().toISOString()).is("started_at", null).limit(5);
  for (const c of (due ?? []) as { id: string }[]) {
    const r = await startCampaign(c.id);
    if (r.ok) summary.started++;
  }

  // 2) Send queued messages for campaigns in progress.
  const { data: active } = await db
    .from("engage_campaign")
    .select("id, name, template_name, template_language, template_category, template_components, segment_id, field_values, skip_recent_days, status, scheduled_at, started_at")
    .eq("status", "sending")
    .order("started_at")
    .limit(5);
  for (const campaign of (active ?? []) as Campaign[]) {
    const meta = await templateMeta(campaign.template_name);
    while (Date.now() - started < budgetMs) {
      const { data: batch, error } = await db.rpc("engage_claim_recipients", { p_campaign: campaign.id, p_limit: 40 });
      if (error) break;
      const rows = (batch ?? []) as Recipient[];
      if (!rows.length) {
        const { count } = await db.from("engage_campaign_recipient").select("id", { count: "exact", head: true }).eq("campaign_id", campaign.id).in("status", ["queued", "sending"]);
        if (!count) {
          await db.from("engage_campaign").update({ status: "sent", finished_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", campaign.id).eq("status", "sending");
          summary.finished++;
        }
        break;
      }
      await inBatches(rows, 8, async (r) => {
        // Stop quietly if the campaign was cancelled mid-way.
        const { comps, text } = buildComponents(campaign, meta, r.params ?? {});
        const res = await sendTemplate(r.wa_id, campaign.template_name, campaign.template_language, comps, text || campaign.template_name);
        if (res.ok) {
          summary.sent++;
          await db.from("engage_campaign_recipient").update({ status: "sent", wa_message_id: res.id ?? null, sent_at: new Date().toISOString(), error: null }).eq("id", r.id);
        } else {
          summary.failed++;
          await db.from("engage_campaign_recipient").update({ status: "failed", error: res.error.slice(0, 300) }).eq("id", r.id);
        }
      });
      const { data: still } = await db.from("engage_campaign").select("status").eq("id", campaign.id).maybeSingle();
      if ((still as { status: string } | null)?.status !== "sending") break;
    }
    if (Date.now() - started >= budgetMs) break;
  }
  return summary;
}

/** Delivery receipts from the webhook: moves a campaign or automation message forward (never backwards). */
export async function recordCampaignStatus(waMessageId: string, status: string) {
  const from: Record<string, string[]> = {
    sent: ["sending"],
    delivered: ["sending", "sent"],
    read: ["sending", "sent", "delivered"],
    failed: ["sending", "sent"],
  };
  if (!from[status]) return;
  try {
    const db = createAdminClient();
    await Promise.all([
      db.from("engage_campaign_recipient").update({ status }).eq("wa_message_id", waMessageId).in("status", from[status]),
      db.from("engage_automation_run").update({ status }).eq("wa_message_id", waMessageId).in("status", from[status]),
    ]);
  } catch {
    // tracking only
  }
}

/** A customer wrote back: credit the reply to the campaign / automation messages they got in the last 3 days. */
export async function recordCampaignReply(waId: string) {
  try {
    const since = new Date(Date.now() - 3 * 864e5).toISOString();
    const db = createAdminClient();
    const now = new Date().toISOString();
    await Promise.all([
      db.from("engage_campaign_recipient").update({ replied_at: now }).eq("wa_id", waId).is("replied_at", null).gte("sent_at", since),
      db.from("engage_automation_run").update({ replied_at: now }).eq("wa_id", waId).is("replied_at", null).gte("sent_at", since),
    ]);
  } catch {
    // tracking only
  }
}
