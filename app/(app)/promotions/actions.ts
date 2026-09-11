"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

async function getBranchId(supabase: ReturnType<typeof createClient>) {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return null;
  const { data: me } = await supabase.from("user").select("branch_id").eq("auth_user_id", auth.user.id).single();
  return me?.branch_id ?? null;
}

export async function createPromotion(formData: FormData) {
  const name = String(formData.get("name") || "").trim();
  if (!name) return;
  const discountPercentRaw = String(formData.get("discount_percent") || "").trim();
  const discountAmountRaw = String(formData.get("discount_amount") || "").trim();
  const discount_percent = discountPercentRaw ? Number(discountPercentRaw) : null;
  const discount_amount_minor = discountAmountRaw ? Math.round(Number(discountAmountRaw) * 100) : null;
  const startsAtRaw = String(formData.get("starts_at") || "");
  const endsAtRaw = String(formData.get("ends_at") || "");
  const starts_at = startsAtRaw ? new Date(startsAtRaw).toISOString() : null;
  const ends_at = endsAtRaw ? new Date(endsAtRaw + "T23:59:59").toISOString() : null;
  const supabase = createClient();
  const branch_id = await getBranchId(supabase);
  const { error } = await supabase
    .from("promotion")
    .insert({ branch_id, name, discount_percent, discount_amount_minor, starts_at, ends_at, is_active: true });
  if (error) console.error(error);
  revalidatePath("/promotions");
}

export async function togglePromotionActive(formData: FormData) {
  const id = String(formData.get("id") || "");
  if (!id) return;
  const nextActive = String(formData.get("next_active") || "") === "true";
  const supabase = createClient();
  const { error } = await supabase.from("promotion").update({ is_active: nextActive }).eq("id", id);
  if (error) console.error(error);
  revalidatePath("/promotions");
}

export async function createCoupon(formData: FormData) {
  const code = String(formData.get("code") || "").trim().toUpperCase();
  if (!code) return;
  const promotion_id = String(formData.get("promotion_id") || "") || null;
  const maxRedemptionsRaw = String(formData.get("max_redemptions") || "").trim();
  const max_redemptions = maxRedemptionsRaw ? Number(maxRedemptionsRaw) : null;
  const supabase = createClient();
  const branch_id = await getBranchId(supabase);
  const { error } = await supabase
    .from("coupon")
    .insert({ branch_id, promotion_id, code, max_redemptions, redemptions_count: 0, is_active: true });
  if (error) console.error(error);
  revalidatePath("/promotions");
}

export async function toggleCouponActive(formData: FormData) {
  const id = String(formData.get("id") || "");
  if (!id) return;
  const nextActive = String(formData.get("next_active") || "") === "true";
  const supabase = createClient();
  const { error } = await supabase.from("coupon").update({ is_active: nextActive }).eq("id", id);
  if (error) console.error(error);
  revalidatePath("/promotions");
}
