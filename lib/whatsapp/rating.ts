import { createAdminClient } from "@/lib/supabase/admin";
import { notify } from "@/lib/notify";
import { sendLink, sendList, sendText } from "./client";

// "How did we do?" after staff close a WhatsApp chat. The customer taps a
// rating in a WhatsApp list (or types 1-5). Good ratings get a thank-you and a
// Google review link; low ratings ask what went wrong, alert the owners and
// reopen the chat for the team. Server-only.

const REVIEW_URL = "https://g.page/r/CTraiq6EbHBIEBM/review"; // opens the Google review box directly
const HANDOFF_MS = 4 * 3600000; // same as the bot's hand-off
const FEEDBACK_MS = 3600000; // how long we wait for the comment after a low rating
const TYPED_RATING_MS = 24 * 3600000; // a typed "1".."5" counts as a rating this long after the request

export const RATING_LABEL: Record<number, string> = { 5: "Excellent", 4: "Good", 3: "Average", 2: "Poor", 1: "Very poor" };
const stars = (n: number) => "⭐".repeat(n);

/** Sends the rating request. Only works within WhatsApp's 24-hour reply window. */
export async function sendRatingRequest(to: string) {
  const res = await sendList(
    to,
    "Thank you for chatting with The London Wash. 🧺✨\n\nWe hope our team was able to help you today. How did we do? Tap *Rate us* below to rate your experience.\n\nYour feedback helps us deliver the art of laundry even better. 🤍",
    "Rate us",
    [5, 4, 3, 2, 1].map((n) => ({ id: `rate_${n}`, title: `${stars(n)} ${RATING_LABEL[n]}` })),
    { section: "Your rating", footer: "Thank you for choosing The London Wash." }
  );
  if (res.ok) {
    await createAdminClient().from("whatsapp_contact").update({ rating_requested_at: new Date().toISOString() }).eq("wa_id", to);
  }
  return res;
}

type Contact = { closed_at: string | null; closed_by_user_id: string | null; rating_requested_at: string | null; feedback_until: string | null };

/** A rating from a list tap ("rate_4") or, shortly after a request, a typed "4". */
export function ratingFrom(action: string | null, text: string, contact: Contact | null): number | null {
  const tapped = action?.match(/^rate_([1-5])$/);
  if (tapped) return Number(tapped[1]);
  const typed = text.trim().match(/^([1-5])(\s*(⭐|\*|stars?))?$/i);
  const requested = contact?.rating_requested_at ? new Date(contact.rating_requested_at).getTime() : 0;
  if (typed && requested && Date.now() - requested < TYPED_RATING_MS) return Number(typed[1]);
  return null;
}

/** Saves the rating and answers the customer. Never throws. */
export async function handleRating(
  from: string,
  rating: number,
  contact: Contact | null,
  customer: { id: string; full_name: string } | null,
  profileName: string | undefined
) {
  try {
    const db = createAdminClient();
    await db.from("whatsapp_rating").insert({
      wa_id: from,
      customer_id: customer?.id ?? null,
      rating,
      handled_by_user_id: contact?.closed_by_user_id ?? null,
    });

    if (rating >= 4) {
      // Keep the chat closed (the customer's tap would otherwise reopen it).
      await db
        .from("whatsapp_contact")
        .update({ closed_at: contact?.closed_at ?? new Date().toISOString(), closed_by_user_id: contact?.closed_by_user_id ?? null, unread_count: 0, rating_requested_at: null })
        .eq("wa_id", from);
      await sendText(from, `Thank you so much for the ${stars(rating)}! 🤍 We're glad we could help.`);
      await sendLink(from, "If you have a moment, a Google review helps other families find us. It only takes a minute.", "Review on Google", REVIEW_URL);
      return;
    }

    // Low rating: ask what went wrong, keep the chat open with the team, tell the owners.
    await db
      .from("whatsapp_contact")
      .update({
        feedback_until: new Date(Date.now() + FEEDBACK_MS).toISOString(),
        handoff_until: new Date(Date.now() + HANDOFF_MS).toISOString(),
        rating_requested_at: null,
      })
      .eq("wa_id", from);
    await sendText(
      from,
      rating === 3
        ? "Thank you for your feedback. What could we have done better? Just reply here; our manager will read it personally."
        : "We're really sorry we let you down. 😔 Please tell us what went wrong. Our manager will read your message and get back to you."
    );
    let branchId: string | null = null;
    if (customer) {
      const { data } = await db.from("customer").select("branch_id").eq("id", customer.id).maybeSingle();
      branchId = (data as { branch_id: string | null } | null)?.branch_id ?? null;
    }
    await notify(
      { owners: true, branchId },
      {
        kind: "whatsapp_low_rating",
        title: `Low WhatsApp rating: ${stars(rating)} ${RATING_LABEL[rating]}`,
        body: `${customer?.full_name ?? profileName ?? "Customer"} · +${from}. Open the chat to follow up.`,
        ownerUrl: `/whatsapp?c=${from}`,
      }
    );
  } catch (e) {
    console.error("WhatsApp rating failed", e);
  }
}

/** After a low rating, saves the customer's next message as the comment. Returns true if it did. Never throws. */
export async function captureFeedback(from: string, text: string, contact: Contact | null) {
  try {
    if (!text || !contact?.feedback_until || new Date(contact.feedback_until).getTime() < Date.now()) return false;
    const db = createAdminClient();
    const { data: last } = await db.from("whatsapp_rating").select("id").eq("wa_id", from).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (last) await db.from("whatsapp_rating").update({ comment: text.slice(0, 2000) }).eq("id", (last as { id: string }).id);
    await db.from("whatsapp_contact").update({ feedback_until: null }).eq("wa_id", from);
    await sendText(from, "Thank you for telling us. 🙏 We've passed this to our manager, and someone from our team will reply here.");
    return true;
  } catch {
    return false;
  }
}
