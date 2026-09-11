"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function addLoyaltyTier(formData: FormData) {
  const name = String(formData.get("name") || "").trim();
  if (!name) return;
  const min_points = Number(formData.get("min_points") || 0);
  const perk_description = String(formData.get("perk_description") || "").trim() || null;

  const supabase = createClient();
  const { data: auth } = await supabase.auth.getUser();
  const { data: me } = auth?.user
    ? await supabase.from("user").select("branch_id").eq("auth_user_id", auth.user.id).single()
    : { data: null };

  const { error } = await supabase.from("loyalty_tier").insert({
    branch_id: me?.branch_id ?? null,
    name,
    min_points,
    perk_description,
  });
  if (error) console.error(error);
  revalidatePath("/loyalty");
}

export async function enrollLoyaltyAccount(formData: FormData) {
  const customer_id = String(formData.get("customer_id") || "");
  if (!customer_id) return;
  const loyalty_tier_id = String(formData.get("loyalty_tier_id") || "") || null;

  const supabase = createClient();
  const { error } = await supabase.from("loyalty_account").insert({
    customer_id,
    loyalty_tier_id,
    points_balance: 0,
  });
  if (error) console.error(error);
  revalidatePath("/loyalty");
}

export async function adjustLoyaltyPoints(formData: FormData) {
  const loyalty_account_id = String(formData.get("loyalty_account_id") || "");
  if (!loyalty_account_id) return;
  const pointsRaw = String(formData.get("points") || "").trim();
  const points = Number(pointsRaw);
  if (!points) return;
  const type = String(formData.get("type") || "adjustment");

  const supabase = createClient();
  const { data: account } = await supabase
    .from("loyalty_account")
    .select("points_balance")
    .eq("id", loyalty_account_id)
    .single();
  if (!account) return;

  const balance_after = account.points_balance + points;

  const { error: txnError } = await supabase.from("loyalty_transaction").insert({
    loyalty_account_id,
    type,
    points,
    balance_after,
  });
  if (txnError) console.error(txnError);

  const { error: updateError } = await supabase
    .from("loyalty_account")
    .update({ points_balance: balance_after })
    .eq("id", loyalty_account_id);
  if (updateError) console.error(updateError);

  revalidatePath("/loyalty");
}

export async function addSubscriptionPlan(formData: FormData) {
  const name = String(formData.get("name") || "").trim();
  if (!name) return;
  const priceRaw = String(formData.get("price") || "").trim();
  const price_minor = priceRaw ? Math.round(Number(priceRaw) * 100) : 0;
  const includedRaw = String(formData.get("included_pieces") || "").trim();
  const billing_cycle = String(formData.get("billing_cycle") || "monthly");

  const supabase = createClient();
  const { data: auth } = await supabase.auth.getUser();
  const { data: me } = auth?.user
    ? await supabase.from("user").select("branch_id").eq("auth_user_id", auth.user.id).single()
    : { data: null };

  const { error } = await supabase.from("subscription_plan").insert({
    branch_id: me?.branch_id ?? null,
    name,
    price_minor,
    currency: "INR",
    included_pieces: includedRaw ? Number(includedRaw) : null,
    billing_cycle,
    is_active: true,
  });
  if (error) console.error(error);
  revalidatePath("/loyalty");
}

export async function toggleSubscriptionPlan(formData: FormData) {
  const id = String(formData.get("id") || "");
  if (!id) return;
  const nextActive = String(formData.get("next_active") || "true") === "true";
  const supabase = createClient();
  const { error } = await supabase
    .from("subscription_plan")
    .update({ is_active: nextActive })
    .eq("id", id);
  if (error) console.error(error);
  revalidatePath("/loyalty");
}

export async function createSubscription(formData: FormData) {
  const customer_id = String(formData.get("customer_id") || "");
  const subscription_plan_id = String(formData.get("subscription_plan_id") || "");
  if (!customer_id || !subscription_plan_id) return;
  const starts_at =
    String(formData.get("starts_at") || "").trim() || new Date().toISOString().slice(0, 10);

  const supabase = createClient();
  const { error } = await supabase.from("subscription").insert({
    customer_id,
    subscription_plan_id,
    status: "active",
    starts_at,
  });
  if (error) console.error(error);
  revalidatePath("/loyalty");
}

export async function updateSubscriptionStatus(formData: FormData) {
  const id = String(formData.get("id") || "");
  if (!id) return;
  const status = String(formData.get("status") || "");
  if (!status) return;
  const supabase = createClient();
  const { error } = await supabase.from("subscription").update({ status }).eq("id", id);
  if (error) console.error(error);
  revalidatePath("/loyalty");
}
