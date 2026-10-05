import { revalidateTag, unstable_cache } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { DEFAULT_BUSINESS, DEFAULT_FLAGS, DEFAULT_PICKUP, DEFAULT_SEO, sectionDefaults, type Business, type PickupConfig, type Seo, type ServiceItem, type SiteFlags } from "./defs";
import { DEFAULT_SERVICES } from "./template";

// Website CMS settings (site_setting, one row per group) merged with the
// defaults. Cached for 5 minutes and refreshed straight away on every save.
// Server-only. Also the home of the system-wide "Pickup & delivery" switch.

export type SiteSettings = {
  flags: SiteFlags;
  sections: Record<string, boolean>;
  fields: Record<string, string>;
  business: Business;
  services: ServiceItem[];
  seo: Seo;
  pickup: PickupConfig;
  updatedAt: string | null;
};
export type SettingKey = "flags" | "sections" | "fields" | "business" | "services" | "seo" | "pickup";

const TAG = "site-settings";

async function load(): Promise<SiteSettings> {
  const rows = new Map<string, { value: any; updated_at: string }>();
  try {
    const { data } = await createAdminClient().from("site_setting").select("key, value, updated_at");
    for (const r of (data ?? []) as { key: string; value: any; updated_at: string }[]) rows.set(r.key, r);
  } catch {
    // table not created yet: defaults
  }
  const v = (k: string) => rows.get(k)?.value;
  const services = Array.isArray(v("services")) && v("services").length ? (v("services") as ServiceItem[]) : (DEFAULT_SERVICES as ServiceItem[]);
  const updatedAt = [...rows.values()].map((r) => r.updated_at).sort().pop() ?? null;
  return {
    flags: { ...DEFAULT_FLAGS, ...(v("flags") ?? {}) },
    sections: { ...sectionDefaults(), ...(v("sections") ?? {}) },
    fields: { ...(v("fields") ?? {}) },
    business: { ...DEFAULT_BUSINESS, ...(v("business") ?? {}) },
    services,
    seo: { ...DEFAULT_SEO, ...(v("seo") ?? {}) },
    pickup: { ...DEFAULT_PICKUP, ...(v("pickup") ?? {}) },
    updatedAt,
  };
}

/** All website settings (cached). */
export const getSiteSettings = unstable_cache(load, ["site-settings-v1"], { tags: [TAG], revalidate: 300 });

/** Uncached read, for the CMS editor. */
export const getSiteSettingsFresh = load;

/** Is pickup & delivery switched on? (website, Club app, WhatsApp bot) */
export async function pickupEnabled() {
  return (await getSiteSettings()).flags.pickup === true;
}

/** Saves one group (keeping the old value in the history) and refreshes the live site. */
export async function saveSiteSetting(key: SettingKey, value: unknown, userId: string | null) {
  const db = createAdminClient();
  const { data: old } = await db.from("site_setting").select("value").eq("key", key).maybeSingle();
  if (old) await db.from("site_setting_history").insert({ key, value: (old as { value: unknown }).value, saved_by_user_id: userId });
  const { error } = await db.from("site_setting").upsert({ key, value, updated_at: new Date().toISOString(), updated_by_user_id: userId }, { onConflict: "key" });
  if (error) throw new Error(error.message);
  revalidateTag(TAG);
}

/** Puts back the version saved before the last change. */
export async function restorePrevious(key: SettingKey, userId: string | null) {
  const db = createAdminClient();
  const { data } = await db.from("site_setting_history").select("id, value").eq("key", key).order("saved_at", { ascending: false }).limit(1).maybeSingle();
  if (!data) return false;
  const h = data as { id: string; value: unknown };
  const { error } = await db.from("site_setting").upsert({ key, value: h.value, updated_at: new Date().toISOString(), updated_by_user_id: userId }, { onConflict: "key" });
  if (error) throw new Error(error.message);
  await db.from("site_setting_history").delete().eq("id", h.id);
  revalidateTag(TAG);
  return true;
}
