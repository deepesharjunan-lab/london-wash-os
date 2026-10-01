"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { afterConsoleStatusChange } from "@/lib/staff/flow";
import { onOrderStatus, onPayment } from "@/lib/loyalty/ledger";

export async function updateOrderStatus(orderId: string, status: string) {
  const supabase = createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return { error: "You are not signed in." };

  const { error } = await supabase.from("order").update({ status }).eq("id", orderId);
  if (error) return { error: error.message };

  await onOrderStatus(supabase, orderId, status); // loyalty points; never throws
  await afterConsoleStatusChange(orderId, status, null); // garment stages + customer alert; never throws

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

/** Creates one tagged garment per piece for an order that has none (orders placed before tags existed). */
export async function createGarmentTags(orderId: string) {
  const supabase = createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return { error: "You are not signed in." };

  const { data: items } = await supabase.from("order_item").select("id, quantity, item_id").eq("order_id", orderId);
  const rows = (items ?? []) as { id: string; quantity: number; item_id: string | null }[];
  if (!rows.length) return { error: "This order has no items." };
  const { count } = await supabase.from("garment").select("id", { count: "exact", head: true }).in("order_item_id", rows.map((r) => r.id));
  if ((count ?? 0) > 0) return { error: "This order already has garment tags." };

  const ids = [...new Set(rows.map((r) => r.item_id).filter(Boolean))] as string[];
  const { data: pieceRows } = ids.length ? await supabase.from("item").select("id, pieces").in("id", ids) : { data: [] as { id: string; pieces: number }[] };
  const piecesOf = new Map(((pieceRows ?? []) as { id: string; pieces: number }[]).map((p) => [p.id, Math.max(1, Number(p.pieces) || 1)] as [string, number]));
  const unitsOf = (r: { quantity: number; item_id: string | null }) => Number(r.quantity || 0) * (r.item_id ? piecesOf.get(r.item_id) ?? 1 : 1);
  const total = rows.reduce((a, r) => a + unitsOf(r), 0);
  if (total <= 0 || total > 500) return { error: "Check the item quantities on this order." };
  const { data: codes, error: codeError } = await supabase.rpc("generate_garment_tags", { p_count: total });
  if (codeError || !codes) return { error: "Couldn't create tag numbers." };
  const list = [...(codes as string[])];
  const { error } = await supabase.from("garment").insert(
    rows.flatMap((r) => Array.from({ length: unitsOf(r) }, () => ({ order_item_id: r.id, item_id: r.item_id, tag_code: list.shift() })))
  );
  if (error) return { error: error.message };
  revalidatePath(`/orders/${orderId}`);
  return { ok: true };
}
