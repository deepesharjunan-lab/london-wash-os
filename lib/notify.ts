import { createAdminClient } from "@/lib/supabase/admin";
import { pushTo } from "@/lib/push";
import type { AppRole } from "@/lib/staff/roles";

// One place to tell people something happened: it saves a row in each
// person's in-app inbox and sends a push to their phones. Owners are console
// users with the Admin, Manager or Owner role. Server-only. Never throws, so a
// notification problem can never block the work that triggered it.

export type Audience = {
  roles?: AppRole[];
  employeeIds?: (string | null | undefined)[];
  owners?: boolean;
  customerId?: string | null;
  branchId?: string | null;
};

export type Message = {
  kind: string;
  title: string;
  body?: string;
  staffUrl?: string;
  ownerUrl?: string;
  customerUrl?: string;
};

/** Console roles that may use the owner app and receive owner alerts. */
export const OWNER_ROLES = ["Admin", "Manager"];

export async function ownerUserIds(): Promise<string[]> {
  const db = createAdminClient();
  const { data: roles } = await db.from("role").select("id").in("name", OWNER_ROLES).is("deleted_at", null);
  let ids: string[] = [];
  if ((roles ?? []).length) {
    const { data } = await db.from("user_role").select("user_id").in("role_id", (roles ?? []).map((r: any) => r.id));
    ids = [...new Set((data ?? []).map((r: any) => r.user_id as string))];
  }
  let q = db.from("user").select("id").eq("is_active", true).is("deleted_at", null);
  if (ids.length) q = q.in("id", ids);
  const { data: users } = await q;
  return (users ?? []).map((u: any) => u.id as string);
}

export async function notify(to: Audience, m: Message) {
  try {
    const db = createAdminClient();
    const employeeIds = new Set((to.employeeIds ?? []).filter(Boolean) as string[]);
    if (to.roles?.length) {
      let q = db.from("employee").select("id").in("app_role", to.roles).eq("is_active", true).is("deleted_at", null);
      if (to.branchId) q = q.eq("branch_id", to.branchId);
      const { data } = await q;
      (data ?? []).forEach((e: any) => employeeIds.add(e.id));
    }
    const userIds = to.owners ? await ownerUserIds() : [];
    const base = { kind: m.kind, title: m.title.slice(0, 140), body: m.body?.slice(0, 400) ?? null };

    const rows = [
      ...[...employeeIds].map((id) => ({ ...base, employee_id: id, url: m.staffUrl ?? "/work" })),
      ...userIds.map((id) => ({ ...base, user_id: id, url: m.ownerUrl ?? "/owner" })),
      ...(to.customerId ? [{ ...base, customer_id: to.customerId, url: m.customerUrl ?? "/my" }] : []),
    ];
    if (!rows.length) return;
    const { error } = await db.from("app_notification").insert(rows);
    if (error) console.error("notify insert", error);

    const cols = "id, endpoint, p256dh, auth";
    const [staffSubs, ownerSubs, customerSubs] = await Promise.all([
      employeeIds.size ? db.from("push_subscription").select(cols).in("employee_id", [...employeeIds]) : Promise.resolve({ data: [] }),
      userIds.length ? db.from("push_subscription").select(cols).in("user_id", userIds) : Promise.resolve({ data: [] }),
      to.customerId ? db.from("push_subscription").select(cols).eq("customer_id", to.customerId) : Promise.resolve({ data: [] }),
    ]);
    const payload = { title: base.title, body: base.body ?? undefined, tag: m.kind };
    await Promise.all([
      pushTo(db, (staffSubs.data ?? []) as any[], { ...payload, url: m.staffUrl ?? "/work" }),
      pushTo(db, (ownerSubs.data ?? []) as any[], { ...payload, url: m.ownerUrl ?? "/owner" }),
      pushTo(db, (customerSubs.data ?? []) as any[], { ...payload, url: m.customerUrl ?? "/my" }),
    ]);
  } catch (e) {
    console.error("notify failed", e);
  }
}
