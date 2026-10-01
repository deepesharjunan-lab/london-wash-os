"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

async function getMyBranch() {
  const supabase = createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return { supabase, branchId: null as string | null };
  const { data: me } = await supabase
    .from("user")
    .select("branch_id")
    .eq("auth_user_id", auth.user.id)
    .single();
  return { supabase, branchId: (me?.branch_id as string | undefined) ?? null };
}

const UNITS = ["per_piece", "per_kg", "per_set"];

/* ------------------------------------------------------------------ */
/* Services                                                             */
/* ------------------------------------------------------------------ */

export async function createServiceCategory(formData: FormData) {
  const name = String(formData.get("name") || "").trim();
  if (!name) return;
  const { supabase, branchId } = await getMyBranch();
  if (!branchId) return;
  const { error } = await supabase.from("service_category").insert({ branch_id: branchId, name });
  if (error) console.error("createServiceCategory error:", error.message);
  revalidatePath("/services");
}

export async function createService(formData: FormData) {
  const name = String(formData.get("name") || "").trim();
  const service_category_id = String(formData.get("service_category_id") || "");
  const default_unit = String(formData.get("default_unit") || "piece");
  if (!name || !service_category_id) return;
  const { supabase, branchId } = await getMyBranch();
  if (!branchId) return;
  const { error } = await supabase.from("service").insert({ branch_id: branchId, name, service_category_id, default_unit });
  if (error) console.error("createService error:", error.message);
  revalidatePath("/services");
}

export async function toggleService(formData: FormData) {
  const id = String(formData.get("id") || "");
  const next = String(formData.get("next_active") || "") === "true";
  if (!id) return;
  const { supabase } = await getMyBranch();
  const { error } = await supabase.from("service").update({ is_active: next }).eq("id", id);
  if (error) console.error("toggleService error:", error.message);
  revalidatePath("/services");
}

/* ------------------------------------------------------------------ */
/* Products                                                             */
/* ------------------------------------------------------------------ */

export async function createItem(formData: FormData) {
  const name = String(formData.get("name") || "").trim();
  const category = String(formData.get("category") || "").trim();
  if (!name) return;
  const { supabase, branchId } = await getMyBranch();
  if (!branchId) return;
  const { error } = await supabase.from("item").insert({ branch_id: branchId, name, category: category || null });
  if (error) console.error("createItem error:", error.message);
  revalidatePath("/services/products");
}

export async function updateItem(formData: FormData) {
  const id = String(formData.get("id") || "");
  const name = String(formData.get("name") || "").trim();
  const category = String(formData.get("category") || "").trim();
  if (!id || !name) return;
  const { supabase } = await getMyBranch();
  const { error } = await supabase.from("item").update({ name, category: category || null }).eq("id", id);
  if (error) console.error("updateItem error:", error.message);
  revalidatePath("/services/products");
}

export async function toggleItem(formData: FormData) {
  const id = String(formData.get("id") || "");
  const next = String(formData.get("next_active") || "") === "true";
  if (!id) return;
  const { supabase } = await getMyBranch();
  const { error } = await supabase.from("item").update({ is_active: next }).eq("id", id);
  if (error) console.error("toggleItem error:", error.message);
  revalidatePath("/services/products");
}

/* ------------------------------------------------------------------ */
/* Price lists                                                          */
/* ------------------------------------------------------------------ */

export async function createPriceListProfile(formData: FormData) {
  const name = String(formData.get("name") || "").trim();
  const description = String(formData.get("description") || "").trim();
  const is_default = formData.get("is_default") === "on";
  if (!name) return;
  const { supabase, branchId } = await getMyBranch();
  if (!branchId) return;
  if (is_default) await supabase.from("price_list_profile").update({ is_default: false }).eq("branch_id", branchId).eq("is_default", true);
  const { data, error } = await supabase
    .from("price_list_profile")
    .insert({ branch_id: branchId, name, description: description || null, is_default })
    .select("id")
    .single();
  if (error) console.error("createPriceListProfile error:", error.message);
  revalidatePath("/services/price-lists");
  // Straight on to adding products to the new list.
  if (data) redirect(`/services/prices?list=${(data as { id: string }).id}`);
}

export async function setDefaultPriceList(formData: FormData) {
  const id = String(formData.get("id") || "");
  if (!id) return;
  const { supabase, branchId } = await getMyBranch();
  if (!branchId) return;
  // Only one default per branch: clear the old one first.
  await supabase.from("price_list_profile").update({ is_default: false }).eq("branch_id", branchId).eq("is_default", true);
  const { error } = await supabase.from("price_list_profile").update({ is_default: true, is_active: true }).eq("id", id);
  if (error) console.error("setDefaultPriceList error:", error.message);
  revalidatePath("/services/price-lists");
}

export async function togglePriceList(formData: FormData) {
  const id = String(formData.get("id") || "");
  const next = String(formData.get("next_active") || "") === "true";
  if (!id) return;
  const { supabase } = await getMyBranch();
  const patch = next ? { is_active: true } : { is_active: false, is_default: false };
  const { error } = await supabase.from("price_list_profile").update(patch).eq("id", id);
  if (error) console.error("togglePriceList error:", error.message);
  revalidatePath("/services/price-lists");
}

/* ------------------------------------------------------------------ */
/* Products in a price list                                             */
/* ------------------------------------------------------------------ */

/**
 * Saves prices for one price list and one service, for many products at once.
 * Fields: price__<itemId> (or price__any for a service-level price). Blank
 * fields are left as they are; use Remove to take a product off the list.
 */
export async function savePrices(formData: FormData) {
  const listId = String(formData.get("price_list_profile_id") || "");
  const serviceId = String(formData.get("service_id") || "");
  const unitRaw = String(formData.get("unit") || "per_piece");
  const unit = UNITS.includes(unitRaw) ? unitRaw : "per_piece";
  const back = (q: string) => redirect(`/services/prices?list=${listId}&service=${serviceId}&${q}`);
  if (!listId || !serviceId) redirect("/services/prices");

  const wanted: { itemId: string | null; minor: number }[] = [];
  let invalid = 0;
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("price__")) continue;
    const raw = String(value).trim();
    if (!raw) continue;
    const rupees = Number(raw);
    if (!Number.isFinite(rupees) || rupees < 0) {
      invalid++;
      continue;
    }
    const id = key.slice("price__".length);
    wanted.push({ itemId: id === "any" ? null : id, minor: Math.round(rupees * 100) });
  }
  if (invalid) back(`error=${encodeURIComponent(`${invalid} price(s) weren't numbers. Nothing was saved.`)}`);
  if (!wanted.length) back(`error=${encodeURIComponent("Enter at least one price.")}`);

  const { supabase } = await getMyBranch();
  const { data: current } = await supabase
    .from("price_list_entry")
    .select("id, item_id")
    .eq("price_list_profile_id", listId)
    .eq("service_id", serviceId)
    .is("effective_to", null);
  const existing = new Map(((current ?? []) as { id: string; item_id: string | null }[]).map((e) => [e.item_id ?? "any", e.id] as [string, string]));

  let added = 0;
  let updated = 0;
  const inserts: Record<string, unknown>[] = [];
  for (const w of wanted) {
    const id = existing.get(w.itemId ?? "any");
    if (id) {
      const { error } = await supabase.from("price_list_entry").update({ price_minor: w.minor, unit, is_active: true }).eq("id", id);
      if (error) console.error("savePrices update error:", error.message);
      else updated++;
    } else {
      inserts.push({ price_list_profile_id: listId, service_id: serviceId, item_id: w.itemId, price_minor: w.minor, unit });
    }
  }
  if (inserts.length) {
    const { error } = await supabase.from("price_list_entry").insert(inserts);
    if (error) {
      console.error("savePrices insert error:", error.message);
      back(`error=${encodeURIComponent("Couldn't add the new prices. Please try again.")}`);
    }
    added = inserts.length;
  }
  revalidatePath("/services/prices");
  back(`saved=${encodeURIComponent(`${added} added, ${updated} updated`)}`);
}

/** Takes a product off a price list. The old row is kept (past orders point to it) but closed. */
export async function removePriceEntry(formData: FormData) {
  const id = String(formData.get("id") || "");
  const listId = String(formData.get("list") || "");
  const serviceId = String(formData.get("service") || "");
  if (!id) return;
  const { supabase } = await getMyBranch();
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  const { error } = await supabase.from("price_list_entry").update({ is_active: false, effective_to: today }).eq("id", id);
  if (error) console.error("removePriceEntry error:", error.message);
  revalidatePath("/services/prices");
  redirect(`/services/prices?list=${listId}${serviceId ? `&service=${serviceId}` : ""}&saved=${encodeURIComponent("Removed from the price list")}`);
}

// Kept for any old form still posting a single price.
export async function createPriceListEntry(formData: FormData) {
  const price_list_profile_id = String(formData.get("price_list_profile_id") || "");
  const service_id = String(formData.get("service_id") || "");
  const item_id = String(formData.get("item_id") || "") || null;
  const priceRupees = Number(formData.get("price") || 0);
  const unit = String(formData.get("unit") || "per_piece");
  if (!price_list_profile_id || !service_id || !priceRupees) return;
  const { supabase } = await getMyBranch();
  const { error } = await supabase.from("price_list_entry").insert({
    price_list_profile_id, service_id, item_id,
    price_minor: Math.round(priceRupees * 100),
    unit,
  });
  if (error) console.error("createPriceListEntry error:", error.message);
  revalidatePath("/services/prices");
}
