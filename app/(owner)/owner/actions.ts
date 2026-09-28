"use server";

import { headers } from "next/headers";
import { requireOwner } from "@/lib/owner";
import { removeSubscription, saveSubscription, type BrowserSubscription } from "@/lib/push";

export async function saveOwnerPushAction(sub: BrowserSubscription) {
  const { admin, me } = await requireOwner();
  return saveSubscription(admin, { user_id: me.id }, sub, headers().get("user-agent"));
}

export async function removeOwnerPushAction(endpoint: string) {
  const { admin } = await requireOwner();
  await removeSubscription(admin, String(endpoint ?? ""));
  return { ok: true };
}
