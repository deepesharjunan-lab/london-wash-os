"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { applyCheckout, checkoutOptions, loadCtx, onCustomerCreated } from "@/lib/loyalty/ledger";
import { notify } from "@/lib/notify";

type CartLine = {
  price_list_entry_id: string;
  service_id: string;
  item_id: string | null;
  unit: string;
  unit_price_minor: number;
  quantity: number;
};

/** Points balance, redemption amounts and active vouchers for the selected customer. */
export async function getCheckoutLoyalty(customerId: string) {
  if (!customerId) return null;
  const supabase = createClient();
  const ctx = await loadCtx(supabase);
  if (!ctx) return null;
  return checkoutOptions(ctx, customerId);
}

export async function createOrder(input: {
  customer_id: string;
  price_list_profile_id: string | null;
  channel: string;
  lines: CartLine[];
  redeem_points?: number;
  voucher_code?: string;
}) {
  if (!input.customer_id) {
    return { error: "Select a customer." };
  }
  if (!input.lines || input.lines.length === 0) {
    return { error: "Add at least one item to the order." };
  }

  const supabase = createClient();

  // Check points and voucher before creating anything, so a bad choice never leaves a half-made order.
  const wantsLoyalty = (input.redeem_points ?? 0) > 0 || !!input.voucher_code;
  const loyaltyCtx = wantsLoyalty ? await loadCtx(supabase) : null;
  if (wantsLoyalty) {
    if (!loyaltyCtx) return { error: "Loyalty Club isn't set up, so points and vouchers can't be used." };
    const opts = await checkoutOptions(loyaltyCtx, input.customer_id);
    const subtotal = input.lines.reduce((s, l) => s + Math.round(l.unit_price_minor) * l.quantity, 0);
    let remaining = subtotal;
    if (input.voucher_code) {
      const v = opts.vouchers.find((x) => x.code === input.voucher_code);
      if (!v) return { error: "That voucher isn't active for this customer." };
      if (subtotal < v.minOrderMinor) return { error: `That voucher needs an order of ₹${Math.round(v.minOrderMinor / 100)} or more.` };
      remaining -= Math.min(v.valueMinor, remaining);
    }
    const pts = input.redeem_points ?? 0;
    if (pts > 0) {
      if (opts.available < opts.minRedeem) return { error: `The customer needs at least ${opts.minRedeem} points to redeem.` };
      if (pts > opts.available) return { error: `Only ${opts.available} points available.` };
      const value = Math.round(pts * opts.pointValueMinor);
      if (value > Math.floor((subtotal * opts.maxRedeemPct) / 100)) return { error: `Points can pay up to ${opts.maxRedeemPct}% of an order.` };
      if (value > remaining) return { error: "The points are worth more than what's left to pay." };
    }
  }
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
  // Multipiece products (e.g. a 3-piece suit) get one tag per piece.
  const itemIdsForPieces = [...new Set((insertedItems || []).map((it: any) => it.item_id).filter(Boolean))] as string[];
  const { data: pieceRows } = itemIdsForPieces.length
    ? await supabase.from("item").select("id, pieces").in("id", itemIdsForPieces)
    : { data: [] as { id: string; pieces: number }[] };
  const piecesOf = new Map(((pieceRows ?? []) as { id: string; pieces: number }[]).map((r) => [r.id, Math.max(1, Number(r.pieces) || 1)] as [string, number]));
  const unitsOf = (it: any) => Number(it.quantity) * (it.item_id ? piecesOf.get(it.item_id) ?? 1 : 1);
  const totalPieces = (insertedItems || []).reduce((sum, it: any) => sum + unitsOf(it), 0);
  if (totalPieces > 0) {
    const { data: tagCodes, error: tagError } = await supabase.rpc("generate_garment_tags", {
      p_count: totalPieces,
    });

    if (!tagError && tagCodes) {
      const codes = [...(tagCodes as string[])];
      const garmentsPayload = (insertedItems || []).flatMap((it: any) =>
        Array.from({ length: unitsOf(it) }, () => ({
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

  if (wantsLoyalty && loyaltyCtx) {
    const applied = await applyCheckout(loyaltyCtx, order.id, {
      points: input.redeem_points,
      voucherCode: input.voucher_code || undefined,
    });
    if (applied.error) console.error("checkout loyalty failed", order.id, applied.error);
  }

  // Tell the team and the owners a new order is in.
  const { data: buyer } = await supabase.from("customer").select("full_name").eq("id", input.customer_id).maybeSingle();
  await notify(
    { roles: ["receptionist", "washer", "iron_man", "helper"], owners: true, branchId: me.branch_id },
    {
      kind: "new_order",
      title: `New order ${order_number}`,
      body: `${totalPieces} ${totalPieces === 1 ? "piece" : "pieces"} · ${(buyer as { full_name: string } | null)?.full_name ?? "Customer"}`,
      staffUrl: `/work/orders/${order.id}`,
      ownerUrl: `/owner/orders/${order.id}`,
    }
  );

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

  await onCustomerCreated(supabase, created.id); // loyalty wallet + New Member Bonus; never throws

  revalidatePath("/customers");

  return { customer: created };
}
