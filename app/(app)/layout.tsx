import { createClient } from "@/lib/supabase/server";
import { signOut } from "./actions";
import Link from "next/link";

const NAV_GROUPS: { section: string; items: { href: string; label: string }[] }[] = [
  {
    section: "Overview",
    items: [{ href: "/dashboard", label: "Dashboard" }],
  },
  {
    section: "Catalogue",
    items: [{ href: "/services", label: "Services & Prices" }],
  },
  {
    section: "Sales",
    items: [
      { href: "/orders", label: "Orders" },
      { href: "/customers", label: "Customers" },
      { href: "/corporate", label: "Corporate Accounts" },
      { href: "/crm", label: "Customer CRM" },
      { href: "/promotions", label: "Coupons & Promotions" },
      { href: "/referrals", label: "Referrals & Rewards" },
    ],
  },
  {
    section: "Production",
    items: [
      { href: "/production", label: "Production Board" },
      { href: "/quality", label: "Quality Control" },
      { href: "/garments", label: "Garment Tracking" },
      { href: "/packing", label: "Packed Bags" },
      { href: "/workflows", label: "Workflow & Stages" },
    ],
  },
  {
    section: "Money",
    items: [
      { href: "/wallet", label: "Membership & Wallet" },
      { href: "/loyalty", label: "Loyalty & Subscriptions" },
      { href: "/payroll", label: "Payroll & Leave" },
      { href: "/incentives", label: "Staff Incentives" },
      { href: "/complaints", label: "Complaints & Refunds" },
      { href: "/expenses", label: "Expenses & Machines" },
    ],
  },
  {
    section: "Operations",
    items: [
      { href: "/inventory", label: "Inventory" },
      { href: "/staff", label: "Staff & Attendance" },
      { href: "/approvals", label: "Approvals" },
      { href: "/purchasing", label: "Purchasing" },
      { href: "/delivery", label: "Delivery" },
      { href: "/claims", label: "Claims & Collection Points" },
      { href: "/family", label: "Family & Workstations" },
    ],
  },
  {
    section: "Customer-facing",
    items: [
      { href: "/messages", label: "Messages & Notifications" },
      { href: "/privacy", label: "Consent & Data Rights" },
    ],
  },
  {
    section: "System",
    items: [
      { href: "/roles", label: "Roles & Permissions" },
      { href: "/system-settings", label: "System Settings" },
      { href: "/sysops", label: "System Operations" },
      { href: "/settings", label: "Branch & Tax Settings" },
    ],
  },
];

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = user
    ? await supabase
        .from("user")
        .select("full_name, branch:branch_id(name)")
        .eq("auth_user_id", user.id)
        .maybeSingle()
    : { data: null };

  const branchName =
    profile?.branch && Array.isArray(profile.branch)
      ? (profile.branch[0] as { name?: string })?.name
      : (profile?.branch as { name?: string } | null)?.name || "Branch not set";

  const initials = (profile?.full_name || user?.email || "?")
    .split(" ")
    .map((p: string) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="flex min-h-screen">
      <aside className="flex w-60 shrink-0 flex-col bg-sidebar text-white/80">
        <div className="border-b border-white/10 px-5 py-5">
          <div className="font-archivo text-sm font-extrabold leading-tight tracking-tight text-white">
            LONDON
            <br />
            WASH OS
          </div>
          <div className="mt-2 text-[10px] font-semibold uppercase tracking-widest text-accent">
            Operations Console
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto py-3">
          {NAV_GROUPS.map((group) => (
            <div key={group.section}>
              <div className="px-4 pb-1.5 pt-4 text-[9px] font-semibold uppercase tracking-widest text-white/40">
                {group.section}
              </div>
              {group.items.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="flex items-center gap-2.5 border-l-[3px] border-transparent px-[15px] py-2 text-[13.5px] font-medium text-white/70 transition hover:border-accent hover:bg-white/5 hover:text-white"
                >
                  {item.label}
                </Link>
              ))}
            </div>
          ))}
        </nav>

        <div className="flex items-center gap-2.5 border-t border-white/10 px-[18px] py-3.5">
          <div className="grid h-8 w-8 shrink-0 place-items-center bg-accent font-archivo text-xs font-extrabold text-white">
            {initials}
          </div>
          <div className="min-w-0">
            <div className="truncate text-[12.5px] font-semibold text-white">
              {profile?.full_name || user?.email}
            </div>
            <div className="truncate text-[10.5px] text-white/40">{branchName}</div>
          </div>
        </div>
      </aside>

      <div className="flex-1">
        <header className="flex items-center justify-between border-b border-black/5 bg-white px-6 py-3">
          <div className="text-sm text-ink/60">{branchName}</div>
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-ink">
              {profile?.full_name || user?.email}
            </span>
            <form action={signOut}>
              <button
                type="submit"
                className="rounded-md border border-black/10 px-3 py-1.5 text-xs font-semibold text-ink/70 transition hover:bg-black/5"
              >
                Sign out
              </button>
            </form>
          </div>
        </header>
        <main className="p-6">{children}</main>
      </div>
    </div>
  );
}
