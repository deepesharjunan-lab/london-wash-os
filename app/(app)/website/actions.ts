"use server";
import { revalidatePath } from "next/cache";
import { consoleUserId } from "@/lib/auth/console-user";
import { getSiteSettingsFresh, restorePrevious, saveSiteSetting, type SettingKey } from "@/lib/site/settings";
import { BUSINESS_FIELDS, DEFAULT_SEO, FLAG_INFO, SECTIONS, SERVICE_UNITS, type PickupWindow, type Seo, type ServiceItem } from "@/lib/site/defs";
import { SITE_ICONS } from "@/lib/site/template";

// Website CMS: every save goes live within seconds (the settings cache is refreshed).

export type SaveState = { error?: string; ok?: string };

const refresh = () => {
  revalidatePath("/website", "layout");
  revalidatePath("/my", "layout");
};
const str = (form: FormData, k: string, max = 500) => String(form.get(k) ?? "").trim().slice(0, max);

export async function toggleFlagAction(form: FormData) {
  const userId = await consoleUserId();
  if (!userId) return;
  const key = String(form.get("key") ?? "");
  if (!FLAG_INFO.some((f) => f.key === key)) return;
  const st = await getSiteSettingsFresh();
  await saveSiteSetting("flags", { ...st.flags, [key]: form.get("on") === "1" }, userId);
  refresh();
}

export async function toggleSectionAction(form: FormData) {
  const userId = await consoleUserId();
  if (!userId) return;
  const key = String(form.get("key") ?? "");
  if (!SECTIONS.some((s) => s.key === key)) return;
  const st = await getSiteSettingsFresh();
  await saveSiteSetting("sections", { ...st.sections, [key]: form.get("on") === "1" }, userId);
  refresh();
}

export async function saveBusinessAction(_p: SaveState, form: FormData): Promise<SaveState> {
  const userId = await consoleUserId();
  if (!userId) return { error: "Your session has ended. Sign in again." };
  const value: Record<string, string> = {};
  for (const f of BUSINESS_FIELDS) value[f.key] = str(form, f.key, 600);
  if (value.whatsapp.replace(/\D/g, "").length < 10) return { error: "Enter the WhatsApp number with country code, e.g. 918590000868." };
  for (const k of ["map_link", "review_link", "instagram_url", "facebook_url"]) {
    if (value[k] && !/^https:\/\//.test(value[k])) return { error: "Links must start with https://" };
  }
  await saveSiteSetting("business", value, userId);
  refresh();
  return { ok: "Business details saved. The website is updated." };
}

export async function saveFieldsAction(_p: SaveState, form: FormData): Promise<SaveState> {
  const userId = await consoleUserId();
  if (!userId) return { error: "Your session has ended. Sign in again." };
  const value: Record<string, string> = {};
  for (const [k, v] of form.entries()) {
    if (!k.startsWith("f:")) continue;
    const text = String(v).trim().slice(0, 1200);
    if (text) value[k.slice(2)] = text;
  }
  await saveSiteSetting("fields", value, userId);
  refresh();
  return { ok: "Texts saved. The website is updated." };
}

export async function saveServicesAction(_p: SaveState, form: FormData): Promise<SaveState> {
  const userId = await consoleUserId();
  if (!userId) return { error: "Your session has ended. Sign in again." };
  let list: ServiceItem[];
  try {
    list = JSON.parse(String(form.get("services") ?? "[]"));
  } catch {
    return { error: "Something went wrong reading the list. Please try again." };
  }
  const clean: ServiceItem[] = [];
  for (const s of list.slice(0, 40)) {
    const title = String(s.title ?? "").trim().slice(0, 60);
    if (!title) return { error: "Every service needs a name." };
    clean.push({
      title,
      text: String(s.text ?? "").trim().slice(0, 200),
      price: Math.max(0, Math.round(Number(s.price) || 0)),
      unit: SERVICE_UNITS.includes(s.unit) ? s.unit : "piece",
      icon: SITE_ICONS[s.icon] ? s.icon : "sparkle",
      hidden: !!s.hidden,
    });
  }
  if (!clean.length) return { error: "Add at least one service." };
  await saveSiteSetting("services", clean, userId);
  refresh();
  return { ok: "Services and prices saved. The website is updated." };
}

export async function saveSeoAction(_p: SaveState, form: FormData): Promise<SaveState> {
  const userId = await consoleUserId();
  if (!userId) return { error: "Your session has ended. Sign in again." };
  const v: Seo = {
    title: str(form, "title", 120),
    description: str(form, "description", 320),
    keywords: str(form, "keywords", 300),
    canonical: str(form, "canonical", 200) || DEFAULT_SEO.canonical,
    og_title: str(form, "og_title", 120),
    og_description: str(form, "og_description", 320),
    og_image: str(form, "og_image", 400) || DEFAULT_SEO.og_image,
    indexing: form.get("indexing") === "on",
    google_verification: str(form, "google_verification", 200).replace(/^.*content="([^"]+)".*$/, "$1"),
    bing_verification: str(form, "bing_verification", 200).replace(/^.*content="([^"]+)".*$/, "$1"),
    ga_id: str(form, "ga_id", 30).toUpperCase(),
    local_business: form.get("local_business") === "on",
  };
  if (!v.title) return { error: "The page title can't be empty." };
  if (!v.description) return { error: "The description can't be empty." };
  if (!/^https:\/\//.test(v.canonical) || !/^https:\/\//.test(v.og_image)) return { error: "The page address and share image must start with https://" };
  if (v.ga_id && !/^G-[A-Z0-9]{4,20}$/.test(v.ga_id)) return { error: "The Google Analytics ID looks like G-ABC123XYZ." };
  await saveSiteSetting("seo", v, userId);
  refresh();
  return { ok: "SEO settings saved. Google will pick them up the next time it visits." };
}

function windows(raw: string): PickupWindow[] | null {
  const out: PickupWindow[] = [];
  for (const part of raw.split(/[,\n]+/).map((x) => x.trim()).filter(Boolean)) {
    const m = part.match(/^(\d{1,2})(?::(\d{2}))?\s*[-–]\s*(\d{1,2})(?::(\d{2}))?$/);
    if (!m) return null;
    const a = `${m[1].padStart(2, "0")}:${m[2] ?? "00"}`, b = `${m[3].padStart(2, "0")}:${m[4] ?? "00"}`;
    if (a >= b || Number(m[1]) > 23 || Number(m[3]) > 23) return null;
    out.push({ start: a, end: b });
  }
  return out;
}

export async function savePickupAction(_p: SaveState, form: FormData): Promise<SaveState> {
  const userId = await consoleUserId();
  if (!userId) return { error: "Your session has ended. Sign in again." };
  const weekday = windows(str(form, "weekday_windows", 400));
  const sunday = windows(str(form, "sunday_windows", 400));
  if (!weekday || !sunday) return { error: "Write the time windows like 9-11, 11-13, 14-16 (24-hour clock)." };
  const n = (k: string, min: number, max: number) => Math.min(max, Math.max(min, Math.round(Number(form.get(k)) || 0)));
  await saveSiteSetting(
    "pickup",
    { radius_km: n("radius_km", 1, 100), capacity: n("capacity", 1, 50), days_ahead: n("days_ahead", 1, 14), lead_minutes: n("lead_minutes", 0, 1440), weekday_windows: weekday, sunday_windows: sunday },
    userId
  );
  refresh();
  return { ok: "Pickup settings saved." };
}

export async function restoreAction(form: FormData) {
  const userId = await consoleUserId();
  if (!userId) return;
  const key = String(form.get("key") ?? "") as SettingKey;
  if (!["sections", "fields", "business", "services", "seo", "pickup", "flags"].includes(key)) return;
  await restorePrevious(key, userId);
  refresh();
}
