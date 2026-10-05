import { createAdminClient } from "@/lib/supabase/admin";
import { accessToken } from "./oauth";

// Google Business Profile API calls for the connected location: reviews and
// posts (My Business API v4), hours (Business Information API v1) and
// performance (Business Profile Performance API v1). Google only allows these
// after it approves the project's API access request; until then every call
// fails with a quota error, shown on the page as "waiting for approval".
// Server-only.

const INFO = "https://mybusinessbusinessinformation.googleapis.com/v1";
const ACCOUNTS = "https://mybusinessaccountmanagement.googleapis.com/v1";
const V4 = "https://mybusiness.googleapis.com/v4";
const PERF = "https://businessprofileperformance.googleapis.com/v1";

// The London Wash's store code on Google, used to pick it out of the account's businesses.
const STORE_CODE = "06824067336222013814";

export class GoogleApiError extends Error {
  constructor(message: string, public status: number, public waiting = false) {
    super(message);
  }
}

/** True when the error means Google hasn't approved (or switched on) API access yet. */
const isAccessPending = (status: number, msg: string) =>
  (status === 429 && /quota/i.test(msg)) || (status === 403 && /(has not been used|is disabled|not enabled|SERVICE_DISABLED|quota)/i.test(msg));

async function gfetch<T = any>(url: string, init: RequestInit = {}): Promise<T> {
  const token = await accessToken();
  if (!token) throw new GoogleApiError("Google Business Profile is not connected.", 401);
  const res = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
    cache: "no-store",
  });
  if (res.status === 204) return {} as T;
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg: string = json?.error?.message || `Google returned ${res.status}`;
    if (isAccessPending(res.status, msg)) {
      throw new GoogleApiError("Google hasn't approved API access for this project yet. Everything here starts working once the approval email arrives.", res.status, true);
    }
    throw new GoogleApiError(msg, res.status);
  }
  return json as T;
}

// ---------- connection ----------

export type Connection = {
  account_name: string | null;
  location_name: string | null;
  location_title: string | null;
  connected_at: string;
  last_sync_at: string | null;
  last_error: string | null;
  last_error_at: string | null;
  review_count: number | null;
  average_rating: number | null;
};

export async function getConnection(): Promise<Connection | null> {
  const db = createAdminClient();
  const { data } = await db
    .from("google_connection")
    .select("account_name, location_name, location_title, connected_at, last_sync_at, last_error, last_error_at, review_count, average_rating")
    .eq("id", "main")
    .maybeSingle();
  return (data as Connection | null) ?? null;
}

/** Finds The London Wash among the connected account's businesses and remembers it. */
export async function findLocation() {
  const accounts = await gfetch<{ accounts?: { name: string; accountName?: string }[] }>(`${ACCOUNTS}/accounts?pageSize=20`);
  let best: { account: string; name: string; title: string } | null = null;
  for (const a of accounts.accounts ?? []) {
    let pageToken = "";
    do {
      const q = new URLSearchParams({ readMask: "name,title,storeCode", pageSize: "100" });
      if (pageToken) q.set("pageToken", pageToken);
      const res = await gfetch<{ locations?: { name: string; title: string; storeCode?: string }[]; nextPageToken?: string }>(`${INFO}/${a.name}/locations?${q}`);
      for (const l of res.locations ?? []) {
        if (l.storeCode === STORE_CODE) best = { account: a.name, name: l.name, title: l.title };
        else if (!best && /london wash/i.test(l.title)) best = { account: a.name, name: l.name, title: l.title };
      }
      pageToken = res.nextPageToken ?? "";
    } while (pageToken && !(best && best.name));
    if (best) break;
  }
  if (!best) throw new GoogleApiError("The London Wash wasn't found in this Google account. Connect with the Google account that manages the Business Profile.", 404);
  await createAdminClient()
    .from("google_connection")
    .update({ account_name: best.account, location_name: best.name, location_title: best.title, last_error: null, last_error_at: null })
    .eq("id", "main");
  return best;
}

async function located() {
  const c = await getConnection();
  if (!c) throw new GoogleApiError("Google Business Profile is not connected.", 401);
  if (c.location_name && c.account_name) return { account: c.account_name, location: c.location_name };
  const f = await findLocation();
  return { account: f.account, location: f.name };
}

const v4Path = (account: string, location: string) => `${V4}/${account}/${location}`;

// ---------- reviews ----------

export type Review = {
  name: string;
  reviewId: string;
  reviewer?: { displayName?: string; profilePhotoUrl?: string; isAnonymous?: boolean };
  starRating?: "ONE" | "TWO" | "THREE" | "FOUR" | "FIVE" | "STAR_RATING_UNSPECIFIED";
  comment?: string;
  createTime?: string;
  updateTime?: string;
  reviewReply?: { comment: string; updateTime?: string };
};

export const STARS: Record<string, number> = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 };

export async function listAllReviews(max = 500) {
  const { account, location } = await located();
  const out: Review[] = [];
  let pageToken = "";
  let meta = { averageRating: 0, totalReviewCount: 0 };
  do {
    const q = new URLSearchParams({ pageSize: "50", orderBy: "updateTime desc" });
    if (pageToken) q.set("pageToken", pageToken);
    const res = await gfetch<{ reviews?: Review[]; averageRating?: number; totalReviewCount?: number; nextPageToken?: string }>(`${v4Path(account, location)}/reviews?${q}`);
    out.push(...(res.reviews ?? []));
    meta = { averageRating: res.averageRating ?? meta.averageRating, totalReviewCount: res.totalReviewCount ?? meta.totalReviewCount };
    pageToken = res.nextPageToken ?? "";
  } while (pageToken && out.length < max);
  return { reviews: out, ...meta };
}

/** `name` is the review's full resource name (stored in google_review.name). */
export const replyToReview = (name: string, comment: string) => gfetch<{ comment: string; updateTime: string }>(`${V4}/${name}/reply`, { method: "PUT", body: JSON.stringify({ comment }) });
export const deleteReply = (name: string) => gfetch(`${V4}/${name}/reply`, { method: "DELETE" });

// ---------- posts ----------

export type LocalPost = {
  name: string;
  summary?: string;
  topicType?: "STANDARD" | "EVENT" | "OFFER" | "ALERT";
  state?: "LIVE" | "PROCESSING" | "REJECTED" | "LOCAL_POST_STATE_UNSPECIFIED";
  createTime?: string;
  searchUrl?: string;
  callToAction?: { actionType: string; url?: string };
  media?: { mediaFormat?: "PHOTO" | "VIDEO"; googleUrl?: string; sourceUrl?: string }[];
  event?: { title?: string; schedule?: { startDate?: GDate; endDate?: GDate } };
  offer?: { couponCode?: string; termsConditions?: string; redeemOnlineUrl?: string };
};

export type GDate = { year: number; month: number; day: number };

export async function listPosts() {
  const { account, location } = await located();
  const res = await gfetch<{ localPosts?: LocalPost[] }>(`${v4Path(account, location)}/localPosts?pageSize=20`);
  return res.localPosts ?? [];
}

export async function createPost(post: Omit<LocalPost, "name" | "state" | "createTime" | "searchUrl">) {
  const { account, location } = await located();
  return gfetch<LocalPost>(`${v4Path(account, location)}/localPosts`, { method: "POST", body: JSON.stringify({ languageCode: "en", ...post }) });
}

export const deletePost = (name: string) => gfetch(`${V4}/${name}`, { method: "DELETE" });

// ---------- hours ----------

export type TimeOfDay = { hours?: number; minutes?: number };
export type Period = { openDay: string; openTime?: TimeOfDay; closeDay: string; closeTime?: TimeOfDay };
export type SpecialPeriod = { startDate: GDate; endDate?: GDate; openTime?: TimeOfDay; closeTime?: TimeOfDay; closed?: boolean };
export type Hours = { regularHours?: { periods?: Period[] }; specialHours?: { specialHourPeriods?: SpecialPeriod[] } };

export async function getHours(): Promise<Hours & { title?: string }> {
  const { location } = await located();
  return gfetch(`${INFO}/${location}?readMask=title,regularHours,specialHours`);
}

export async function saveHours(h: Hours, mask: ("regularHours" | "specialHours")[]) {
  const { location } = await located();
  return gfetch(`${INFO}/${location}?updateMask=${mask.join(",")}`, { method: "PATCH", body: JSON.stringify(h) });
}

// ---------- performance ----------

export const DAILY_METRICS = [
  "BUSINESS_IMPRESSIONS_MOBILE_SEARCH",
  "BUSINESS_IMPRESSIONS_DESKTOP_SEARCH",
  "BUSINESS_IMPRESSIONS_MOBILE_MAPS",
  "BUSINESS_IMPRESSIONS_DESKTOP_MAPS",
  "CALL_CLICKS",
  "WEBSITE_CLICKS",
  "BUSINESS_DIRECTION_REQUESTS",
  "BUSINESS_CONVERSATIONS",
] as const;
export type DailyMetric = (typeof DAILY_METRICS)[number];

const dateParts = (prefix: string, d: Date) => ({
  [`${prefix}.year`]: String(d.getUTCFullYear()),
  [`${prefix}.month`]: String(d.getUTCMonth() + 1),
  [`${prefix}.day`]: String(d.getUTCDate()),
});

/** Daily values per metric, keyed YYYY-MM-DD. */
export async function dailyMetrics(start: Date, end: Date) {
  const { location } = await located();
  const q = new URLSearchParams({ ...dateParts("dailyRange.startDate", start), ...dateParts("dailyRange.endDate", end) });
  DAILY_METRICS.forEach((m) => q.append("dailyMetrics", m));
  const res = await gfetch<any>(`${PERF}/${location}:fetchMultiDailyMetricsTimeSeries?${q}`);
  const out: Record<string, Record<string, number>> = {};
  for (const group of res.multiDailyMetricTimeSeries ?? []) {
    for (const s of group.dailyMetricTimeSeries ?? []) {
      const m = (out[s.dailyMetric] ??= {});
      for (const v of s.timeSeries?.datedValues ?? []) {
        const d = v.date;
        m[`${d.year}-${String(d.month).padStart(2, "0")}-${String(d.day).padStart(2, "0")}`] = Number(v.value ?? 0);
      }
    }
  }
  return out as Record<DailyMetric, Record<string, number>>;
}

/** What people searched on Google to find the business, for a month range. */
export async function searchKeywords(startMonth: Date, endMonth: Date) {
  const { location } = await located();
  const q = new URLSearchParams({
    "monthlyRange.startMonth.year": String(startMonth.getUTCFullYear()),
    "monthlyRange.startMonth.month": String(startMonth.getUTCMonth() + 1),
    "monthlyRange.endMonth.year": String(endMonth.getUTCFullYear()),
    "monthlyRange.endMonth.month": String(endMonth.getUTCMonth() + 1),
    pageSize: "20",
  });
  const res = await gfetch<{ searchKeywordsCounts?: { searchKeyword: string; insightsValue?: { value?: string; threshold?: string } }[] }>(
    `${PERF}/${location}/searchkeywords/impressions/monthly?${q}`
  );
  return (res.searchKeywordsCounts ?? []).map((k) => ({
    keyword: k.searchKeyword,
    count: k.insightsValue?.value ? Number(k.insightsValue.value) : null,
    under: k.insightsValue?.threshold ? Number(k.insightsValue.threshold) : null,
  }));
}
