"use server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { notify } from "@/lib/notify";
import { removeSubscription, saveSubscription, type BrowserSubscription } from "@/lib/push";
import {
  canSendCodes,
  clearMemberSession,
  createLoginCode,
  customersByPhone,
  requireMember,
  sendLoginCode,
  setMemberSession,
  verifyLoginCode,
} from "@/lib/customer/session";
import { loadCtx, recordReview, redeem } from "@/lib/loyalty/ledger";
import { sendPickupBookedWhatsApp } from "@/lib/whatsapp/templates";
import { onAutomationEvent } from "@/lib/engage/automations";

// Every action below that reads or changes data first calls requireMember(),
// which checks the signed session cookie, and then only touches rows that
// belong to that customer.

type LoginState = { step: "phone" | "code"; phone?: string; message?: string; error?: string };

export async function loginAction(prev: LoginState, form: FormData): Promise<LoginState> {
  const phone = String(form.get("phone") ?? "").trim();
  if (form.get("restart")) return { step: "phone", phone };
  if (prev.step === "phone") {
    const digitsOnly = phone.replace(/\D/g, "");
    if (digitsOnly.length < 10) return { step: "phone", phone, error: "Enter your 10-digit mobile number." };
    // Same response whether or not the number is registered, so the screen can't be used to look up customers.
    const matches = await customersByPhone(phone);
    // Once an SMS/WhatsApp provider is connected, the app creates and sends the code itself.
    // Until then staff create the code in the console; creating one here would cancel theirs.
    let sent = false;
    if (canSendCodes() && matches.length) {
      try {
        const code = await createLoginCode(matches[0].id, null);
        sent = await sendLoginCode(phone, code);
      } catch (e) {
        console.error("login code failed", e);
      }
    }
    return {
      step: "code",
      phone,
      message: sent
        ? "We've sent a 6-digit code to your phone."
        : "Ask The London Wash for your 6-digit sign-in code (at the store, by phone or on WhatsApp). Codes last 15 minutes.",
    };
  }
  const code = String(form.get("code") ?? "").replace(/\D/g, "");
  const customerId = await verifyLoginCode(phone, code);
  if (!customerId) return { step: "code", phone, error: "That code doesn't match or has expired. Check it and try again, or ask for a new one." };
  setMemberSession(customerId);
  redirect("/my");
}

export async function signOutAction() {
  clearMemberSession();
  redirect("/my/login");
}

export async function redeemRewardAction(form: FormData) {
  const { customerId, db } = requireMember();
  const ctx = await loadCtx(db);
  if (!ctx) redirect("/my/rewards?error=" + encodeURIComponent("Rewards aren't available right now."));
  const rewardId = String(form.get("reward_id") ?? "");
  const points = Number(form.get("points") ?? 0);
  const res = await redeem(ctx, customerId, rewardId ? { rewardId } : { points });
  if (res.error) redirect("/my/rewards?error=" + encodeURIComponent(res.error));
  revalidatePath("/my", "layout");
  redirect(`/my/rewards?voucher=${encodeURIComponent(res.code ?? "")}`);
}

export async function reviewAction(form: FormData) {
  const { customerId, db } = requireMember();
  const orderId = String(form.get("order_id") ?? "");
  const { data: order } = await db.from("order").select("id").eq("id", orderId).eq("customer_id", customerId).maybeSingle();
  if (!order) redirect("/my/orders");
  const ctx = await loadCtx(db);
  if (!ctx) redirect(`/my/orders/${orderId}`);
  const stars = Math.min(5, Math.max(1, Number(form.get("stars") ?? 5)));
  const body = String(form.get("body") ?? "").trim().slice(0, 1000) || null;
  const res = await recordReview(ctx, orderId, stars, body);
  const q = res.error ? `error=${encodeURIComponent(res.error)}` : `reviewed=${res.awarded ?? 0}`;
  redirect(`/my/orders/${orderId}?${q}`);
}

export async function bookPickupAction(form: FormData) {
  const { customerId, db } = requireMember();
  const date = String(form.get("date") ?? "");
  const slot = String(form.get("slot") ?? "");
  const services = form.getAll("services").map(String).slice(0, 12);
  const notes = String(form.get("notes") ?? "").trim().slice(0, 500) || null;
  let addressId = String(form.get("address_id") ?? "");
  const newAddress = String(form.get("new_address") ?? "").trim();

  const [h1, h2] = slot.split("-").map((x) => Number(x));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(h1) || !Number.isFinite(h2)) {
    redirect("/my/book?error=" + encodeURIComponent("Choose a day and a time."));
  }
  if (addressId === "new" || !addressId) {
    if (!newAddress) redirect("/my/book?error=" + encodeURIComponent("Add the pickup address."));
    const { data: addr, error } = await db
      .from("customer_address")
      .insert({ customer_id: customerId, label: "Home", address_line: newAddress, is_default: false })
      .select("id")
      .single();
    if (error || !addr) redirect("/my/book?error=" + encodeURIComponent("Couldn't save the address."));
    addressId = (addr as { id: string }).id;
  } else {
    const { data: owned } = await db.from("customer_address").select("id").eq("id", addressId).eq("customer_id", customerId).maybeSingle();
    if (!owned) redirect("/my/book?error=" + encodeURIComponent("Choose one of your addresses."));
  }
  // Slot times are Indian Standard Time (UTC+05:30).
  const start = new Date(`${date}T${String(h1).padStart(2, "0")}:00:00+05:30`);
  const end = new Date(`${date}T${String(h2).padStart(2, "0")}:00:00+05:30`);
  if (start.getTime() < Date.now()) redirect("/my/book?error=" + encodeURIComponent("That time has passed. Choose a later slot."));
  const { error } = await db.from("pickup").insert({
    customer_id: customerId,
    customer_address_id: addressId,
    scheduled_window_start: start.toISOString(),
    scheduled_window_end: end.toISOString(),
    status: "scheduled",
    services,
    notes,
    source: "app",
  });
  if (error) {
    console.error(error);
    redirect("/my/book?error=" + encodeURIComponent("Couldn't book the pickup. Please try again or call us."));
  }
  const { data: who } = await db.from("customer").select("full_name, branch_id").eq("id", customerId).maybeSingle();
  const when = start.toLocaleString("en-IN", { weekday: "short", day: "numeric", month: "short", hour: "numeric", timeZone: "Asia/Kolkata" });
  await notify(
    { owners: true, roles: ["receptionist"], branchId: (who as { branch_id: string | null } | null)?.branch_id ?? null },
    {
      kind: "pickup_requested",
      title: "New pickup request",
      body: `${(who as { full_name: string } | null)?.full_name ?? "A customer"} booked a pickup for ${when}. Assign a driver in the console.`,
      staffUrl: "/work",
      ownerUrl: "/delivery",
    }
  );
  await onAutomationEvent("pickup_booked", { customerId, context: { pickup_time: when }, dedupe: `pickup:${customerId}:${start.toISOString()}` }); // never throws
  await sendPickupBookedWhatsApp(customerId, when); // only when WHATSAPP_NOTIFY=1 and no pickup automation; never throws
  revalidatePath("/my", "layout");
  redirect("/my/orders?booked=1");
}

export async function saveMemberPushAction(sub: BrowserSubscription) {
  const { customerId, db } = requireMember();
  return saveSubscription(db, { customer_id: customerId }, sub, headers().get("user-agent"));
}

export async function removeMemberPushAction(endpoint: string) {
  const { db } = requireMember();
  await removeSubscription(db, String(endpoint ?? ""));
  return { ok: true };
}

export async function saveBirthdayAction(form: FormData) {
  const { customerId, db } = requireMember();
  const d = Number(form.get("day"));
  const m = Number(form.get("month"));
  if (!(d >= 1 && d <= 31 && m >= 1 && m <= 12)) redirect("/my/profile?error=" + encodeURIComponent("Choose a day and month."));
  // Only set once, so the birthday bonus can't be moved around.
  const { data } = await db.from("customer").select("birth_date").eq("id", customerId).maybeSingle();
  if ((data as { birth_date: string | null } | null)?.birth_date) redirect("/my/profile?error=" + encodeURIComponent("Your birthday is already saved. Ask us if it needs changing."));
  await db.from("customer").update({ birth_date: `2000-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}` }).eq("id", customerId);
  revalidatePath("/my", "layout");
  redirect("/my/profile?saved=birthday");
}
