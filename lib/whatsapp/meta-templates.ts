import { createAdminClient } from "@/lib/supabase/admin";

// WhatsApp message templates at Meta: list, create, delete, header images.
// Templates are created on both WhatsApp accounts (the real number's account,
// where they'll be used, and Meta's test account used until the real number
// is connected), so they are approved and ready on both. Server-only.

const GRAPH = () => `https://graph.facebook.com/${process.env.WHATSAPP_GRAPH_VERSION || "v23.0"}`;
const APP_ID = "2321181425381997"; // Meta app "London Wash OS" (public id)
const REAL_WABA = "1519843515943013"; // The London Wash, +91 85900 00868
const TEST_WABA = "1830741548097628"; // Meta test account, +1 555 633 8829
const TEST_PHONE_ID = "1316176581583049";

export type WabaInfo = { id: string; label: string; sending: boolean };

/** Both WhatsApp accounts; `sending` marks the one the system currently sends from. */
export function wabas(): WabaInfo[] {
  const sendingIsTest = (process.env.WHATSAPP_PHONE_NUMBER_ID ?? "") === TEST_PHONE_ID;
  const realId = process.env.WHATSAPP_WABA_ID || REAL_WABA;
  return [
    { id: realId, label: "The London Wash", sending: !sendingIsTest },
    { id: TEST_WABA, label: "Test account", sending: sendingIsTest },
  ];
}

const auth = () => ({ Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}` });

export type MetaTemplate = {
  id: string;
  name: string;
  status: string; // APPROVED, PENDING, REJECTED, PAUSED, DISABLED, IN_APPEAL
  category: string;
  language: string;
  rejected_reason?: string;
  quality_score?: { score?: string };
  components: any[];
};

/** All templates on one account (follows paging). Never throws. */
async function listOn(waba: string): Promise<MetaTemplate[] | null> {
  if (!process.env.WHATSAPP_TOKEN) return null;
  const out: MetaTemplate[] = [];
  let url: string | null = `${GRAPH()}/${waba}/message_templates?fields=id,name,status,category,language,rejected_reason,quality_score,components&limit=100`;
  try {
    for (let page = 0; url && page < 10; page++) {
      const res: Response = await fetch(url, { headers: auth(), cache: "no-store" });
      const json = (await res.json().catch(() => ({}))) as any;
      if (!res.ok) return out.length ? out : null;
      out.push(...((json.data ?? []) as MetaTemplate[]));
      url = json.paging?.next ?? null;
    }
    return out;
  } catch {
    return out.length ? out : null;
  }
}

export type TemplateRow = {
  name: string;
  language: string;
  category: string;
  components: any[];
  status: Record<string, { status: string; reason?: string; quality?: string }>; // by WABA id
};

/** Templates from both accounts, merged by name + language. */
export async function listTemplates(): Promise<{ rows: TemplateRow[]; accounts: WabaInfo[]; failed: string[] }> {
  const accounts = wabas();
  const lists = await Promise.all(accounts.map((a) => listOn(a.id)));
  const byKey = new Map<string, TemplateRow>();
  const failed: string[] = [];
  lists.forEach((list, i) => {
    const waba = accounts[i].id;
    if (!list) {
      failed.push(accounts[i].label);
      return;
    }
    for (const t of list) {
      const key = `${t.name}|${t.language}`;
      const row = byKey.get(key) ?? { name: t.name, language: t.language, category: t.category, components: t.components, status: {} };
      row.status[waba] = {
        status: t.status,
        reason: t.rejected_reason && t.rejected_reason !== "NONE" ? t.rejected_reason : undefined,
        quality: t.quality_score?.score,
      };
      byKey.set(key, row);
    }
  });
  const rows = [...byKey.values()].sort((a, b) => a.name.localeCompare(b.name));
  return { rows, accounts, failed };
}

/** Submits a template to every account. Returns the result per account. */
export async function createTemplate(def: { name: string; category: string; language: string; components: any[] }) {
  const results: { account: string; ok: boolean; message: string }[] = [];
  for (const a of wabas()) {
    try {
      const res = await fetch(`${GRAPH()}/${a.id}/message_templates`, {
        method: "POST",
        headers: { ...auth(), "Content-Type": "application/json" },
        body: JSON.stringify({ ...def, allow_category_change: true }),
      });
      const json = (await res.json().catch(() => ({}))) as any;
      results.push(
        res.ok
          ? { account: a.label, ok: true, message: json.status ?? "PENDING" }
          : { account: a.label, ok: false, message: json?.error?.error_user_msg || json?.error?.message || `HTTP ${res.status}` }
      );
    } catch (e: any) {
      results.push({ account: a.label, ok: false, message: e?.message ?? "Network error" });
    }
  }
  return results;
}

/** Deletes a template (all languages) from every account. */
export async function deleteTemplate(name: string) {
  const results: { account: string; ok: boolean; message: string }[] = [];
  for (const a of wabas()) {
    try {
      const res = await fetch(`${GRAPH()}/${a.id}/message_templates?name=${encodeURIComponent(name)}`, { method: "DELETE", headers: auth() });
      const json = (await res.json().catch(() => ({}))) as any;
      results.push({ account: a.label, ok: res.ok, message: res.ok ? "Deleted" : json?.error?.error_user_msg || json?.error?.message || `HTTP ${res.status}` });
    } catch (e: any) {
      results.push({ account: a.label, ok: false, message: e?.message ?? "Network error" });
    }
  }
  return results;
}

/**
 * Header image for a template: stored in the public `engage-media` bucket
 * (used as the link when sending) and uploaded to Meta's resumable upload API
 * (Meta needs a sample "handle" to review the template). Returns both.
 */
export async function uploadHeaderImage(file: File): Promise<{ ok: true; url: string; handle: string } | { ok: false; error: string }> {
  const type = file.type === "image/png" ? "image/png" : file.type === "image/jpeg" ? "image/jpeg" : null;
  if (!type) return { ok: false, error: "Use a JPG or PNG image." };
  if (file.size > 5 * 1024 * 1024) return { ok: false, error: "The image must be under 5 MB." };
  const bytes = new Uint8Array(await file.arrayBuffer());

  // 1) Keep a copy we can link to when sending.
  const db = createAdminClient();
  const path = `templates/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${type === "image/png" ? "png" : "jpg"}`;
  const { error: upErr } = await db.storage.from("engage-media").upload(path, bytes, { contentType: type, upsert: false });
  if (upErr) return { ok: false, error: `Couldn't store the image: ${upErr.message}` };
  const url = db.storage.from("engage-media").getPublicUrl(path).data.publicUrl;

  // 2) Give Meta a sample for the review.
  try {
    const start = await fetch(`${GRAPH()}/${APP_ID}/uploads?file_name=${encodeURIComponent(path.split("/").pop()!)}&file_length=${bytes.length}&file_type=${type}`, {
      method: "POST",
      headers: auth(),
    });
    const s = (await start.json().catch(() => ({}))) as any;
    if (!start.ok || !s.id) return { ok: false, error: s?.error?.message ?? "Meta didn't accept the image upload." };
    const put = await fetch(`${GRAPH()}/${s.id}`, {
      method: "POST",
      headers: { Authorization: `OAuth ${process.env.WHATSAPP_TOKEN}`, file_offset: "0" },
      body: bytes as BodyInit,
    });
    const p = (await put.json().catch(() => ({}))) as any;
    if (!put.ok || !p.h) return { ok: false, error: p?.error?.message ?? "Meta didn't accept the image upload." };
    return { ok: true, url, handle: p.h };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "Image upload failed" };
  }
}
