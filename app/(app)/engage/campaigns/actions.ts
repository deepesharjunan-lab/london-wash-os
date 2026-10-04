"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { consoleUserId } from "@/lib/auth/console-user";
import { listTemplates } from "@/lib/whatsapp/meta-templates";
import { sendTemplate } from "@/lib/whatsapp/client";
import { toWaNumber } from "@/lib/whatsapp/templates";
import { AUTO_FIELDS, buildComponents, fieldValue, startCampaign } from "@/lib/engage/campaigns";
import { runSegment } from "@/lib/engage/segments-server";
import { customersByPhone } from "@/lib/customer/session";

// ENGAGE → Campaigns: create (send now or schedule), test send, cancel.

type Meta = { variables: { pos: number; key: string }[]; header_type: string | null; header_image_url: string | null; url_button_variable: string | null };

async function loadTemplate(key: string) {
  const [name, language] = key.split("|");
  const { rows, accounts } = await listTemplates();
  const sending = accounts.find((a) => a.sending);
  const t = rows.find((r) => r.name === name && r.language === language);
  if (!t || !sending || t.status[sending.id]?.status !== "APPROVED") return null;
  const { data } = await createAdminClient().from("whatsapp_template_meta").select("variables, header_type, header_image_url, url_button_variable").eq("name", name).maybeSingle();
  return { t, meta: (data as Meta | null) ?? null };
}

function fixedValues(form: FormData) {
  const out: Record<string, string> = {};
  for (const [k, v] of form.entries()) if (k.startsWith("field_")) out[k.slice(6)] = String(v).trim().slice(0, 200);
  return out;
}

export async function audienceSizeAction(segmentId: string): Promise<{ reachable: number; matched: number } | { error: string }> {
  if (!(await consoleUserId())) return { error: "Sign in again." };
  let filters: any[] = [];
  let match: "all" | "any" = "all";
  if (segmentId) {
    const { data } = await createAdminClient().from("engage_segment").select("filters, match").eq("id", segmentId).maybeSingle();
    if (!data) return { error: "Audience not found." };
    filters = (data as any).filters ?? [];
    match = (data as any).match === "any" ? "any" : "all";
  }
  const r = await runSegment(filters, match);
  return { reachable: r.reachable.length, matched: r.matched.length };
}

export type CampaignState = { error?: string; testResult?: string };

export async function sendTestAction(_prev: CampaignState, form: FormData): Promise<CampaignState> {
  if (!(await consoleUserId())) return { error: "Your session has ended. Sign in again." };
  const to = toWaNumber(String(form.get("test_phone") ?? ""));
  if (!to) return { error: "Enter the phone number to send the test to." };
  const loaded = await loadTemplate(String(form.get("template") ?? ""));
  if (!loaded) return { error: "Choose an approved template first." };
  const fixed = fixedValues(form);
  const [match] = await customersByPhone(to.slice(-10));
  const profile = { full_name: match?.full_name ?? "Test Customer" };
  const keys = new Set(loaded.meta?.variables.map((v) => v.key) ?? []);
  if (loaded.meta?.url_button_variable) keys.add(loaded.meta.url_button_variable);
  const params: Record<string, string> = {};
  for (const k of keys) params[k] = fieldValue(k, profile, {}, fixed);
  const { comps, text } = buildComponents({ template_components: loaded.t.components }, loaded.meta, params);
  const res = await sendTemplate(to, loaded.t.name, loaded.t.language, comps, text);
  return res.ok
    ? { testResult: `Test sent to +${to}. Check WhatsApp on that phone.` }
    : {
        error: /131030|allowed list/i.test(res.error)
          ? "WhatsApp's test number can only message numbers registered as test recipients in Meta. Use your registered phone, or wait until the real number is connected."
          : `WhatsApp didn't send the test: ${res.error}`,
      };
}

export async function createCampaignAction(_prev: CampaignState, form: FormData): Promise<CampaignState> {
  const userId = await consoleUserId();
  if (!userId) return { error: "Your session has ended. Sign in again." };
  const name = String(form.get("name") ?? "").trim().slice(0, 100);
  if (!name) return { error: "Give the campaign a name." };
  const loaded = await loadTemplate(String(form.get("template") ?? ""));
  if (!loaded) return { error: "Choose a template that is approved on the sending account." };

  const fixed = fixedValues(form);
  const needed = [...new Set([...(loaded.meta?.variables.map((v) => v.key) ?? []), loaded.meta?.url_button_variable].filter(Boolean) as string[])].filter(
    (k) => !AUTO_FIELDS.has(k)
  );
  const missing = needed.filter((k) => !fixed[k]);
  if (missing.length) return { error: "Fill in every field that is the same for everyone (for example the offer text or coupon code)." };

  const segmentId = String(form.get("segment_id") ?? "") || null;
  let segmentName = "Everyone";
  if (segmentId) {
    const { data } = await createAdminClient().from("engage_segment").select("name").eq("id", segmentId).maybeSingle();
    if (!data) return { error: "That audience no longer exists." };
    segmentName = (data as { name: string }).name;
  }

  const when = form.get("when") === "schedule" ? "schedule" : "now";
  let scheduledAt: string | null = null;
  if (when === "schedule") {
    const local = String(form.get("scheduled_at") ?? ""); // "2026-10-20T10:00" in India time
    const t = new Date(`${local}:00+05:30`);
    if (!local || Number.isNaN(t.getTime())) return { error: "Choose the date and time to send." };
    if (t.getTime() < Date.now() + 60000) return { error: "Choose a time in the future." };
    scheduledAt = t.toISOString();
  }
  const skip = Math.max(0, Math.min(30, Number(form.get("skip_recent_days") ?? 2) || 0));

  const { data: row, error } = await createAdminClient()
    .from("engage_campaign")
    .insert({
      name,
      template_name: loaded.t.name,
      template_language: loaded.t.language,
      template_category: loaded.t.category,
      template_components: loaded.t.components,
      segment_id: segmentId,
      segment_name: segmentName,
      field_values: fixed,
      skip_recent_days: skip,
      status: when === "schedule" ? "scheduled" : "draft",
      scheduled_at: scheduledAt,
      created_by_user_id: userId,
    })
    .select("id")
    .single();
  if (error || !row) return { error: `Couldn't create the campaign: ${error?.message ?? "unknown error"}` };
  const id = (row as { id: string }).id;
  if (when === "now") {
    const r = await startCampaign(id);
    if (!r.ok) return { error: r.error ?? "Couldn't start the campaign." };
  }
  revalidatePath("/engage/campaigns");
  redirect(`/engage/campaigns/${id}`);
}

export async function cancelCampaignAction(form: FormData) {
  if (!(await consoleUserId())) return;
  const id = String(form.get("id") ?? "");
  if (!id) return;
  const db = createAdminClient();
  await db.from("engage_campaign").update({ status: "cancelled", finished_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", id).in("status", ["draft", "scheduled", "sending"]);
  await db.from("engage_campaign_recipient").update({ status: "skipped" }).eq("campaign_id", id).eq("status", "queued");
  revalidatePath(`/engage/campaigns/${id}`);
  redirect(`/engage/campaigns/${id}`);
}
