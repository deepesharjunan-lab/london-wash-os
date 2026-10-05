"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { onAutomationEvent } from "@/lib/engage/automations";
import { createClient } from "@/lib/supabase/server";
import { applyCheckout, checkoutOptions, loadCtx, onCustomerCreated, onPayment } from "@/lib/loyalty/ledger";
import { notify } from "@/lib/notify";
import { cleanCharges, manualDiscountMinor, validateCoupon, type Charge, type ManualDiscount } from "@/lib/pos/pricing";

type CartLine = {
  price_list_entry_id: string;
  service_id: string;
  item_id: string | null;
  unit: string;
  unit_price_minor: number;
  quantity: number;
  notes?: string | null; // stains, damage etc. noted at the counter
};

const PAY_METHODS = ["cash", "card", "upi", "wallet", "bank_transfer"];

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
  /** Advance taken at the counter. */
  payment?: { method: string; amount_minor: number } | null;
  /** "pos" returns to the reception POS instead of the console order page. */
  return_to?: "pos";
  /** Coupon code from Coupons & Promotions. */
  coupon_code?: string | null;
  /** Discount given at the counter, with a reason. */
  manual_discount?: ManualDiscount | null;
  /** Express service, delivery, packing... added after discounts. */
  charges?: Charge[] | null;
}) {
  if (!input.customer_id) {
    return { error: "Select a customer." };
  }
  if (!input.lines || input.lines.length === 0) {
    return { error: "Add at least one item to the order." };
  }

  const supabase = createClient();

  // Coupon and counter discount come first; Club points/vouchers apply to what's left.
  const linesSubtotal = input.lines.reduce((s, l) => s + Math.round(l.unit_price_minor) * l.quantity, 0);
  let couponId: string | null = null;
  let couponMinor = 0;
  let couponLabel = "";
  if (input.coupon_code) {
    const c = await validateCoupon(supabase, input.coupon_code, linesSubtotal);
    if (!c.ok) return { error: c.error };
    couponId = c.couponId;
    couponMinor = c.discountMinor;
    couponLabel = `Coupon ${c.code}`;
  }
  const manualMinor = manualDiscountMinor(input.manual_discount, linesSubtotal - couponMinor);
  const manualNote = (input.manual_discount?.note ?? "").trim().slice(0, 200);
  if (manualMinor > 0 && !manualNote) return { error: "Give a reason for the discount." };
  const charges = cleanCharges(input.charges);
  const chargesMinor = charges.reduce((a, c) => a + c.amount_minor, 0);
  const preDiscount = couponMinor + manualMinor;

  // Check points and voucher before creating anything, so a bad choice never leaves a half-made order.
  const wantsLoyalty = (input.redeem_points ?? 0) > 0 || !!input.voucher_code;
  const loyaltyCtx = wantsLoyalty ? await loadCtx(supabase) : null;
  if (wantsLoyalty) {
    if (!loyaltyCtx) return { error: "Loyalty Club isn't set up, so points and vouchers can't be used." };
    const opts = await checkoutOptions(loyaltyCtx, input.customer_id);
    const subtotal = linesSubtotal;
    let remaining = subtotal - preDiscount;
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
      discount_minor: preDiscount,
      tax_minor: 0,
      total_minor: Math.max(0, subtotal_minor - preDiscount) + chargesMinor,
      coupon_id: couponId,
      extra_charges: charges,
      extra_charges_minor: chargesMinor,
      discount_note: [couponLabel, manualMinor > 0 ? `Discount: ${manualNote}` : ""].filter(Boolean).join(" · ") || null,
      placed_by_user_id: me.id,
    })
    .select("id")
    .single();

  if (orderError || !order) {
    return { error: orderError?.message || "Failed to create the order." };
  }

  if (couponId) {
    const { data: cp } = await supabase.from("coupon").select("redemptions_count").eq("id", couponId).single();
    await supabase.from("coupon").update({ redemptions_count: Number((cp as { redemptions_count: number } | null)?.redemptions_count ?? 0) + 1 }).eq("id", couponId);
  }

  const itemsPayload = input.lines.map((l) => ({
    order_id: order.id,
    price_list_entry_id: l.price_list_entry_id,
    service_id: l.service_id,
    item_id: l.item_id,
    quantity: l.quantity,
    unit_price_minor: Math.round(l.unit_price_minor),
    line_total_minor: Math.round(l.unit_price_minor) * l.quantity,
    notes: (l.notes ?? "").trim().slice(0, 300) || null,
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

  // Payment taken at the counter (never more than what's owed).
  if (input.payment && PAY_METHODS.includes(input.payment.method) && input.payment.amount_minor > 0) {
    const { data: totals } = await supabase.from("order").select("total_minor").eq("id", order.id).single();
    const amount = Math.min(Math.round(input.payment.amount_minor), Number((totals as { total_minor: number } | null)?.total_minor ?? 0));
    let ok = amount > 0;
    if (ok && input.payment.method === "wallet") ok = await debitWallet(supabase, input.customer_id, order.id, order_number, amount);
    if (ok) {
      const { error: payError } = await supabase.from("payment").insert({ order_id: order.id, method: input.payment.method, amount_minor: amount });
      if (payError) console.error("counter payment failed", order.id, payError.message);
      else await onPayment(supabase, order.id); // referral bonus on first paid order; never throws
    }
  }

  await onAutomationEvent("order_placed", { orderId: order.id }); // ENGAGE automations (invoice link…); never throws
  revalidatePath("/orders");
  redirect(input.return_to === "pos" ? `/pos/done/${order.id}` : `/orders/${order.id}`);
}

/** Takes money from the customer's store-credit wallet. False if the balance isn't enough. */
async function debitWallet(supabase: ReturnType<typeof createClient>, customerId: string, orderId: string, orderNumber: string, amount: number) {
  const { data: w } = await supabase.from("wallet").select("id, balance_minor").eq("customer_id", customerId).maybeSingle();
  const wallet = w as { id: string; balance_minor: number } | null;
  if (!wallet || Number(wallet.balance_minor) < amount) return false;
  const after = Number(wallet.balance_minor) - amount;
  // Only take it if the balance hasn't changed since we read it.
  const { data: moved } = await supabase.from("wallet").update({ balance_minor: after }).eq("id", wallet.id).eq("balance_minor", wallet.balance_minor).select("id");
  if (!(moved ?? []).length) return false;
  const { error } = await supabase
    .from("wallet_transaction")
    .insert({ wallet_id: wallet.id, order_id: orderId, type: "debit", amount_minor: amount, balance_after_minor: after, note: `Paid for ${orderNumber}` });
  if (error) console.error("wallet transaction failed", orderId, error.message);
  return true;
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
