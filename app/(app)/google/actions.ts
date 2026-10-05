"use server";
import { revalidatePath } from "next/cache";
import { consoleUserId } from "@/lib/auth/console-user";
import { createAdminClient } from "@/lib/supabase/admin";
import { revokeToken } from "@/lib/google/oauth";
import { createPost, deletePost, deleteReply, findLocation, replyToReview, saveHours, type LocalPost, type Period, type SpecialPeriod } from "@/lib/google/gbp";
import { syncReviews } from "@/lib/google/reviews";
import { DAYS } from "@/lib/google/days";

// Website → Google Business: replies, posts and hours go straight to Google.

export type GState = { error?: string; ok?: string };

const refresh = () => revalidatePath("/google", "layout");
const gone = { error: "Your session has ended. Sign in again." };
const msg = (e: any) => e?.message ?? "Google didn't accept that. Try again.";

export async function syncNowAction() {
  if (!(await consoleUserId())) return;
  await syncReviews();
  refresh();
}

export async function findLocationAction() {
  if (!(await consoleUserId())) return;
  try {
    await findLocation();
    await syncReviews();
  } catch (e: any) {
    await createAdminClient().from("google_connection").update({ last_error: msg(e), last_error_at: new Date().toISOString() }).eq("id", "main");
  }
  refresh();
}

export async function disconnectAction() {
  if (!(await consoleUserId())) return;
  const db = createAdminClient();
  const { data } = await db.from("google_connection").select("refresh_token_enc").eq("id", "main").maybeSingle();
  if (data) await revokeToken((data as any).refresh_token_enc);
  await db.from("google_connection").delete().eq("id", "main");
  await db.from("google_review").delete().neq("review_id", "");
  refresh();
}

// ---------- reviews ----------

export async function replyAction(_p: GState, form: FormData): Promise<GState> {
  if (!(await consoleUserId())) return gone;
  const id = String(form.get("review_id") ?? "");
  const comment = String(form.get("comment") ?? "").trim();
  if (!comment) return { error: "Write a reply first." };
  if (comment.length > 4000) return { error: "Google allows up to 4,000 characters." };
  const db = createAdminClient();
  const { data: r } = await db.from("google_review").select("name").eq("review_id", id).maybeSingle();
  if (!r) return { error: "That review is no longer on Google." };
  try {
    const res = await replyToReview((r as any).name, comment);
    await db
      .from("google_review")
      .update({ reply_comment: res.comment ?? comment, reply_update_time: res.updateTime ?? new Date().toISOString() })
      .eq("review_id", id);
  } catch (e) {
    return { error: msg(e) };
  }
  refresh();
  return { ok: "Reply posted on Google." };
}

export async function deleteReplyAction(form: FormData) {
  if (!(await consoleUserId())) return;
  const id = String(form.get("review_id") ?? "");
  const db = createAdminClient();
  const { data: r } = await db.from("google_review").select("name").eq("review_id", id).maybeSingle();
  if (!r) return;
  try {
    await deleteReply((r as any).name);
    await db.from("google_review").update({ reply_comment: null, reply_update_time: null }).eq("review_id", id);
  } catch (e) {
    console.error("delete reply", e);
  }
  refresh();
}

export async function markHandledAction(form: FormData) {
  if (!(await consoleUserId())) return;
  const id = String(form.get("review_id") ?? "");
  const on = form.get("on") === "1";
  await createAdminClient()
    .from("google_review")
    .update({ handled_at: on ? new Date().toISOString() : null })
    .eq("review_id", id);
  refresh();
}

// ---------- posts ----------

const CTA_TYPES = ["BOOK", "ORDER", "LEARN_MORE", "CALL", "SIGN_UP"];

const gdate = (s: string) => {
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) } : null;
};

export async function createPostAction(_p: GState, form: FormData): Promise<GState> {
  if (!(await consoleUserId())) return gone;
  const s = (k: string, max = 1500) => String(form.get(k) ?? "").trim().slice(0, max);
  const summary = s("summary");
  const kind = s("kind") === "OFFER" ? "OFFER" : "STANDARD";
  if (summary.length < 10) return { error: "Write at least a sentence for the post." };
  const post: Omit<LocalPost, "name" | "state" | "createTime" | "searchUrl"> = { summary, topicType: kind };

  const cta = s("cta");
  const ctaUrl = s("cta_url", 500);
  if (cta && CTA_TYPES.includes(cta)) {
    if (cta !== "CALL" && !/^https:\/\//.test(ctaUrl)) return { error: "The button link must start with https://" };
    post.callToAction = cta === "CALL" ? { actionType: "CALL" } : { actionType: cta, url: ctaUrl };
  }
  const image = s("image_url", 500);
  if (image) {
    if (!/^https:\/\//.test(image)) return { error: "The photo link must start with https://" };
    post.media = [{ mediaFormat: "PHOTO", sourceUrl: image }];
  }
  if (kind === "OFFER") {
    const title = s("offer_title", 58);
    const start = gdate(s("offer_start", 10));
    const end = gdate(s("offer_end", 10));
    if (!title || !start || !end) return { error: "An offer needs a title, a start date and an end date." };
    post.event = { title, schedule: { startDate: start, endDate: end } };
    const coupon = s("coupon", 58);
    const terms = s("terms", 5000);
    if (coupon || terms) post.offer = { ...(coupon ? { couponCode: coupon } : {}), ...(terms ? { termsConditions: terms } : {}) };
  }
  try {
    await createPost(post);
  } catch (e) {
    return { error: msg(e) };
  }
  refresh();
  return { ok: "Posted. Google may take a few minutes to show it." };
}

export async function deletePostAction(form: FormData) {
  if (!(await consoleUserId())) return;
  const name = String(form.get("name") ?? "");
  if (!/^accounts\/\d+\/locations\/\d+\/localPosts\/\w+$/.test(name)) return;
  try {
    await deletePost(name);
  } catch (e) {
    console.error("delete post", e);
  }
  refresh();
}

// ---------- hours ----------

const tod = (s: string) => {
  const m = s.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 24 || min > 59 || (h === 24 && min > 0)) return null;
  return { hours: h, minutes: min };
};
const mins = (t: { hours: number; minutes: number }) => t.hours * 60 + t.minutes;

type DayRows = Record<string, { open: string; close: string }[]>; // empty list = closed

export async function saveRegularHoursAction(_p: GState, form: FormData): Promise<GState> {
  if (!(await consoleUserId())) return gone;
  let days: DayRows;
  try {
    days = JSON.parse(String(form.get("hours") ?? "{}"));
  } catch {
    return { error: "Couldn't read the hours." };
  }
  const periods: Period[] = [];
  for (const d of DAYS) {
    for (const r of days[d] ?? []) {
      const o = tod(r.open);
      const c = r.close === "23:59" ? { hours: 24, minutes: 0 } : tod(r.close); // the time picker has no 24:00
      if (!o || !c) return { error: `Check the times for ${d.toLowerCase()} (use 24-hour HH:MM).` };
      // A closing time at or before opening means it runs past midnight.
      const closeDay = mins(c) <= mins(o) ? DAYS[(DAYS.indexOf(d) + 1) % 7] : d;
      periods.push({ openDay: d, openTime: o, closeDay, closeTime: c });
    }
  }
  try {
    await saveHours({ regularHours: { periods } }, ["regularHours"]);
  } catch (e) {
    return { error: msg(e) };
  }
  refresh();
  return { ok: "Opening hours updated on Google." };
}

export async function saveSpecialHoursAction(_p: GState, form: FormData): Promise<GState> {
  if (!(await consoleUserId())) return gone;
  let rows: { date: string; closed: boolean; open: string; close: string }[];
  try {
    rows = JSON.parse(String(form.get("special") ?? "[]"));
  } catch {
    return { error: "Couldn't read the special hours." };
  }
  const specialHourPeriods: SpecialPeriod[] = [];
  for (const r of rows) {
    const date = gdate(r.date);
    if (!date) return { error: "Each special day needs a date." };
    if (r.closed) {
      specialHourPeriods.push({ startDate: date, closed: true });
      continue;
    }
    const o = tod(r.open);
    const c = r.close === "23:59" ? { hours: 24, minutes: 0 } : tod(r.close);
    if (!o || !c) return { error: `Check the times for ${r.date} (use 24-hour HH:MM).` };
    specialHourPeriods.push({ startDate: date, openTime: o, closeTime: c });
  }
  try {
    await saveHours({ specialHours: { specialHourPeriods } }, ["specialHours"]);
  } catch (e) {
    return { error: msg(e) };
  }
  refresh();
  return { ok: "Special hours updated on Google." };
}

