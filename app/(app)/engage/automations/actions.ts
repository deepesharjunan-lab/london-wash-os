"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { consoleUserId } from "@/lib/auth/console-user";
import { sendTemplate } from "@/lib/whatsapp/client";
import { toWaNumber } from "@/lib/whatsapp/templates";
import { customersByPhone } from "@/lib/customer/session";
import { AUTO_FIELDS, buildComponents, fieldValue } from "@/lib/engage/campaigns";
import { automationMeta, templateSnapshot } from "@/lib/engage/automations";
import { invoiceCode } from "@/lib/engage/invoice-link";
import { CONDITIONS, CONTEXT_FIELDS, recipeByKey, triggerByKey } from "@/lib/engage/automation-defs";
import { variableByKey } from "@/lib/engage/variables";
import { createTemplateAction } from "../templates/actions";

// ENGAGE → Automations: save, switch on/off, delete, test, and create a
// recipe's template in one click.

export type AutomationState = { error?: string; notice?: string; testResult?: string };

const fixedValues = (form: FormData) => {
  const out: Record<string, string> = {};
  for (const [k, v] of form.entries()) if (k.startsWith("field_")) out[k.slice(6)] = String(v).trim().slice(0, 200);
  return out;
};
const int = (v: FormDataEntryValue | null, min: number, max: number, dflt = 0) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : dflt;
};

export async function saveAutomationAction(_prev: AutomationState, form: FormData): Promise<AutomationState> {
  const userId = await consoleUserId();
  if (!userId) return { error: "Your session has ended. Sign in again." };
  const id = String(form.get("id") ?? "");
  const name = String(form.get("name") ?? "").trim().slice(0, 100);
  if (!name) return { error: "Give the automation a name." };
  const trigger = triggerByKey(String(form.get("trigger") ?? ""));
  if (!trigger) return { error: "Choose what starts the automation." };
  const condition = String(form.get("condition") ?? "none");
  const cond = CONDITIONS.find((c) => c.key === condition);
  if (!cond || (cond.orderOnly && !trigger.order)) return { error: "That check only works with order events." };

  const [tplName, tplLang] = String(form.get("template") ?? "").split("|");
  if (!tplName) return { error: "Choose a template." };
  const snap = await templateSnapshot(tplName, tplLang || "en");
  if (!snap) return { error: "That template isn't on the sending WhatsApp account." };
  const meta = await automationMeta(tplName);
  const keys = [...new Set([...(meta?.variables.map((v) => v.key) ?? []), meta?.url_button_variable].filter(Boolean) as string[])];
  const missing = keys.filter((k) => CONTEXT_FIELDS.has(k) && !trigger.fields.includes(k));
  if (missing.length) return { error: `This template uses "${variableByKey(missing[0])?.label ?? missing[0]}", which "${trigger.label}" can't fill. Choose another template or trigger.` };
  const fixed = fixedValues(form);
  const needFixed = keys.filter((k) => !AUTO_FIELDS.has(k) && !CONTEXT_FIELDS.has(k));
  const empty = needFixed.find((k) => !fixed[k]);
  if (empty) return { error: `Fill in "${variableByKey(empty)?.label ?? empty}".` };

  const delayUnit = Number(form.get("delay_unit") ?? 1) || 1;
  let active = form.get("active") === "on";
  let notice: string | undefined;
  if (active && !snap.approved) {
    active = false;
    notice = "Saved but switched off: the template isn't approved yet. Switch it on once WhatsApp approves it.";
  }
  const row = {
    name,
    trigger: trigger.key,
    delay_minutes: trigger.kind === "event" ? int(form.get("delay_value"), 0, 90 * 1440) * delayUnit : 0,
    trigger_days: trigger.kind === "daily" ? int(form.get("trigger_days"), 0, 365, trigger.defaultDays ?? 0) : 0,
    condition,
    template_name: tplName,
    template_language: tplLang || "en",
    template_category: snap.category,
    template_components: snap.components,
    field_values: Object.fromEntries(needFixed.map((k) => [k, fixed[k]])),
    segment_id: String(form.get("segment_id") ?? "") || null,
    respect_quiet: form.get("respect_quiet") === "on",
    cooldown_days: int(form.get("cooldown_days"), 0, 365),
    active,
    updated_at: new Date().toISOString(),
  };
  if (row.delay_minutes > 90 * 1440) return { error: "The wait can be at most 90 days." };
  const db = createAdminClient();
  let savedId = id;
  if (id) {
    const { error } = await db.from("engage_automation").update(row).eq("id", id);
    if (error) return { error: error.message };
  } else {
    const { data, error } = await db.from("engage_automation").insert({ ...row, created_by_user_id: userId }).select("id").single();
    if (error) return { error: /engage_automation/.test(error.message) ? "Run the database update (2026-10-05_engage_automations.sql) in Supabase first." : error.message };
    savedId = (data as { id: string }).id;
  }
  revalidatePath("/engage/automations");
  redirect(`/engage/automations/${savedId}?saved=1${notice ? "&notice=" + encodeURIComponent(notice) : ""}`);
}

export async function toggleAutomationAction(form: FormData) {
  if (!(await consoleUserId())) return;
  const id = String(form.get("id") ?? "");
  const on = form.get("on") === "1";
  const db = createAdminClient();
  if (on) {
    const { data } = await db.from("engage_automation").select("template_name, template_language").eq("id", id).maybeSingle();
    const a = data as { template_name: string; template_language: string } | null;
    const snap = a ? await templateSnapshot(a.template_name, a.template_language) : null;
    if (!snap?.approved) redirect(`/engage/automations?error=${encodeURIComponent("The template isn't approved on the sending account yet, so it can't be switched on.")}`);
    await db.from("engage_automation").update({ active: true, template_components: snap.components, template_category: snap.category, updated_at: new Date().toISOString() }).eq("id", id);
  } else {
    await db.from("engage_automation").update({ active: false, updated_at: new Date().toISOString() }).eq("id", id);
  }
  revalidatePath("/engage/automations");
  revalidatePath(`/engage/automations/${id}`);
}

export async function deleteAutomationAction(form: FormData) {
  if (!(await consoleUserId())) return;
  await createAdminClient().from("engage_automation").delete().eq("id", String(form.get("id") ?? ""));
  revalidatePath("/engage/automations");
  redirect("/engage/automations");
}

/** Creates the WhatsApp template a recipe needs (on both accounts), using the template builder's checks. */
export async function createRecipeTemplateAction(recipeKey: string): Promise<{ ok: boolean; message: string }> {
  if (!(await consoleUserId())) return { ok: false, message: "Your session has ended. Sign in again." };
  const t = recipeByKey(recipeKey)?.newTemplate;
  if (!t) return { ok: false, message: "This recipe uses an existing template." };
  const form = new FormData();
  form.set(
    "draft",
    JSON.stringify({
      name: t.name,
      category: t.category,
      language: "en",
      headerType: "NONE",
      headerText: "",
      body: t.body,
      footer: t.footer,
      buttons: t.buttons,
      examples: {},
    })
  );
  const res = await createTemplateAction({}, form);
  if (res.error) return { ok: false, message: res.error };
  return { ok: true, message: `Template "${t.name}" sent to WhatsApp for approval. This usually takes a few minutes: reload this page to pick it.` };
}

/** Sends the automation's message to a test phone now, with real values where possible. */
export async function testAutomationAction(_prev: AutomationState, form: FormData): Promise<AutomationState> {
  if (!(await consoleUserId())) return { error: "Your session has ended. Sign in again." };
  const to = toWaNumber(String(form.get("test_phone") ?? ""));
  if (!to) return { error: "Enter the phone number to send the test to." };
  const [tplName, tplLang] = String(form.get("template") ?? "").split("|");
  const snap = tplName ? await templateSnapshot(tplName, tplLang || "en") : null;
  if (!snap?.approved) return { error: "Choose an approved template first." };
  const meta = await automationMeta(tplName);
  const [customer] = await customersByPhone(to.slice(-10));
  const db = createAdminClient();
  // The test customer's latest order (so the invoice link opens a real invoice), or sample values.
  const values: Record<string, string> = { ...fixedValues(form), order_number: "LW-1024", order_total: "₹640", balance_due: "₹240", invoice_link: "sample", pickup_time: "Sat 4 Oct, 10 am", expiring_points: "300", expiry_date: "31 Oct" };
  if (customer) {
    const { data: o } = await db.from("order").select("id, order_number, total_minor").eq("customer_id", customer.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (o) {
      values.order_number = (o as any).order_number;
      values.order_total = "₹" + (Number((o as any).total_minor) / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 });
      values.invoice_link = invoiceCode((o as any).id);
    }
  }
  const keys = new Set(meta?.variables.map((v) => v.key) ?? []);
  if (meta?.url_button_variable) keys.add(meta.url_button_variable);
  const params: Record<string, string> = {};
  for (const k of keys) params[k] = fieldValue(k, { full_name: customer?.full_name ?? "Test Customer" }, {}, values);
  const { comps, text } = buildComponents({ template_components: snap.components }, meta, params);
  const res = await sendTemplate(to, tplName, tplLang || "en", comps, text);
  if (res.ok) return { testResult: `Test sent to +${to}.${customer ? "" : " (No customer has this number, so sample order details were used.)"}` };
  return {
    error: /131030|allowed list/i.test(res.error)
      ? "WhatsApp's test number can only message numbers registered as test recipients in Meta. Use your registered phone, or wait until the real number is connected."
      : `WhatsApp didn't send the test: ${res.error}`,
  };
}
