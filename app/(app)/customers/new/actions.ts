"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function createCustomer(
  _prevState: { error?: string } | undefined,
  formData: FormData
) {
  const full_name = String(formData.get("full_name") || "").trim();
  const phone = String(formData.get("phone") || "").trim();
  const email = String(formData.get("email") || "").trim();
  const tier = String(formData.get("tier") || "Silver");
  const fold_preference = String(formData.get("fold_preference") || "").trim();
  const detergent_preference = String(formData.get("detergent_preference") || "").trim();

  if (!full_name || !phone) {
    return { error: "Name and phone are required." };
  }

  const supabase = createClient();

  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) {
    return { error: "You are not signed in." };
  }

  const { data: me, error: meError } = await supabase
    .from("user")
    .select("id, branch_id")
    .eq("auth_user_id", auth.user.id)
    .single();

  if (meError || !me) {
    return { error: "Could not resolve your staff profile or branch." };
  }

  const { data: created, error } = await supabase
    .from("customer")
    .insert({
      branch_id: me.branch_id,
      full_name,
      phone,
      email: email || null,
      tier,
      fold_preference: fold_preference || null,
      detergent_preference: detergent_preference || null,
    })
    .select("id")
    .single();

  if (error) {
    return { error: error.message };
  }

  redirect(`/customers/${created.id}`);
}
