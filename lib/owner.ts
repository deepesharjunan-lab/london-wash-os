import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Owner app access: the same sign-in as the console. Business data is read
// with the signed-in (RLS) client; the owner's own inbox and phone
// subscriptions with the service-role client. Server-only.

export async function requireOwner() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/owner");
  const { data } = await supabase.from("user").select("id, full_name, branch_id, branch:branch_id(id, name)").eq("auth_user_id", user.id).maybeSingle();
  const me = data as { id: string; full_name: string; branch_id: string | null; branch: any } | null;
  if (!me) redirect("/login");
  const branch = Array.isArray(me.branch) ? me.branch[0] : me.branch;
  return {
    supabase,
    admin: createAdminClient(),
    me: { id: me.id, full_name: me.full_name, firstName: String(me.full_name || "").split(" ")[0], branchId: me.branch_id, branchName: (branch?.name as string) ?? "Branch" },
  };
}

export async function ownerUnread(admin: ReturnType<typeof createAdminClient>, userId: string) {
  const { count } = await admin.from("app_notification").select("id", { count: "exact", head: true }).eq("user_id", userId).is("read_at", null);
  return count ?? 0;
}
