import { Suspense } from "react";
import type { Metadata, Viewport } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PosTopBar } from "./PosTopBar";

// Reception POS: a full-screen ordering screen for the counter, without the
// console sidebar. Same sign-in as the console.

export const metadata: Metadata = { title: "Reception POS · The London Wash" };
export const viewport: Viewport = { themeColor: "#101828", width: "device-width", initialScale: 1 };

export default async function PosLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/pos");
  const { data: me } = await supabase.from("user").select("full_name, branch:branch_id(name)").eq("auth_user_id", user.id).maybeSingle();
  const branch = (me as any)?.branch;
  const branchName = (Array.isArray(branch) ? branch[0]?.name : branch?.name) ?? "Branch";
  const name = (me as { full_name?: string } | null)?.full_name ?? user.email ?? "";

  return (
    <div className="lw-console flex h-screen flex-col overflow-hidden bg-[#eef0f3] text-ink">
      <Suspense fallback={<div className="h-[64px] shrink-0 bg-[#101828]" />}>
        <PosTopBar userName={name} branchName={branchName} />
      </Suspense>
      <div className="min-h-0 flex-1">{children}</div>
    </div>
  );
}
