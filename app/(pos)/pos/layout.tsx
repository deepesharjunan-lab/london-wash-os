import { Suspense } from "react";
import type { Metadata, Viewport } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { POS_MANAGER_ROLES, hasPosPin, isPosUnlocked } from "@/lib/pos/lock";
import { PosTopBar } from "./PosTopBar";
import { PosLockScreen } from "./PosLockScreen";
import { PosIdleLock } from "./PosIdleLock";

// Reception POS: a full-screen ordering screen for the counter, without the
// console sidebar. Same sign-in as the console, plus a 4-digit counter PIN.

export const metadata: Metadata = { title: "Reception POS · The London Wash" };
export const viewport: Viewport = { themeColor: "#101828", width: "device-width", initialScale: 1 };
export const dynamic = "force-dynamic";

export default async function PosLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/pos");
  const { data: meRow } = await supabase.from("user").select("id, full_name, branch_id, branch:branch_id(name)").eq("auth_user_id", user.id).maybeSingle();
  const me = meRow as { id: string; full_name: string | null; branch_id: string | null; branch: any } | null;
  const branch = me?.branch;
  const branchName = (Array.isArray(branch) ? branch[0]?.name : branch?.name) ?? "Branch";
  const name = me?.full_name ?? user.email ?? "";

  if (!me?.branch_id) {
    return <div className="grid h-screen place-items-center bg-[#101828] p-6 text-center text-white/80">Your account isn&apos;t linked to a branch. Ask an Admin.</div>;
  }

  if (!isPosUnlocked(me.branch_id, me.id)) {
    const { data: roles } = await supabase.from("user_role").select("role:role_id(name)").eq("user_id", me.id);
    const canManage = ((roles ?? []) as any[]).some((r) => POS_MANAGER_ROLES.includes((Array.isArray(r.role) ? r.role[0] : r.role)?.name));
    return <PosLockScreen hasPin={await hasPosPin(me.branch_id)} canManage={canManage} userName={name} branchName={branchName} />;
  }

  return (
    <div className="lw-console flex h-screen flex-col overflow-hidden bg-[#eef0f3] text-ink">
      <PosIdleLock />
      <Suspense fallback={<div className="h-[64px] shrink-0 bg-[#101828]" />}>
        <PosTopBar userName={name} branchName={branchName} />
      </Suspense>
      <div className="min-h-0 flex-1">{children}</div>
    </div>
  );
}
