"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

type CartLine = {
  price_list_entry_id: string;
  service_id: string;
  item_id: string | null;
  unit: string;
  unit_price_minor: number;
  quantity: number;
};

export async function createOrder(input: {
  customer_id: string;
  price_list_profile_id: string | null;
  channel: string;
  lines: CartLine[];
}) {
  if (!input.customer_id) {
    return { error: "Select a customer." };
  }
  if (!input.lines || input.lines.length === 0) {
    return { error: "Add at least one item to the order." };
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

  const subtotal_minor = input.lines.reduce(
    (sum, l) => sum + Math.round(l.unit_price_minor) * l.quantity,
    0
  );
  const order_number = `ORD${Date.now().toString(36).toUpperCase()}`;

  const { data: order, error: orderError } = await supabase
    .from("order")
    .insert({
      branch_id: me.branch_id,
      order_number,
      customer_id: input.customer_id,
      price_list_profile_id: input.price_list_profile_id || null,
      channel: input.channel || "pos_counter",
      status: "draft",
      subtotal_minor,
      discount_minor: 0,
      tax_minor: 0,
      total_minor: subtotal_minor,
      placed_by_user_id: me.id,
    })
    .select("id")
    .single();

  if (orderError || !order) {
    return { error: orderError?.message || "Failed to create the order." };
  }

  const itemsPayload = input.lines.map((l) => ({
    order_id: order.id,
    price_list_entry_id: l.price_list_entry_id,
    service_id: l.service_id,
    item_id: l.item_id,
    quantity: l.quantity,
    unit_price_minor: Math.round(l.unit_price_minor),
    line_total_minor: Math.round(l.unit_price_minor) * l.quantity,
  }));

  const { error: itemsError } = await supabase.from("order_item").insert(itemsPayload);

  if (itemsError) {
    return { error: itemsError.message };
  }

  revalidatePath("/orders");
  redirect(`/orders/${order.id}`);
}
