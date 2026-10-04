// ENGAGE → Audiences: the filters a segment can use, how a customer is
// matched, and a plain-English description. Pure code (no database), so the
// builder in the browser and the server share it.

export type Profile = {
  id: string;
  full_name: string;
  phone: string;
  branch_id: string;
  birth_date: string | null;
  created_at: string;
  corporate_account_id: string | null;
  family_account_id: string | null;
  marketing_opt_out: boolean;
  tier_name: string | null;
  tier_id: string | null;
  points: number | string;
  order_count: number;
  total_spent_minor: number | string;
  first_order_at: string | null;
  last_order_at: string | null;
  channels: string[];
  service_ids: string[];
  city: string | null;
  pincode: string | null;
  tags: string[];
  has_whatsapp_chat: boolean;
  last_rating: number | null;
};

export type Filter =
  | { type: "last_order"; op: "within" | "not_within" | "never"; days?: number }
  | { type: "order_count"; min?: number; max?: number }
  | { type: "total_spent"; min?: number; max?: number } // rupees
  | { type: "avg_order"; min?: number; max?: number } // rupees
  | { type: "services"; op: "any" | "none"; ids: string[] }
  | { type: "customer_since"; op: "within" | "before"; days: number }
  | { type: "birthday"; op: "month" | "next_days"; month?: number; days?: number }
  | { type: "tier"; ids: string[] }
  | { type: "points"; min?: number; max?: number }
  | { type: "location"; field: "city" | "pincode"; values: string[] }
  | { type: "branch"; ids: string[] }
  | { type: "account"; op: "corporate" | "individual" | "family" }
  | { type: "tags"; op: "any" | "none"; values: string[] }
  | { type: "channel"; values: string[] }
  | { type: "whatsapp"; op: "chatted" | "never" }
  | { type: "rating"; min?: number; max?: number };

export type FilterType = Filter["type"];

export const FILTER_TYPES: { type: FilterType; label: string; group: string }[] = [
  { type: "last_order", label: "Last order", group: "Orders" },
  { type: "order_count", label: "Number of orders", group: "Orders" },
  { type: "total_spent", label: "Total spent", group: "Orders" },
  { type: "avg_order", label: "Average order value", group: "Orders" },
  { type: "services", label: "Services used", group: "Orders" },
  { type: "channel", label: "Ordered through", group: "Orders" },
  { type: "birthday", label: "Birthday", group: "Customer" },
  { type: "customer_since", label: "Customer since", group: "Customer" },
  { type: "location", label: "City / PIN code", group: "Customer" },
  { type: "branch", label: "Branch", group: "Customer" },
  { type: "account", label: "Account type", group: "Customer" },
  { type: "tags", label: "Customer tags", group: "Customer" },
  { type: "tier", label: "Club tier", group: "Club" },
  { type: "points", label: "Club points balance", group: "Club" },
  { type: "whatsapp", label: "WhatsApp chat", group: "WhatsApp" },
  { type: "rating", label: "Last chat rating", group: "WhatsApp" },
];

export const CHANNELS: Record<string, string> = { pos_counter: "Store counter", portal: "Customer app / website", whatsapp: "WhatsApp", phone: "Phone" };
export const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export function defaultFilter(type: FilterType): Filter {
  switch (type) {
    case "last_order":
      return { type, op: "not_within", days: 60 };
    case "order_count":
      return { type, min: 1 };
    case "total_spent":
      return { type, min: 2000 };
    case "avg_order":
      return { type, min: 500 };
    case "services":
      return { type, op: "any", ids: [] };
    case "customer_since":
      return { type, op: "within", days: 30 };
    case "birthday":
      return { type, op: "next_days", days: 7 };
    case "tier":
      return { type, ids: [] };
    case "points":
      return { type, min: 500 };
    case "location":
      return { type, field: "city", values: [] };
    case "branch":
      return { type, ids: [] };
    case "account":
      return { type, op: "individual" };
    case "tags":
      return { type, op: "any", values: [] };
    case "channel":
      return { type, values: [] };
    case "whatsapp":
      return { type, op: "chatted" };
    case "rating":
      return { type, min: 4 };
  }
}

const DAY = 864e5;
const num = (v: number | string | null | undefined) => Number(v ?? 0) || 0;
const inRange = (v: number, min?: number, max?: number) => (min == null || Number.isNaN(min) || v >= min) && (max == null || Number.isNaN(max) || v <= max);
const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();

/** Days from today (IST) to the next birthday; null if no birthday saved. */
export function daysToBirthday(birth: string | null, now = new Date()): number | null {
  if (!birth) return null;
  const [, m, d] = birth.split("-").map(Number);
  if (!m || !d) return null;
  const ist = new Date(now.getTime() + 5.5 * 3600000);
  const y = ist.getUTCFullYear();
  const today = Date.UTC(y, ist.getUTCMonth(), ist.getUTCDate());
  let next = Date.UTC(y, m - 1, d);
  if (next < today) next = Date.UTC(y + 1, m - 1, d);
  return Math.round((next - today) / DAY);
}

export function matches(p: Profile, f: Filter, now = Date.now()): boolean {
  switch (f.type) {
    case "last_order": {
      if (f.op === "never") return !p.last_order_at;
      if (!p.last_order_at) return f.op === "not_within";
      const age = (now - new Date(p.last_order_at).getTime()) / DAY;
      return f.op === "within" ? age <= (f.days ?? 0) : age > (f.days ?? 0);
    }
    case "order_count":
      return inRange(p.order_count, f.min, f.max);
    case "total_spent":
      return inRange(num(p.total_spent_minor) / 100, f.min, f.max);
    case "avg_order":
      return p.order_count > 0 && inRange(num(p.total_spent_minor) / 100 / p.order_count, f.min, f.max);
    case "services": {
      if (!f.ids.length) return true;
      const has = f.ids.some((id) => p.service_ids.includes(id));
      return f.op === "any" ? has : !has;
    }
    case "customer_since": {
      const age = (now - new Date(p.created_at).getTime()) / DAY;
      return f.op === "within" ? age <= f.days : age > f.days;
    }
    case "birthday": {
      if (!p.birth_date) return false;
      if (f.op === "month") return Number(p.birth_date.split("-")[1]) === f.month;
      const d = daysToBirthday(p.birth_date, new Date(now));
      return d != null && d <= (f.days ?? 7);
    }
    case "tier":
      return !f.ids.length || (!!p.tier_id && f.ids.includes(p.tier_id));
    case "points":
      return inRange(num(p.points), f.min, f.max);
    case "location": {
      if (!f.values.length) return true;
      const v = norm(f.field === "city" ? p.city : p.pincode);
      return f.values.some((x) => norm(x) === v);
    }
    case "branch":
      return !f.ids.length || f.ids.includes(p.branch_id);
    case "account":
      return f.op === "corporate" ? !!p.corporate_account_id : f.op === "family" ? !!p.family_account_id : !p.corporate_account_id;
    case "tags": {
      if (!f.values.length) return true;
      const has = f.values.some((t) => p.tags.map(norm).includes(norm(t)));
      return f.op === "any" ? has : !has;
    }
    case "channel":
      return !f.values.length || f.values.some((c) => p.channels.includes(c));
    case "whatsapp":
      return f.op === "chatted" ? p.has_whatsapp_chat : !p.has_whatsapp_chat;
    case "rating":
      return p.last_rating != null && inRange(p.last_rating, f.min, f.max);
  }
}

export function inSegment(p: Profile, filters: Filter[], match: "all" | "any", now = Date.now()) {
  if (!filters.length) return true;
  return match === "all" ? filters.every((f) => matches(p, f, now)) : filters.some((f) => matches(p, f, now));
}

/** A valid Indian mobile (or other full international number) WhatsApp can reach. */
export const reachablePhone = (phone: string) => {
  const d = (phone ?? "").replace(/\D/g, "");
  return d.length === 10 ? /^[6-9]/.test(d) : d.length >= 11 && d.length <= 15;
};

type Names = { services?: Record<string, string>; tiers?: Record<string, string>; branches?: Record<string, string> };
const rupees = (n?: number) => (n == null || Number.isNaN(n) ? "" : `₹${n.toLocaleString("en-IN")}`);
const range = (min?: number, max?: number, fmt: (n?: number) => string = (n) => String(n)) =>
  min != null && max != null ? `between ${fmt(min)} and ${fmt(max)}` : min != null ? `at least ${fmt(min)}` : max != null ? `at most ${fmt(max)}` : "any";
const list = (ids: string[], names?: Record<string, string>) => (ids.length ? ids.map((i) => names?.[i] ?? i).join(", ") : "any");

export function describeFilter(f: Filter, n: Names = {}): string {
  switch (f.type) {
    case "last_order":
      return f.op === "never" ? "Has never ordered" : f.op === "within" ? `Ordered in the last ${f.days} days` : `No order in the last ${f.days} days`;
    case "order_count":
      return `Orders: ${range(f.min, f.max)}`;
    case "total_spent":
      return `Total spent: ${range(f.min, f.max, rupees)}`;
    case "avg_order":
      return `Average order: ${range(f.min, f.max, rupees)}`;
    case "services":
      return `${f.op === "any" ? "Has used" : "Has never used"}: ${list(f.ids, n.services)}`;
    case "customer_since":
      return f.op === "within" ? `Joined in the last ${f.days} days` : `Customer for more than ${f.days} days`;
    case "birthday":
      return f.op === "month" ? `Birthday in ${MONTHS[(f.month ?? 1) - 1]}` : `Birthday in the next ${f.days} days`;
    case "tier":
      return `Club tier: ${list(f.ids, n.tiers)}`;
    case "points":
      return `Club points: ${range(f.min, f.max)}`;
    case "location":
      return `${f.field === "city" ? "City" : "PIN code"}: ${f.values.join(", ") || "any"}`;
    case "branch":
      return `Branch: ${list(f.ids, n.branches)}`;
    case "account":
      return f.op === "corporate" ? "Corporate account customers" : f.op === "family" ? "Part of a family account" : "Individual customers (not corporate)";
    case "tags":
      return `${f.op === "any" ? "Tagged" : "Not tagged"}: ${f.values.join(", ") || "any"}`;
    case "channel":
      return `Ordered through: ${f.values.map((c) => CHANNELS[c] ?? c).join(", ") || "any"}`;
    case "whatsapp":
      return f.op === "chatted" ? "Has chatted with us on WhatsApp" : "Has never chatted on WhatsApp";
    case "rating":
      return `Last chat rating: ${range(f.min, f.max)} ⭐`;
  }
}
