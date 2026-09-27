"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { onOrderStatus, onPayment } from "@/lib/loyalty/ledger";

export async function updateOrderStatus(orderId: string, status: string) {
  const supabase = createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return { error: "You are not signed in." };

  const { error } = await supabase.from("order").update({ status }).eq("id", orderId);
  if (error) return { error: error.message };

  await onOrderStatus(supabase, orderId, status); // loyalty points; never throws

  revalidatePath(`/orders/${orderId}`);
  revalidatePath("/orders");
  return { ok: true };
}


export async function recordPayment(orderId: string, method: string, amountRupees: number) {
  const supabase = createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return { error: "You are not signed in." };

  const amount_minor = Math.round(amountRupees * 100);
  if (!amount_minor || amount_minor <= 0) return { error: "Enter a valid amount." };
  if (!method) return { error: "Choose a payment method." };

  const { error } = await supabase.from("payment").insert({
    order_id: orderId,
    method,
    amount_minor,
  });
  if (error) return { error: error.message };

  await onPayment(supabase, orderId); // referral bonus once the first order is paid; never throws

  revalidatePath(`/orders/${orderId}`);
  return { ok: true };
}
