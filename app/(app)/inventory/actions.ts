"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function createInventoryItem(formData: FormData) {
  const name = String(formData.get("name") || "").trim();
  const unit = String(formData.get("unit") || "unit").trim();
  const reorder_level = Number(formData.get("reorder_level") || 0);
  if (!name) return;

  const supabase = createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return;

  const { data: me } = await supabase
    .from("user")
    .select("branch_id")
    .eq("auth_user_id", auth.user.id)
    .single();
  if (!me) return;

  const { error } = await supabase.from("inventory_item").insert({
    branch_id: me.branch_id,
    name,
    unit: unit || "unit",
    reorder_level,
    quantity_on_hand: 0,
  });
  if (error) console.error(error);

  revalidatePath("/inventory");
}

export async function recordStockMovement(formData: FormData) {
  const item_id = String(formData.get("item_id") || "");
  const type = String(formData.get("type") || "");
  const quantity = Number(formData.get("quantity") || 0);
  const note = String(formData.get("note") || "").trim() || null;
  if (!item_id || !type || !quantity) return;

  const supabase = createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return;

  const { data: item, error: itemError } = await supabase
    .from("inventory_item")
    .select("quantity_on_hand")
    .eq("id", item_id)
    .single();
  if (itemError || !item) {
    console.error(itemError);
    return;
  }

  const isOut = type === "consumption" || type === "transfer_out";
  const isAdjustment = type === "adjustment";
  const delta = isOut ? -Math.abs(quantity) : isAdjustment ? quantity : Math.abs(quantity);
  const newBalance = Number(item.quantity_on_hand) + delta;

  const { error: txnError } = await supabase.from("stock_transaction").insert({
    inventory_item_id: item_id,
    type,
    quantity: delta,
    balance_after: newBalance,
    note,
  });
  if (txnError) {
    console.error(txnError);
    return;
  }

  const { error: updateError } = await supabase
    .from("inventory_item")
    .update({ quantity_on_hand: newBalance })
    .eq("id", item_id);
  if (updateError) console.error(updateError);

  revalidatePath("/inventory");
}
