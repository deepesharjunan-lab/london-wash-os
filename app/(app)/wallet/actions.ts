"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function createMembership(formData: FormData) {
  const customer_id = String(formData.get("customer_id") || "");
  const plan_name = String(formData.get("plan_name") || "").trim();
  if (!customer_id || !plan_name) return;
  const startsAtRaw = String(formData.get("starts_at") || "");
  const endsAtRaw = String(formData.get("ends_at") || "");
  const starts_at = startsAtRaw || new Date().toISOString().slice(0, 10);
  const ends_at = endsAtRaw || null;
  const supabase = createClient();
  const { error } = await supabase
    .from("membership")
    .insert({ customer_id, plan_name, starts_at, ends_at, is_active: true });
  if (error) console.error(error);
  revalidatePath("/wallet");
}

export async function toggleMembershipActive(formData: FormData) {
  const id = String(formData.get("id") || "");
  if (!id) return;
  const nextActive = String(formData.get("next_active") || "") === "true";
  const supabase = createClient();
  const { error } = await supabase.from("membership").update({ is_active: nextActive }).eq("id", id);
  if (error) console.error(error);
  revalidatePath("/wallet");
}

export async function createWallet(formData: FormData) {
  const customer_id = String(formData.get("customer_id") || "");
  if (!customer_id) return;
  const supabase = createClient();
  const { data: existing } = await supabase.from("wallet").select("id").eq("customer_id", customer_id).maybeSingle();
  if (existing) {
    revalidatePath("/wallet");
    return;
  }
  const { error } = await supabase.from("wallet").insert({ customer_id, balance_minor: 0, currency: "INR" });
  if (error) console.error(error);
  revalidatePath("/wallet");
}

export async function createWalletTransaction(formData: FormData) {
  const wallet_id = String(formData.get("wallet_id") || "");
  const type = String(formData.get("type") || "");
  const amountRupees = Number(formData.get("amount") || 0);
  if (!wallet_id || !type || !amountRupees) return;
  const amount_minor = Math.round(amountRupees * 100);
  const note = String(formData.get("note") || "").trim() || null;
  const supabase = createClient();

  const { data: wallet } = await supabase.from("wallet").select("balance_minor").eq("id", wallet_id).single();
  if (!wallet) return;

  const isDebit = type === "debit";
  const delta = isDebit ? -Math.abs(amount_minor) : Math.abs(amount_minor);
  const balance_after_minor = Number(wallet.balance_minor || 0) + delta;

  const { error: txnError } = await supabase
    .from("wallet_transaction")
    .insert({ wallet_id, type, amount_minor: Math.abs(amount_minor), balance_after_minor, note });
  if (txnError) {
    console.error(txnError);
    return;
  }

  const { error: walletError } = await supabase
    .from("wallet")
    .update({ balance_minor: balance_after_minor })
    .eq("id", wallet_id);
  if (walletError) console.error(walletError);

  revalidatePath("/wallet");
}
