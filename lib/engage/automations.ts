import { createAdminClient } from "@/lib/supabase/admin";
import { sendTemplate } from "@/lib/whatsapp/client";
import { toWaNumber } from "@/lib/whatsapp/templates";
import { listTemplates } from "@/lib/whatsapp/meta-templates";
import { lotsFor, loadLedger, type Ctx } from "@/lib/loyalty/ledger";
import { buildComponents, fieldValue, AUTO_FIELDS } from "./campaigns";
import { loadProfiles, PROFILE_COLS } from "./segments-server";
import { daysToBirthday, inSegment, type Filter, type Profile } from "./segments";
import { invoiceCode } from "./invoice-link";
import { CONTEXT_FIELDS, QUIET_END, QUIET_START, SYSTEM_TEMPLATE_FIELDS, type TriggerKey } from "./automation-defs";

// ENGAGE → Automations, server side. Events (order placed / ready / out for
// delivery / delivered, pickup booked) and a daily check (win-back, birthday,
// points expiring) put messages in engage_automation_run with a due time; the
// pump (/api/public/engage/pump, every minute) sends what is due. Fields and
// conditions are worked out when the message is sent, so a reminder sent days
// later uses the order as it is then. Server-only. The event hook never throws.

export type Automation = {
  id: string;
  name: string;
  trigger: TriggerKey;
  delay_minutes: number;
  trigger_days: number;
  condition: string;
  template_name: string;
  template_language: string;
  template_category: string | null;
  template_components: any[];
  field_values: Record<string, string>;
  segment_id: string | null;
  respect_quiet: boolean;
  cooldown_days: number;
  active: boolean;
  last_scan_at: string | null;
};
export const AUTOMATION_COLS =
  "id, name, trigger, delay_minutes, trigger_days, condition, template_name, template_language, template_category, template_components, field_values, segment_id, respect_quiet, cooldown_days, active, last_scan_at";

type TemplateMeta = { variables: { pos: number; key: string; example?: string }[]; header_type: string | null; header_image_url: string | null; url_button_variable: string | null };
type Run = { id: string; automation_id: string; customer_id: string | null; order_id: string | null; wa_id: string; name: string | null; category: string | null; context: Record<string, string>; created_at: string };
type Segment = { filters: Filter[]; match: "all" | "any" };

const IST = 330 * 60000;
const rupees = (minor: number) => "₹" + (minor / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 });
const dayMonth = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" });

/** Field mapping for a template: saved by the builder, or built in for the system templates. */
export async function automationMeta(name: string): Promise<TemplateMeta | null> {
  const { data } = await createAdminClient().from("whatsapp_template_meta").select("variables, header_type, header_image_url, url_button_variable").eq("name", name).maybeSingle();
  if (data) return data as TemplateMeta;
  const sys = SYSTEM_TEMPLATE_FIELDS[name];
  return sys ? { variables: sys, header_type: null, header_image_url: null, url_button_variable: null } : null;
}

/** Messages due between 9 pm and 9 am (India time) wait until 9 am. */
export function afterQuietHours(d: Date): Date {
  const ist = new Date(d.getTime() + IST);
  const h = ist.getUTCHours();
  if (h >= QUIET_END && h < QUIET_START) return d;
  const addDay = h >= QUIET_START ? 1 : 0;
  return new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate() + addDay, QUIET_END, 0) - IST);
}

async function loadProfile(customerId: string): Promise<Profile | null> {
  const { data } = await createAdminClient().from("engage_customer_profile").select(PROFILE_COLS).eq("id", customerId).maybeSingle();
  return (data as Profile | null) ?? null;
}

async function loadSegments(autos: Automation[]) {
  const ids = [...new Set(autos.map((a) => a.segment_id).filter(Boolean))] as string[];
  const out = new Map<string, Segment>();
  if (!ids.length) return out;
  const { data } = await createAdminClient().from("engage_segment").select("id, filters, match").in("id", ids);
  for (const s of (data ?? []) as any[]) out.set(s.id, { filters: s.filters ?? [], match: s.match === "any" ? "any" : "all" });
  return out;
}

/** Puts one message in the queue if the customer qualifies. Returns true if queued. */
async function queue(a: Automation, p: Profile, segments: Map<string, Segment>, opts: { orderId?: string; context?: Record<string, string>; dedupe: string; due: Date }) {
  const db = createAdminClient();
  const wa = toWaNumber(p.phone);
  if (!wa) return false;
  if (a.template_category === "MARKETING" && p.marketing_opt_out) return false;
  if (a.segment_id) {
    const seg = segments.get(a.segment_id);
    if (!seg || !inSegment(p, seg.filters, seg.match)) return false;
  }
  if (a.cooldown_days > 0) {
    const since = new Date(Date.now() - a.cooldown_days * 864e5).toISOString();
    const { count } = await db
      .from("engage_automation_run")
      .select("id", { count: "exact", head: true })
      .eq("automation_id", a.id)
      .eq("customer_id", p.id)
      .or(`sent_at.gte.${since},status.eq.queued`);
    if (count) return false;
  }
  const due = a.respect_quiet ? afterQuietHours(opts.due) : opts.due;
  const { data, error } = await db
    .from("engage_automation_run")
    .upsert(
      {
        automation_id: a.id,
        customer_id: p.id,
        order_id: opts.orderId ?? null,
        wa_id: wa,
        name: p.full_name,
        category: a.template_category,
        context: opts.context ?? {},
        dedupe_key: opts.dedupe,
        due_at: due.toISOString(),
      },
      { onConflict: "automation_id,dedupe_key", ignoreDuplicates: true }
    )
    .select("id");
  if (error) console.error("automation queue failed", a.id, error.message);
  return !!data?.length;
}

/**
 * Something happened (order placed, ready, …): queue the matching automations.
 * Never throws, so it can't break the order workflow.
 */
export async function onAutomationEvent(trigger: TriggerKey, ev: { orderId?: string; customerId?: string; context?: Record<string, string>; dedupe?: string }) {
  try {
    const db = createAdminClient();
    const { data, error } = await db.from("engage_automation").select(AUTOMATION_COLS).eq("trigger", trigger).eq("active", true);
    const autos = (data ?? []) as Automation[];
    if (error || !autos.length) return;
    let customerId = ev.customerId;
    if (!customerId && ev.orderId) {
      const { data: o } = await db.from("order").select("customer_id").eq("id", ev.orderId).maybeSingle();
      customerId = (o as { customer_id: string } | null)?.customer_id;
    }
    if (!customerId) return;
    const p = await loadProfile(customerId);
    if (!p) return;
    const segments = await loadSegments(autos);
    const dedupe = ev.dedupe ?? (ev.orderId ? `order:${ev.orderId}` : `${trigger}:${customerId}:${Date.now()}`);
    for (const a of autos) {
      await queue(a, p, segments, { orderId: ev.orderId, context: ev.context, dedupe, due: new Date(Date.now() + a.delay_minutes * 60000) });
    }
  } catch (e) {
    console.error("automation event failed", trigger, e);
  }
}

/** Daily triggers: checks the customer list at most once an hour per automation. Returns how many were queued. */
async function scanDaily() {
  const db = createAdminClient();
  const cutoff = new Date(Date.now() - 3600e3).toISOString();
  const { data } = await db
    .from("engage_automation")
    .select(AUTOMATION_COLS)
    .eq("active", true)
    .in("trigger", ["winback", "birthday", "points_expiring"])
    .or(`last_scan_at.is.null,last_scan_at.lt.${cutoff}`);
  const claimed: Automation[] = [];
  for (const a of (data ?? []) as Automation[]) {
    // Claim the scan so two pumps don't do it at once.
    const q = db.from("engage_automation").update({ last_scan_at: new Date().toISOString() }).eq("id", a.id);
    const { data: won } = await (a.last_scan_at ? q.eq("last_scan_at", a.last_scan_at) : q.is("last_scan_at", null)).select("id");
    if (won?.length) claimed.push(a);
  }
  if (!claimed.length) return 0;

  const profiles = await loadProfiles();
  const byId = new Map(profiles.map((p) => [p.id, p]));
  const segments = await loadSegments(claimed);
  const now = new Date();
  let queued = 0;

  for (const a of claimed) {
    const n = Math.max(0, a.trigger_days);
    if (a.trigger === "winback") {
      for (const p of profiles) {
        if (!p.last_order_at) continue;
        const days = (now.getTime() - Date.parse(p.last_order_at)) / 864e5;
        // Customers who crossed the line in the last week (older lapses are for campaigns).
        if (days >= n && days < n + 7 && (await queue(a, p, segments, { dedupe: `winback:${p.id}:${p.last_order_at.slice(0, 10)}`, due: now }))) queued++;
      }
    } else if (a.trigger === "birthday") {
      for (const p of profiles) {
        const d = daysToBirthday(p.birth_date, now);
        if (d == null || d > n) continue;
        const year = new Date(now.getTime() + IST + d * 864e5).getUTCFullYear();
        if (await queue(a, p, segments, { dedupe: `birthday:${p.id}:${year}`, due: now })) queued++;
      }
    } else if (a.trigger === "points_expiring") {
      const until = new Date(now.getTime() + (n + 1) * 864e5).toISOString();
      const { data: soon } = await db
        .from("loyalty_transaction")
        .select("loyalty_account_id")
        .eq("status", "earned")
        .gt("points", 0)
        .gt("expires_at", now.toISOString())
        .lte("expires_at", until)
        .limit(5000);
      const accountIds = [...new Set(((soon ?? []) as { loyalty_account_id: string }[]).map((r) => r.loyalty_account_id))];
      if (!accountIds.length) continue;
      const { data: accts } = await db.from("loyalty_account").select("id, customer_id").in("id", accountIds);
      const ctx = { supabase: db } as unknown as Ctx;
      for (const acct of (accts ?? []) as { id: string; customer_id: string }[]) {
        const p = byId.get(acct.customer_id);
        if (!p) continue;
        const lots = lotsFor(await loadLedger(ctx, acct.id)).filter((l) => l.expires_at && l.expires_at > now.toISOString() && l.expires_at <= until);
        const pts = Math.floor(lots.reduce((s, l) => s + l.left, 0));
        if (pts <= 0) continue;
        const first = lots.map((l) => l.expires_at as string).sort()[0];
        const context = { expiring_points: pts.toLocaleString("en-IN"), expiry_date: dayMonth(first) };
        if (await queue(a, p, segments, { context, dedupe: `expiry:${p.id}:${first.slice(0, 10)}`, due: now })) queued++;
      }
    }
  }
  return queued;
}

async function inBatches<T>(items: T[], size: number, fn: (x: T) => Promise<void>) {
  for (let i = 0; i < items.length; i += size) await Promise.all(items.slice(i, i + size).map(fn));
}

/** Sends due automation messages (and runs the daily check). Safe to call from several places at once. */
export async function pumpAutomations(budgetMs = 30000) {
  const started = Date.now();
  const db = createAdminClient();
  const summary = { queued: 0, sent: 0, failed: 0, skipped: 0 };
  try {
    summary.queued = await scanDaily();
  } catch (e) {
    console.error("automation daily check failed", e);
  }

  const autos = new Map<string, Automation | null>();
  const metas = new Map<string, TemplateMeta | null>();
  const getAuto = async (id: string) => {
    if (!autos.has(id)) {
      const { data } = await db.from("engage_automation").select(AUTOMATION_COLS).eq("id", id).maybeSingle();
      autos.set(id, (data as Automation | null) ?? null);
    }
    return autos.get(id) ?? null;
  };
  const getMeta = async (name: string) => {
    if (!metas.has(name)) metas.set(name, await automationMeta(name));
    return metas.get(name) ?? null;
  };
  const finish = async (id: string, patch: Record<string, unknown>) => {
    await db.from("engage_automation_run").update(patch).eq("id", id);
  };
  const skip = async (id: string, reason: string) => {
    summary.skipped++;
    await finish(id, { status: "skipped", error: reason });
  };

  while (Date.now() - started < budgetMs) {
    const { data: batch, error } = await db.rpc("engage_claim_runs", { p_limit: 40 });
    if (error) {
      console.error("engage_claim_runs failed", error.message);
      break;
    }
    const runs = (batch ?? []) as Run[];
    if (!runs.length) break;
    await inBatches(runs, 8, async (r) => {
      try {
        const a = await getAuto(r.automation_id);
        if (!a || !a.active) return skip(r.id, "The automation was paused or deleted.");
        const meta = await getMeta(a.template_name);
        const marketing = (r.category ?? a.template_category) === "MARKETING";
        const p = r.customer_id ? await loadProfile(r.customer_id) : null;
        if (marketing && p?.marketing_opt_out) return skip(r.id, "The customer replied STOP.");

        // The order as it is now, and the checks.
        const values: Record<string, string> = { ...(a.field_values ?? {}), ...(r.context ?? {}) };
        if (r.order_id) {
          const [{ data: o }, { data: pays }] = await Promise.all([
            db.from("order").select("order_number, status, total_minor, customer_id").eq("id", r.order_id).maybeSingle(),
            db.from("payment").select("amount_minor, status").eq("order_id", r.order_id),
          ]);
          const order = o as { order_number: string; status: string; total_minor: number } | null;
          if (!order) return skip(r.id, "The order was deleted.");
          if (order.status === "cancelled") return skip(r.id, "The order was cancelled.");
          const paid = ((pays ?? []) as { amount_minor: number; status: string }[]).filter((x) => x.status !== "failed" && x.status !== "refunded").reduce((s, x) => s + Number(x.amount_minor), 0);
          const balance = Math.max(0, Number(order.total_minor) - paid);
          if (a.condition === "balance_due" && balance <= 0) return skip(r.id, "Already paid.");
          if (a.condition === "not_collected" && order.status !== "ready") return skip(r.id, "Already collected or delivered.");
          values.order_number = order.order_number;
          values.order_total = rupees(Number(order.total_minor));
          values.balance_due = rupees(balance);
          values.invoice_link = invoiceCode(r.order_id);
        }
        if (a.condition === "no_new_order" && r.customer_id) {
          const { count } = await db.from("order").select("id", { count: "exact", head: true }).eq("customer_id", r.customer_id).gt("created_at", r.created_at).not("status", "in", "(draft,cancelled)");
          if (count) return skip(r.id, "The customer ordered again.");
        }
        if (marketing) {
          // At most one marketing message per customer per day, across campaigns and automations.
          const since = new Date(Date.now() - 20 * 3600e3).toISOString();
          const [{ count: c1 }, { count: c2 }] = await Promise.all([
            db.from("engage_campaign_recipient").select("id", { count: "exact", head: true }).eq("wa_id", r.wa_id).gte("sent_at", since),
            db.from("engage_automation_run").select("id", { count: "exact", head: true }).eq("wa_id", r.wa_id).eq("category", "MARKETING").gte("sent_at", since).neq("id", r.id),
          ]);
          if (c1 || c2) return skip(r.id, "Already got a marketing message today.");
        }

        const keys = new Set((meta?.variables ?? []).map((v) => v.key));
        if (meta?.url_button_variable) keys.add(meta.url_button_variable);
        let lastOrder: { number?: string; at?: string } = {};
        if ((keys.has("last_order_number") || keys.has("last_order_date")) && r.customer_id) {
          const { data: lo } = await db.from("order").select("order_number, created_at").eq("customer_id", r.customer_id).not("status", "in", "(draft,cancelled)").order("created_at", { ascending: false }).limit(1).maybeSingle();
          lastOrder = { number: (lo as any)?.order_number, at: (lo as any)?.created_at };
        }
        const params: Record<string, string> = {};
        for (const k of keys) params[k] = fieldValue(k, p ?? { full_name: r.name ?? "" }, { lastOrderNumber: lastOrder.number, lastOrderAt: lastOrder.at }, values);
        const { comps, text } = buildComponents({ template_components: a.template_components }, meta, params);
        const res = await sendTemplate(r.wa_id, a.template_name, a.template_language, comps, text || a.template_name);
        if (res.ok) {
          summary.sent++;
          await finish(r.id, { status: "sent", wa_message_id: res.id ?? null, sent_at: new Date().toISOString(), params, error: null });
        } else {
          summary.failed++;
          await finish(r.id, { status: "failed", params, error: res.error.slice(0, 300) });
        }
      } catch (e: any) {
        summary.failed++;
        await finish(r.id, { status: "failed", error: String(e?.message ?? e).slice(0, 300) });
      }
    });
  }
  return summary;
}

export type AutoTemplateOption = {
  key: string;
  name: string;
  language: string;
  category: string;
  approved: boolean;
  body: string;
  headerFormat: string | null;
  headerText: string | null;
  headerImage: string | null;
  footer: string | null;
  buttons: { type: string; text: string }[];
  vars: { pos: number; key: string; example: string }[];
  fixed: string[]; // fields typed once on the automation
};

/** Templates on the sending account that automations can use (with their fields). */
export async function automationTemplates(): Promise<{ templates: AutoTemplateOption[]; sendingLabel: string | null; names: Set<string> }> {
  const db = createAdminClient();
  const [{ rows, accounts }, { data: metas }] = await Promise.all([listTemplates(), db.from("whatsapp_template_meta").select("name, variables, header_image_url, url_button_variable")]);
  const sending = accounts.find((a) => a.sending);
  const metaByName = new Map(((metas ?? []) as any[]).map((m) => [m.name, m]));
  const names = new Set<string>();
  const templates: AutoTemplateOption[] = [];
  for (const t of rows) {
    const st = sending ? t.status[sending.id]?.status : undefined;
    if (!st) continue;
    names.add(t.name);
    if (t.category === "AUTHENTICATION" || /^(hello_world|jaspers_market_)/.test(t.name)) continue;
    const comp = (type: string) => t.components.find((c: any) => c.type === type);
    const body: string = comp("BODY")?.text ?? "";
    const meta = metaByName.get(t.name);
    const vars: { pos: number; key: string; example: string }[] = meta?.variables ?? SYSTEM_TEMPLATE_FIELDS[t.name] ?? [];
    const hasVars = /\{\{\d+\}\}/.test(body) || (comp("BUTTONS")?.buttons ?? []).some((b: any) => /\{\{1\}\}/.test(b.url ?? ""));
    if (hasVars && !vars.length) continue;
    const keys = [...new Set([...vars.map((v) => v.key), meta?.url_button_variable].filter(Boolean) as string[])];
    templates.push({
      key: `${t.name}|${t.language}`,
      name: t.name,
      language: t.language,
      category: t.category,
      approved: st === "APPROVED",
      body,
      headerFormat: comp("HEADER")?.format ?? null,
      headerText: comp("HEADER")?.text ?? null,
      headerImage: meta?.header_image_url ?? null,
      footer: comp("FOOTER")?.text ?? null,
      buttons: (comp("BUTTONS")?.buttons ?? []).map((b: any) => ({ type: b.type, text: b.text })),
      vars,
      fixed: keys.filter((k) => !AUTO_FIELDS.has(k) && !CONTEXT_FIELDS.has(k)),
    });
  }
  return { templates, sendingLabel: sending?.label ?? null, names };
}

/** Components snapshot of a template on the sending account (for saving with the automation). */
export async function templateSnapshot(name: string, language: string) {
  const { rows, accounts } = await listTemplates();
  const sending = accounts.find((a) => a.sending);
  const t = rows.find((r) => r.name === name && r.language === language);
  if (!t || !sending || !t.status[sending.id]) return null;
  return { category: t.category, components: t.components, approved: t.status[sending.id].status === "APPROVED" };
}
