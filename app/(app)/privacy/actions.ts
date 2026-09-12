"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function createConsentRecord(formData: FormData) {
  const customer_id = String(formData.get("customer_id") || "");
  const consent_type = String(formData.get("consent_type") || "");
  const status = String(formData.get("status") || "");
  const source = String(formData.get("source") || "");
  if (!customer_id || !consent_type || !status || !source) return;
  const supabase = createClient();
  const { error } = await supabase.from("consent_record").insert({
    customer_id,
    consent_type,
    status,
    source,
  });
  if (error) console.error(error);
  revalidatePath("/privacy");
}

export async function createDataRightsRequest(formData: FormData) {
  const customer_id = String(formData.get("customer_id") || "");
  const request_type = String(formData.get("request_type") || "");
  if (!customer_id || !request_type) return;
  const supabase = createClient();
  const { error } = await supabase.from("data_rights_request").insert({
    customer_id,
    request_type,
    status: "pending",
  });
  if (error) console.error(error);
  revalidatePath("/privacy");
}

export async function updateDataRightsRequestStatus(formData: FormData) {
  const id = String(formData.get("id") || "");
  const status = String(formData.get("status") || "");
  if (!id || !status) return;
  const supabase = createClient();
  const patch: any = { status };
  if (status === "fulfilled") {
    patch.fulfilled_at = new Date().toISOString();
  }
  const { error } = await supabase.from("data_rights_request").update(patch).eq("id", id);
  if (error) console.error(error);
  revalidatePath("/privacy");
}

export async function addAnonymisationNote(formData: FormData) {
  const id = String(formData.get("id") || "");
  const anonymisation_note = String(formData.get("anonymisation_note") || "").trim();
  if (!id || !anonymisation_note) return;
  const supabase = createClient();
  const { error } = await supabase
    .from("data_rights_request")
    .update({ anonymisation_note })
    .eq("id", id);
  if (error) console.error(error);
  revalidatePath("/privacy");
}
