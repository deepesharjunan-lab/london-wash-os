import { createAdminClient } from "@/lib/supabase/admin";
import { inSegment, reachablePhone, type Filter, type Profile } from "./segments";

// Server side of ENGAGE → Audiences: reads the customer profile view and
// runs a segment's filters over it. Server-only (service-role client).

export const PROFILE_COLS =
  "id, full_name, phone, branch_id, birth_date, created_at, corporate_account_id, family_account_id, marketing_opt_out, tier_name, tier_id, points, order_count, total_spent_minor, first_order_at, last_order_at, channels, service_ids, city, pincode, tags, has_whatsapp_chat, last_rating";

/** Every customer profile (pages past the API's 1,000-row limit). */
export async function loadProfiles(): Promise<Profile[]> {
  const db = createAdminClient();
  const out: Profile[] = [];
  for (let from = 0; from < 50000; from += 1000) {
    const { data, error } = await db.from("engage_customer_profile").select(PROFILE_COLS).order("id").range(from, from + 999);
    if (error) throw new Error(error.message);
    out.push(...((data ?? []) as Profile[]));
    if (!data || data.length < 1000) break;
  }
  return out;
}

export type SegmentResult = {
  total: number; // all customers
  matched: Profile[]; // everyone matching the filters
  reachable: Profile[]; // matched, valid WhatsApp number, not opted out (who a campaign would message)
  optedOut: number;
  noPhone: number;
};

export async function runSegment(filters: Filter[], match: "all" | "any", profiles?: Profile[]): Promise<SegmentResult> {
  const all = profiles ?? (await loadProfiles());
  const now = Date.now();
  const matched = all.filter((p) => inSegment(p, filters, match, now));
  let optedOut = 0;
  let noPhone = 0;
  const reachable: Profile[] = [];
  for (const p of matched) {
    if (p.marketing_opt_out) optedOut++;
    else if (!reachablePhone(p.phone)) noPhone++;
    else reachable.push(p);
  }
  return { total: all.length, matched, reachable, optedOut, noPhone };
}

export type FilterOptions = {
  services: { id: string; name: string }[];
  tiers: { id: string; name: string }[];
  branches: { id: string; name: string }[];
  cities: string[];
  pincodes: string[];
  tags: string[];
};

/** Choices for the filter pickers (services, tiers, branches, cities, PIN codes, tags in use). */
export async function loadFilterOptions(): Promise<FilterOptions> {
  const db = createAdminClient();
  const [s, t, b, a, tg] = await Promise.all([
    db.from("service").select("id, name").is("deleted_at", null).order("name"),
    db.from("loyalty_tier").select("id, name, sort_order").is("deleted_at", null).order("sort_order"),
    db.from("branch").select("id, name").eq("is_active", true).order("name"),
    db.from("customer_address").select("city, pincode").limit(5000),
    db.from("customer_tag").select("tag").limit(5000),
  ]);
  const uniq = (xs: (string | null | undefined)[]) =>
    [...new Map(xs.filter((x): x is string => !!x && !!x.trim()).map((x) => [x.trim().toLowerCase(), x.trim()])).values()].sort((x, y) => x.localeCompare(y));
  const addr = (a.data ?? []) as { city: string | null; pincode: string | null }[];
  return {
    services: (s.data ?? []) as { id: string; name: string }[],
    tiers: ((t.data ?? []) as { id: string; name: string }[]).map(({ id, name }) => ({ id, name })),
    branches: (b.data ?? []) as { id: string; name: string }[],
    cities: uniq(addr.map((x) => x.city)),
    pincodes: uniq(addr.map((x) => x.pincode)),
    tags: uniq(((tg.data ?? []) as { tag: string }[]).map((x) => x.tag)),
  };
}
