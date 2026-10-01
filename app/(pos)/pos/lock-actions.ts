"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { OWNER_ROLES } from "@/lib/notify";
import { checkPosPin, lockPos, setPosPin, setPosUnlocked } from "@/lib/pos/lock";

export type LockState = { error?: string; ok?: boolean };

/** The signed-in console user, their branch, and whether they're Admin/Manager. */
async function who() {
  const supabase = createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return null;
  const { data: me } = await supabase.from("user").select("id, branch_id").eq("auth_user_id", auth.user.id).maybeSingle();
  const u = me as { id: string; branch_id: string | null } | null;
  if (!u?.branch_id) return null;
  const { data: roles } = await supabase.from("user_role").select("role:role_id(name)").eq("user_id", u.id);
  const names = ((roles ?? []) as any[]).map((r) => (Array.isArray(r.role) ? r.role[0] : r.role)?.name as string);
  return { userId: u.id, branchId: u.branch_id, canManage: names.some((n) => OWNER_ROLES.includes(n)) };
}

export async function unlockPosAction(_prev: LockState, form: FormData): Promise<LockState> {
  const w = await who();
  if (!w) return { error: "Your account has no branch. Ask an Admin." };
  const pin = String(form.get("pin") ?? "").replace(/\D/g, "");
  if (pin.length !== 4) return { error: "Enter the 4-digit PIN." };
  const res = await checkPosPin(w.branchId, pin);
  if (!res.ok) return { error: res.error };
  setPosUnlocked(w.branchId, w.userId);
  return { ok: true };
}

/** Set or change the branch's POS PIN (Admin/Manager only). */
export async function setPosPinAction(_prev: LockState, form: FormData): Promise<LockState> {
  const w = await who();
  if (!w) return { error: "Your account has no branch. Ask an Admin." };
  if (!w.canManage) return { error: "Only an Admin or Manager can set the POS PIN." };
  const pin = String(form.get("pin") ?? "").replace(/\D/g, "");
  const confirm = String(form.get("confirm") ?? "").replace(/\D/g, "");
  if (pin.length !== 4) return { error: "The PIN must be exactly 4 digits." };
  if (/^(\d)\1{3}$/.test(pin) || ["1234", "4321", "0123", "9876"].includes(pin)) return { error: "Choose a less obvious PIN." };
  if (pin !== confirm) return { error: "The two PINs don't match." };
  if (!(await setPosPin(w.branchId, pin))) return { error: "Couldn't save the PIN. Please try again." };
  setPosUnlocked(w.branchId, w.userId);
  return { ok: true };
}

export async function lockPosAction() {
  lockPos();
  redirect("/pos");
}
