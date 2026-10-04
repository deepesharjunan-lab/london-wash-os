import { createClient } from "@/lib/supabase/server";
import { waitingChatCount } from "@/lib/whatsapp/inbox";
import { signOut } from "./actions";
import Link from "next/link";
import { NavLinks } from "./NavLinks";
import { Logo } from "@/lib/brand/Logo";

const NAV_GROUPS: { section: string; items: { href: string; label: string; badge?: number }[] }[] = [
  {
    section: "Overview",
    items: [
      { href: "/dashboard", label: "Dashboard" },
      { href: "/owner", label: "Owner App (mobile)" },
    ],
  },
  {
    section: "Inbox",
    items: [{ href: "/whatsapp", label: "WhatsApp Inbox" }],
  },
  {
    section: "Catalogue",
    items: [
      { href: "/services", label: "Services" },
      { href: "/services/products", label: "Products" },
      { href: "/services/sub-categories", label: "Sub Categories" },
      { href: "/services/price-lists", label: "Price Lists" },
      { href: "/services/prices", label: "Add to Price List" },
    ],
  },
  {
    section: "Sales",
    items: [
      { href: "/pos", label: "Reception POS" },
      { href: "/orders", label: "Orders" },
      { href: "/customers", label: "Customers" },
      { href: "/corporate", label: "Corporate Accounts" },
      { href: "/crm", label: "Customer CRM" },
      { href: "/promotions", label: "Coupons & Promotions" },
      { href: "/referrals", label: "Referrals & Rewards" },
    ],
  },
  {
    section: "Loyalty",
    items: [
      { href: "/club", label: "Loyalty Club" },
      { href: "/loyalty", label: "Accounts & Subscriptions" },
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
      { href: "/staff/attendance", label: "Attendance Review" },
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

  // Profile and the WhatsApp badge load together. The badge counts chats waiting for
  // the team (unread), shown on the sidebar link; NavLinks keeps it live.
  const [{ data: profile }, waitingChats] = user
    ? await Promise.all([
        supabase.from("user").select("full_name, branch:branch_id(name)").eq("auth_user_id", user.id).maybeSingle(),
        waitingChatCount(),
      ])
    : [{ data: null }, 0];
  const navGroups = NAV_GROUPS.map((g) => ({
    ...g,
    items: g.items.map((i) => (i.href === "/whatsapp" ? { ...i, badge: waitingChats } : i)),
  }));

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

  const today = new Date().toLocaleDateString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  });

  return (
    <div className="lw-console flex min-h-screen flex-col lg:flex-row">
      <aside className="flex shrink-0 flex-col bg-sidebar text-[#d9d3c6] lg:sticky lg:top-0 lg:h-screen lg:w-[248px]">
        <Link href="/dashboard" className="block px-5 pb-4 pt-5 lg:pb-5 lg:pt-6" aria-label="The London Wash, the art of laundry. Go to dashboard">
          <Logo tone="light" alt="" className="h-auto w-[196px]" />
          <span className="mt-3 block text-[10px] font-semibold uppercase tracking-[0.22em] text-brass-2">
            Operations Console
          </span>
        </Link>

        <NavLinks groups={navGroups} />

        <div className="hidden items-center gap-2.5 border-t border-white/10 px-5 py-3.5 lg:flex">
          <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[rgba(199,181,143,0.18)] font-archivo text-[11px] font-bold tracking-wide text-[#e3d2ac]">
            {initials}
          </div>
          <div className="min-w-0">
            <div className="truncate text-[12.5px] font-semibold text-white">
              {profile?.full_name || user?.email}
            </div>
            <div className="truncate text-[11px] text-[#7f8796]">{branchName}</div>
          </div>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-20 flex items-center justify-between gap-4 border-b border-hair bg-ivory/90 px-4 py-3 backdrop-blur sm:px-7">
          <div className="min-w-0">
            <div className="text-[10.5px] font-semibold uppercase tracking-[0.16em] text-ink-3">{today}</div>
            <div className="truncate text-sm font-semibold text-ink">{branchName}</div>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden text-sm font-medium text-ink-2 sm:inline">
              {profile?.full_name || user?.email}
            </span>
            <form action={signOut}>
              <button
                type="submit"
                className="rounded-full border border-hair-2 bg-white px-4 py-1.5 text-xs font-semibold text-ink transition hover:bg-beige"
              >
                Sign out
              </button>
            </form>
          </div>
        </header>
        <main className="lw-main px-4 py-6 sm:px-7 sm:py-7">{children}</main>
      </div>
    </div>
  );
}
