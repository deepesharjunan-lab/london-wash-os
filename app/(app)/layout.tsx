import { createClient } from "@/lib/supabase/server";
import { signOut } from "./actions";
import Link from "next/link";

const NAV = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/orders", label: "Orders" },
  { href: "/production", label: "Production" },
  { href: "/customers", label: "Customers" },
  { href: "/inventory", label: "Inventory" },
  { href: "/staff", label: "Staff" },
  { href: "/services", label: "Services & Prices" },
  { href: "/settings", label: "Settings" },
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

  return (
    <div className="flex min-h-screen">
      <aside className="w-60 shrink-0 bg-sidebar text-white/80">
        <div className="flex items-center gap-2 px-5 py-5">
          <span className="h-2.5 w-2.5 rounded-full bg-accent" />
          <span className="font-archivo text-sm font-extrabold tracking-tight text-white">
            The London Wash
          </span>
        </div>
        <nav className="mt-2 space-y-0.5 px-3">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="block rounded-md px-3 py-2 text-sm font-medium text-white/70 transition hover:bg-white/5 hover:text-white"
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </aside>

      <div className="flex-1">
        <header className="flex items-center justify-between border-b border-black/5 bg-white px-6 py-3">
          <div className="text-sm text-ink/60">
            {profile?.branch && Array.isArray(profile.branch)
              ? (profile.branch[0] as { name?: string })?.name
              : (profile?.branch as { name?: string } | null)?.name || "Branch not set"}
          </div>
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
