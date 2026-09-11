"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

async function getBranchId(supabase: ReturnType<typeof createClient>) {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return null;
  const { data: me } = await supabase.from("user").select("branch_id").eq("auth_user_id", auth.user.id).single();
  return me?.branch_id ?? null;
}

export async function createReward(formData: FormData) {
  const name = String(formData.get("name") || "").trim();
  const points_cost = Number(formData.get("points_cost") || 0);
  if (!name || !points_cost) return;
  const supabase = createClient();
  const branch_id = await getBranchId(supabase);
  const { error } = await supabase.from("reward").insert({ name, points_cost, branch_id, is_active: true });
  if (error) console.error(error);
  revalidatePath("/referrals");
}

export async function toggleRewardActive(formData: FormData) {
  const id = String(formData.get("id") || "");
  if (!id) return;
  const nextActive = String(formData.get("next_active") || "") === "true";
  const supabase = createClient();
  const { error } = await supabase.from("reward").update({ is_active: nextActive }).eq("id", id);
  if (error) console.error(error);
  revalidatePath("/referrals");
}

export async function createReferral(formData: FormData) {
  const referrer_customer_id = String(formData.get("referrer_customer_id") || "");
  if (!referrer_customer_id) return;
  const referred_customer_id = String(formData.get("referred_customer_id") || "").trim() || null;
  const supabase = createClient();
  const { error } = await supabase
    .from("referral")
    .insert({ referrer_customer_id, referred_customer_id, status: "pending" });
  if (error) console.error(error);
  revalidatePath("/referrals");
}

export async function updateReferralStatus(formData: FormData) {
  const id = String(formData.get("id") || "");
  const status = String(formData.get("status") || "");
  if (!id || !status) return;
  const reward_id = String(formData.get("reward_id") || "").trim() || null;
  const supabase = createClient();
  const { error } = await supabase.from("referral").update({ status, reward_id }).eq("id", id);
  if (error) console.error(error);
  revalidatePath("/referrals");
}
