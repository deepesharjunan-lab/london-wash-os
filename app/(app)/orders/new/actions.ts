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

  const { data: insertedItems, error: itemsError } = await supabase
    .from("order_item")
    .insert(itemsPayload)
    .select("id, quantity, item_id");

  if (itemsError) {
    return { error: itemsError.message };
  }

  // Auto-create one trackable garment per physical piece so a printable
  // tag (with barcode) is ready the moment the order is placed.
  const totalPieces = (insertedItems || []).reduce((sum, it: any) => sum + Number(it.quantity), 0);
  if (totalPieces > 0) {
    const { data: tagCodes, error: tagError } = await supabase.rpc("generate_garment_tags", {
      p_count: totalPieces,
    });

    if (!tagError && tagCodes) {
      const codes = [...(tagCodes as string[])];
      const garmentsPayload = (insertedItems || []).flatMap((it: any) =>
        Array.from({ length: Number(it.quantity) }, () => ({
          order_item_id: it.id,
          item_id: it.item_id,
          tag_code: codes.shift(),
        }))
      );
      const { error: garmentError } = await supabase.from("garment").insert(garmentsPayload);
      if (garmentError) console.error("garment auto-create failed:", garmentError);
    } else if (tagError) {
      console.error("generate_garment_tags failed:", tagError);
    }
  }

  revalidatePath("/orders");
  redirect(`/orders/${order.id}`);
}

export async function createCustomerQuick(input: { full_name: string; phone: string }) {
  const full_name = (input.full_name || "").trim();
  const phone = (input.phone || "").trim();

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
      tier: "Silver",
    })
    .select("id, full_name, phone")
    .single();

  if (error || !created) {
    return { error: error?.message || "Failed to create customer." };
  }

  revalidatePath("/customers");

  return { customer: created };
}
