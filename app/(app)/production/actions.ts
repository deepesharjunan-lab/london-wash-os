"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { onOrderStatus } from "@/lib/loyalty/ledger";

export async function advanceOrderStatus(orderId: string, nextStatus: string) {
  const supabase = createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return { error: "You are not signed in." };

  const { error } = await supabase.from("order").update({ status: nextStatus }).eq("id", orderId);
  if (error) return { error: error.message };

  await onOrderStatus(supabase, orderId, nextStatus); // loyalty points; never throws

  revalidatePath("/production");
  revalidatePath("/orders");
  revalidatePath(`/orders/${orderId}`);
  return { ok: true };
}
