"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

async function getBranchId(supabase: ReturnType<typeof createClient>) {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return null;
  const { data: me } = await supabase.from("user").select("branch_id").eq("auth_user_id", auth.user.id).single();
  return me?.branch_id ?? null;
}

export async function addSupplier(formData: FormData) {
  const name = String(formData.get("name") || "").trim();
  if (!name) return;
  const contact_phone = String(formData.get("contact_phone") || "").trim() || null;
  const contact_email = String(formData.get("contact_email") || "").trim() || null;

  const supabase = createClient();
  const branch_id = await getBranchId(supabase);

  const { error } = await supabase.from("supplier").insert({
    branch_id,
    name,
    contact_phone,
    contact_email,
  });
  if (error) console.error(error);
  revalidatePath("/purchasing");
}

export async function createPurchaseOrder(formData: FormData) {
  const supplier_id = String(formData.get("supplier_id") || "");
  if (!supplier_id) return;

  const supabase = createClient();
  const branch_id = await getBranchId(supabase);

  const { error } = await supabase.from("purchase_order").insert({
    branch_id,
    supplier_id,
    status: "draft",
    total_minor: 0,
    currency: "INR",
  });
  if (error) console.error(error);
  revalidatePath("/purchasing");
}

export async function addPurchaseOrderItem(formData: FormData) {
  const purchase_order_id = String(formData.get("purchase_order_id") || "");
  const inventory_item_id = String(formData.get("inventory_item_id") || "");
  if (!purchase_order_id || !inventory_item_id) return;
  const quantity = Number(formData.get("quantity") || 0);
  const unitPriceRupees = Number(formData.get("unit_price") || 0);
  if (!quantity || !unitPriceRupees) return;
  const unit_price_minor = Math.round(unitPriceRupees * 100);
  const line_total_minor = Math.round(quantity * unit_price_minor);

  const supabase = createClient();

  const { error: itemError } = await supabase.from("purchase_order_item").insert({
    purchase_order_id,
    inventory_item_id,
    quantity,
    unit_price_minor,
    line_total_minor,
  });
  if (itemError) console.error(itemError);

  const { data: po } = await supabase
    .from("purchase_order")
    .select("total_minor")
    .eq("id", purchase_order_id)
    .single();
  if (po) {
    const { error: poError } = await supabase
      .from("purchase_order")
      .update({ total_minor: po.total_minor + line_total_minor })
      .eq("id", purchase_order_id);
    if (poError) console.error(poError);
  }

  revalidatePath("/purchasing");
}

export async function updatePurchaseOrderStatus(formData: FormData) {
  const id = String(formData.get("id") || "");
  const status = String(formData.get("status") || "");
  if (!id || !status) return;

  const supabase = createClient();

  const { data: current } = await supabase
    .from("purchase_order")
    .select("status")
    .eq("id", id)
    .single();

  if (status === "received" && current?.status !== "received") {
    const { data: items } = await supabase
      .from("purchase_order_item")
      .select("inventory_item_id, quantity")
      .eq("purchase_order_id", id);
    for (const item of items || []) {
      const { data: invItem } = await supabase
        .from("inventory_item")
        .select("quantity_on_hand")
        .eq("id", item.inventory_item_id)
        .single();
      if (invItem) {
        await supabase
          .from("inventory_item")
          .update({ quantity_on_hand: invItem.quantity_on_hand + item.quantity })
          .eq("id", item.inventory_item_id);
      }
    }
  }

  const { error } = await supabase.from("purchase_order").update({ status }).eq("id", id);
  if (error) console.error(error);
  revalidatePath("/purchasing");
}
