"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function updateBranch(formData: FormData) {
  const branch_id = String(formData.get("branch_id") || "");
  if (!branch_id) return;
  const name = String(formData.get("name") || "").trim();
  const code = String(formData.get("code") || "").trim();
  const address = String(formData.get("address") || "").trim() || null;
  const city = String(formData.get("city") || "").trim() || null;
  const state = String(formData.get("state") || "").trim() || null;
  const phone = String(formData.get("phone") || "").trim() || null;
  if (!name || !code) return;

  const supabase = createClient();
  const { error } = await supabase
    .from("branch")
    .update({ name, code, address, city, state, phone })
    .eq("id", branch_id);
  if (error) console.error(error);
  revalidatePath("/settings");
}

export async function updateOrganization(formData: FormData) {
  const organization_id = String(formData.get("organization_id") || "");
  if (!organization_id) return;
  const name = String(formData.get("name") || "").trim();
  const legal_name = String(formData.get("legal_name") || "").trim() || null;
  const gstin = String(formData.get("gstin") || "").trim() || null;
  if (!name) return;

  const supabase = createClient();
  const { error } = await supabase
    .from("organization")
    .update({ name, legal_name, gstin })
    .eq("id", organization_id);
  if (error) console.error(error);
  revalidatePath("/settings");
}

export async function addTaxRule(formData: FormData) {
  const service_category_id = String(formData.get("service_category_id") || "");
  if (!service_category_id) return;
  const sac_code = String(formData.get("sac_code") || "").trim() || null;
  const cgstRaw = String(formData.get("cgst_percent") || "").trim();
  const sgstRaw = String(formData.get("sgst_percent") || "").trim();
  const igstRaw = String(formData.get("igst_percent") || "").trim();
  const effective_from = String(formData.get("effective_from") || "").trim();

  const cgst_percent = cgstRaw ? Number(cgstRaw) : null;
  const sgst_percent = sgstRaw ? Number(sgstRaw) : null;
  const igst_percent = igstRaw ? Number(igstRaw) : null;
  const rate_percent =
    cgst_percent !== null && sgst_percent !== null
      ? cgst_percent + sgst_percent
      : igst_percent !== null
      ? igst_percent
      : null;

  const supabase = createClient();
  const payload: Record<string, unknown> = {
    service_category_id,
    sac_code,
    cgst_percent,
    sgst_percent,
    igst_percent,
    rate_percent,
  };
  if (effective_from) payload.effective_from = effective_from;

  const { error } = await supabase.from("tax_rule").insert(payload);
  if (error) console.error(error);
  revalidatePath("/settings");
}

export async function endTaxRule(formData: FormData) {
  const id = String(formData.get("id") || "");
  if (!id) return;
  const supabase = createClient();
  const today = new Date().toISOString().slice(0, 10);
  const { error } = await supabase.from("tax_rule").update({ effective_to: today }).eq("id", id);
  if (error) console.error(error);
  revalidatePath("/settings");
}
