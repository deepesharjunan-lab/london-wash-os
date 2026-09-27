import { createClient } from "@/lib/supabase/server";
import type { ClubConfig, ClubTier, Qualifying } from "./engine";

type Supa = ReturnType<typeof createClient>;

export async function loadConfig(supabase: Supa): Promise<ClubConfig | null> {
  const { data } = await supabase
    .from("loyalty_program_config")
    .select("*")
    .order("branch_id", { ascending: true, nullsFirst: true })
    .limit(1)
    .maybeSingle();
  return (data as ClubConfig | null) ?? null;
}

export async function loadTiers(supabase: Supa): Promise<ClubTier[]> {
  const { data } = await supabase
    .from("loyalty_tier")
    .select("id, name, min_spend_minor, min_orders, points_multiplier, birthday_points, free_delivery_above_minor, priority_processing, turnaround_hours, sort_order, card_style, perk_description")
    .is("deleted_at", null)
    .order("sort_order", { ascending: true });
  return ((data as ClubTier[] | null) ?? []).map((t) => ({ ...t, points_multiplier: Number(t.points_multiplier) }));
}

/**
 * Qualifying spend and order count per customer over the qualification
 * period. Every order that isn't a draft or cancelled counts. Pages through
 * results because the API returns at most 1,000 rows per request.
 */
export async function loadQualifying(supabase: Supa, periodMonths: number) {
  const since = new Date();
  since.setMonth(since.getMonth() - periodMonths);
  const byCustomer = new Map<string, Qualifying & { last: string }>();
  const monthly = new Map<string, number>();
  const pageSize = 1000;
  for (let from = 0; from < 50000; from += pageSize) {
    const { data, error } = await supabase
      .from("order")
      .select("customer_id, total_minor, created_at, status")
      .gte("created_at", since.toISOString())
      .not("status", "in", "(draft,cancelled)")
      .order("created_at", { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) {
      console.error(error);
      break;
    }
    const rows = (data ?? []) as { customer_id: string; total_minor: number; created_at: string }[];
    for (const o of rows) {
      const cur = byCustomer.get(o.customer_id) ?? { spend: 0, orders: 0, last: o.created_at };
      cur.spend += Number(o.total_minor) || 0;
      cur.orders += 1;
      if (o.created_at > cur.last) cur.last = o.created_at;
      byCustomer.set(o.customer_id, cur);
      const key = o.created_at.slice(0, 7);
      monthly.set(key, (monthly.get(key) ?? 0) + (Number(o.total_minor) || 0));
    }
    if (rows.length < pageSize) break;
  }
  return { byCustomer, monthly, since };
}

/** All active customers, paged past the 1,000-row API cap. */
export async function loadCustomers(supabase: Supa) {
  const out: { id: string; full_name: string }[] = [];
  const pageSize = 1000;
  for (let from = 0; from < 100000; from += pageSize) {
    const { data, error } = await supabase
      .from("customer")
      .select("id, full_name")
      .is("deleted_at", null)
      .order("id", { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) {
      console.error(error);
      break;
    }
    const rows = (data ?? []) as { id: string; full_name: string }[];
    out.push(...rows);
    if (rows.length < pageSize) break;
  }
  return out;
}

/** Sum of points balances across loyalty accounts, paged. */
export async function loadPointsOutstanding(supabase: Supa) {
  let total = 0;
  const pageSize = 1000;
  for (let from = 0; from < 100000; from += pageSize) {
    const { data, error } = await supabase
      .from("loyalty_account")
      .select("points_balance")
      .order("id", { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) {
      console.error(error);
      break;
    }
    const rows = (data ?? []) as { points_balance: number }[];
    for (const r of rows) total += Number(r.points_balance) || 0;
    if (rows.length < pageSize) break;
  }
  return total;
}

export async function loadServices(supabase: Supa) {
  const { data } = await supabase
    .from("service")
    .select("id, name")
    .is("deleted_at", null)
    .order("name", { ascending: true });
  return (data as { id: string; name: string }[] | null) ?? [];
}
