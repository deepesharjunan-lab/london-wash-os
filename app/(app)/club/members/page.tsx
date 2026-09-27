import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { loadConfig, loadCustomers, loadTiers } from "@/lib/loyalty/data";
import { pts } from "@/lib/loyalty/engine";
import { Card, ClubHeader, inputCls } from "../ui";

export const dynamic = "force-dynamic";

type AccountRow = { customer_id: string; loyalty_tier_id: string | null; points_balance: number; pending_balance: number; lifetime_points: number; member_no: string | null };

export default async function ClubMembersPage({ searchParams }: { searchParams: { q?: string } }) {
  const supabase = createClient();
  const q = (searchParams.q ?? "").trim().toLowerCase();
  const [cfg, tiers, customers] = await Promise.all([loadConfig(supabase), loadTiers(supabase), loadCustomers(supabase)]);

  const accounts: AccountRow[] = [];
  for (let from = 0; from < 100000; from += 1000) {
    const { data } = await supabase
      .from("loyalty_account")
      .select("customer_id, loyalty_tier_id, points_balance, pending_balance, lifetime_points, member_no")
      .order("id")
      .range(from, from + 999);
    const rows = (data ?? []) as AccountRow[];
    accounts.push(...rows);
    if (rows.length < 1000) break;
  }
  const byCustomer = new Map<string, AccountRow>(accounts.map((a) => [a.customer_id, a] as [string, AccountRow]));
  const tierName = new Map<string, string>(tiers.map((t) => [t.id, t.name] as [string, string]));

  // Points that may expire soon (earned credits whose expiry falls inside the warning window).
  const warnDays = cfg?.expiry_warning_days ?? 30;
  const until = new Date(Date.now() + warnDays * 864e5).toISOString();
  const { data: soon } = await supabase
    .from("loyalty_transaction")
    .select("customer_id, points, expires_at")
    .eq("status", "earned")
    .gt("points", 0)
    .gt("expires_at", new Date().toISOString())
    .lte("expires_at", until)
    .limit(1000);
  const expiring = new Map<string, { points: number; first: string }>();
  for (const r of (soon ?? []) as { customer_id: string; points: number; expires_at: string }[]) {
    const cur = expiring.get(r.customer_id) ?? { points: 0, first: r.expires_at };
    cur.points += Number(r.points);
    if (r.expires_at < cur.first) cur.first = r.expires_at;
    expiring.set(r.customer_id, cur);
  }
  const reminderDays = (cfg?.expiry_reminder_days ?? [30, 7, 1]).slice().sort((a, b) => b - a);
  const buckets = reminderDays.map((d) => ({
    d,
    count: Array.from(expiring.values()).filter((e) => (new Date(e.first).getTime() - Date.now()) / 864e5 <= d).length,
  }));

  const rows = customers
    .map((c) => ({ c, a: byCustomer.get(c.id) }))
    .filter(({ c }) => !q || c.full_name.toLowerCase().includes(q));
  rows.sort((x, y) => Number(y.a?.points_balance ?? -1) - Number(x.a?.points_balance ?? -1) || x.c.full_name.localeCompare(y.c.full_name));
  const shown = rows.slice(0, 100);

  return (
    <div className="space-y-6">
      <ClubHeader
        current="/club/members"
        title="Members & points"
        sub="Every customer is a member. Open a member to see their wallet, how each point was calculated, and to redeem, adjust or record a review."
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="border border-black/10 bg-white px-4 py-3.5">
          <div className="text-[12px] font-medium text-ink-2">Wallets opened</div>
          <div className="mt-1 text-[24px] font-bold tabular-nums text-ink">{accounts.length.toLocaleString("en-IN")}</div>
          <div className="text-[12px] text-ink-3">A wallet opens at a member's first points event</div>
        </div>
        {buckets.map((b) => (
          <div key={b.d} className="border border-black/10 bg-white px-4 py-3.5">
            <div className="text-[12px] font-medium text-ink-2">Points expiring within {b.d} {b.d === 1 ? "day" : "days"}</div>
            <div className="mt-1 text-[24px] font-bold tabular-nums text-ink">{b.count}</div>
            <div className="text-[12px] text-ink-3">members to remind</div>
          </div>
        ))}
      </div>

      <Card title="Find a member">
        <form className="flex gap-2">
          <input className={inputCls + " max-w-md"} name="q" defaultValue={searchParams.q ?? ""} placeholder="Customer name" aria-label="Search by customer name" />
          <button className="rounded-full border border-hair-2 bg-white px-4 text-[13px] font-semibold text-ink hover:bg-beige" type="submit">Search</button>
        </form>
      </Card>

      <div className="overflow-x-auto border border-black/10 bg-white [border-radius:14px]">
        <table className="w-full min-w-[760px] text-left text-[13px]">
          <thead className="border-b-2 border-black/10 text-[11px] uppercase tracking-wide text-ink/50">
            <tr>
              <th className="px-5 py-3 font-medium">Member</th>
              <th className="px-5 py-3 font-medium">Tier</th>
              <th className="px-5 py-3 text-right font-medium">Available</th>
              <th className="px-5 py-3 text-right font-medium">Pending</th>
              <th className="px-5 py-3 text-right font-medium">Expiring soon</th>
              <th className="px-5 py-3 text-right font-medium">Lifetime</th>
            </tr>
          </thead>
          <tbody>
            {shown.map(({ c, a }) => {
              const e = expiring.get(c.id);
              return (
                <tr key={c.id} className="border-t border-black/5">
                  <td className="px-5 py-3">
                    <Link href={`/club/members/${c.id}`} className="font-medium text-ink hover:underline">{c.full_name}</Link>
                    {a?.member_no && <span className="block font-mono text-[11px] text-ink-3">{a.member_no}</span>}
                  </td>
                  <td className="px-5 py-3 text-ink-2">{a?.loyalty_tier_id ? tierName.get(a.loyalty_tier_id) ?? "—" : "No wallet yet"}</td>
                  <td className="px-5 py-3 text-right font-semibold tabular-nums">{a ? pts(cfg, Number(a.points_balance)) : "—"}</td>
                  <td className="px-5 py-3 text-right tabular-nums text-ink-2">{a ? pts(cfg, Number(a.pending_balance)) : "—"}</td>
                  <td className="px-5 py-3 text-right tabular-nums">{e ? <span className="text-[#8a5a12]">{pts(cfg, e.points)} by {e.first.slice(0, 10)}</span> : "—"}</td>
                  <td className="px-5 py-3 text-right tabular-nums text-ink-2">{a ? pts(cfg, Number(a.lifetime_points)) : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-[12px] text-ink-3">
        Showing {shown.length} of {rows.length.toLocaleString("en-IN")} members{q ? ` matching “${searchParams.q}”` : ", highest balance first"}. “Expiring soon” is an upper estimate; the member&apos;s wallet shows the exact figure after points already used.
      </p>
    </div>
  );
}
