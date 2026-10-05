import { createAdminClient } from "@/lib/supabase/admin";
import { notify } from "@/lib/notify";
import { GoogleApiError, listAllReviews, STARS, type Review } from "./gbp";

// Keeps google_review in step with Google: the Engage pump calls syncReviewsIfDue
// every minute and it syncs at most every 15 minutes. New reviews alert the
// owner (in-app + push). Server-only.

const EVERY_MS = 15 * 60 * 1000;

const row = (r: Review) => ({
  review_id: r.reviewId,
  name: r.name,
  star_rating: r.starRating ? STARS[r.starRating] ?? null : null,
  comment: r.comment ? r.comment.replace(/\s*\(Translated by Google\)[\s\S]*$/, "").trim() : null,
  reviewer_name: r.reviewer?.isAnonymous ? "A Google user" : r.reviewer?.displayName ?? null,
  reviewer_photo: r.reviewer?.profilePhotoUrl ?? null,
  create_time: r.createTime ?? null,
  update_time: r.updateTime ?? null,
  reply_comment: r.reviewReply?.comment ?? null,
  reply_update_time: r.reviewReply?.updateTime ?? null,
  synced_at: new Date().toISOString(),
});

export async function syncReviews() {
  const db = createAdminClient();
  const now = new Date().toISOString();
  try {
    const { reviews, averageRating, totalReviewCount } = await listAllReviews();
    const { data: known } = await db.from("google_review").select("review_id");
    const knownIds = new Set((known ?? []).map((k: any) => k.review_id));
    const firstSync = knownIds.size === 0;
    const rows = reviews.map(row);
    for (let i = 0; i < rows.length; i += 100) {
      const { error } = await db.from("google_review").upsert(rows.slice(i, i + 100), { onConflict: "review_id" });
      if (error) throw new Error(error.message);
    }
    // Reviews deleted on Google disappear here too.
    const ids = rows.map((r) => r.review_id);
    if (ids.length) {
      const gone = [...knownIds].filter((id) => !ids.includes(id));
      if (gone.length) await db.from("google_review").delete().in("review_id", gone);
    }
    await db
      .from("google_connection")
      .update({ last_sync_at: now, last_error: null, last_error_at: null, review_count: totalReviewCount || rows.length, average_rating: averageRating || null })
      .eq("id", "main");

    const fresh = firstSync ? [] : rows.filter((r) => !knownIds.has(r.review_id));
    for (const r of fresh.slice(0, 5)) {
      const stars = r.star_rating ? "★".repeat(r.star_rating) + "☆".repeat(5 - r.star_rating) : "";
      await notify(
        { owners: true },
        {
          kind: "google_review",
          title: `New Google review ${stars} from ${r.reviewer_name ?? "a customer"}`,
          body: r.comment ? r.comment.slice(0, 300) : "No comment, rating only. Reply from Website → Google Business.",
          ownerUrl: "/google",
        }
      );
    }
    return { ok: true, total: rows.length, new: fresh.length };
  } catch (e: any) {
    await db
      .from("google_connection")
      .update({ last_sync_at: now, last_error: e?.message ?? "Sync failed", last_error_at: now })
      .eq("id", "main");
    return { ok: false, error: e?.message, waiting: e instanceof GoogleApiError && e.waiting };
  }
}

/** Called from the Engage pump. Does nothing when not connected or synced recently. */
export async function syncReviewsIfDue() {
  const db = createAdminClient();
  const { data } = await db.from("google_connection").select("last_sync_at, last_error").eq("id", "main").maybeSingle();
  if (!data) return null;
  const last = (data as any).last_sync_at ? new Date((data as any).last_sync_at).getTime() : 0;
  // While Google hasn't approved access, check hourly instead of every 15 minutes.
  const wait = /approved API access/i.test((data as any).last_error ?? "") ? 60 * 60 * 1000 : EVERY_MS;
  if (Date.now() - last < wait) return null;
  return syncReviews();
}

/** Reviews without a reply, for the sidebar badge. 0 when not connected. */
export async function unrepliedReviewCount(): Promise<number> {
  try {
    const db = createAdminClient();
    const { count } = await db.from("google_review").select("review_id", { count: "exact", head: true }).is("reply_comment", null).is("handled_at", null);
    return count ?? 0;
  } catch {
    return 0;
  }
}
