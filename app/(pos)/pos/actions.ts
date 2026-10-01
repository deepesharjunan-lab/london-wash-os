"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { onOrderStatus, onPayment } from "@/lib/loyalty/ledger";
import { afterConsoleStatusChange } from "@/lib/staff/flow";

export type CustomerHit = { id: string; full_name: string; phone: string | null; orders: number };

/** Customers by name or phone, for the POS search box. */
export async function searchCustomers(q: string): Promise<CustomerHit[]> {
  const term = String(q ?? "").trim().slice(0, 40);
  if (term.length < 2) return [];
  const supabase = createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return [];
  const digits = term.replace(/\D/g, "");
  const safe = term.replace(/[%,()]/g, "");
  let query = supabase.from("customer").select("id, full_name, phone").is("deleted_at", null).limit(8);
  query = digits.length >= 4 ? query.ilike("phone", `%${digits.slice(-10)}%`) : query.ilike("full_name", `%${safe}%`);
  const { data } = await query.order("full_name");
  const rows = (data ?? []) as { id: string; full_name: string; phone: string | null }[];
  if (!rows.length) return [];
  const { data: counts } = await supabase.from("order").select("customer_id").in("customer_id", rows.map((r) => r.id)).neq("status", "cancelled");
  const n = new Map<string, number>();
  ((counts ?? []) as { customer_id: string }[]).forEach((o) => n.set(o.customer_id, (n.get(o.customer_id) ?? 0) + 1));
  return rows.map((r) => ({ ...r, orders: n.get(r.id) ?? 0 }));
}

const PAY_METHODS = ["cash", "card", "upi", "wallet", "bank_transfer"];

/** Counter collection: take any balance, then mark the ready order delivered (points become Earned). */
export async function handOverAtCounter(formData: FormData) {
  const orderId = String(formData.get("order_id") || "");
  const method = String(formData.get("method") || "");
  const amount = Math.round(Number(formData.get("amount") || 0) * 100);
  const back = (q: string) => redirect(`/pos/orders?view=ready&${q}`);
  const supabase = createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) redirect("/login?next=/pos");
  const { data: o } = await supabase.from("order").select("id, order_number, status, total_minor").eq("id", orderId).maybeSingle();
  const order = o as { id: string; order_number: string; status: string; total_minor: number } | null;
  if (!order) back(`error=${encodeURIComponent("Order not found.")}`);
  if (order!.status !== "ready") back(`error=${encodeURIComponent(`${order!.order_number} isn't ready yet.`)}`);

  if (amount > 0 && PAY_METHODS.includes(method)) {
    const { data: pays } = await supabase.from("payment").select("amount_minor, status").eq("order_id", orderId);
    const paid = ((pays ?? []) as { amount_minor: number; status: string }[])
      .filter((p) => p.status !== "failed" && p.status !== "refunded")
      .reduce((a, p) => a + Number(p.amount_minor), 0);
    const take = Math.min(amount, Math.max(0, Number(order!.total_minor) - paid));
    if (take > 0) {
      const { error } = await supabase.from("payment").insert({ order_id: orderId, method, amount_minor: take });
      if (error) back(`error=${encodeURIComponent("Couldn't record the payment.")}`);
      await onPayment(supabase, orderId);
    }
  }
  const { data: moved } = await supabase.from("order").update({ status: "delivered" }).eq("id", orderId).eq("status", "ready").select("id");
  if ((moved ?? []).length) {
    await onOrderStatus(supabase, orderId, "delivered"); // loyalty: points become Earned
    await afterConsoleStatusChange(orderId, "delivered", null); // garments + customer alert
  }
  revalidatePath("/pos/orders");
  back(`done=${encodeURIComponent(`${order!.order_number} handed over.`)}`);
}
