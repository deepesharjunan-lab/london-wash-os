"use client";

import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { DAYS } from "@/lib/google/days";
import { createPostAction, replyAction, saveRegularHoursAction, saveSpecialHoursAction, type GState } from "./actions";

// Client parts of Website → Google Business: reply box, post form, hours editors.

const box = "w-full border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-accent";
const label = "mb-1 block text-[12px] font-semibold uppercase tracking-wide text-ink/55";

function Submit({ text, busy = "Saving…" }: { text: string; busy?: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="rounded-md bg-[#1f7a4d] px-4 py-2 text-[13px] font-semibold text-white hover:bg-[#19663f] disabled:opacity-50">
      {pending ? busy : text}
    </button>
  );
}

function Result({ state }: { state: GState }) {
  if (state.ok) return <span className="text-[13px] text-[#2c6a4e]">{state.ok}</span>;
  if (state.error) return <span className="text-[13px] text-[#9c3326]">{state.error}</span>;
  return null;
}

// ---------- reviews ----------

function suggestions(stars: number | null, name: string, hasComment: boolean, phone: string): string[] {
  const first = name && name !== "A Google user" ? name.split(" ")[0] : "";
  const hi = first ? `Thank you, ${first}!` : "Thank you!";
  if (!hasComment && (stars ?? 0) >= 4) {
    return [
      `${hi} We're so glad you chose The London Wash. If you have a moment, we'd love to hear a line or two about what you liked. It really helps other families in Pathanamthitta find us.`,
      `${hi} Thanks for the ${stars} stars. If you get a minute, a short comment about your experience would mean a lot to our small team.`,
    ];
  }
  if ((stars ?? 0) >= 4) {
    return [
      `${hi} We're delighted you're happy with the service. Looking forward to caring for your clothes again soon.`,
      `${hi} Your kind words mean a lot to our team. See you again at The London Wash.`,
    ];
  }
  if (stars === 3) {
    return [`${hi} Thanks for the honest feedback. We'd love to know what we could do better. Please WhatsApp us on ${phone} so we can make it right next time.`];
  }
  return [
    `${first ? `Dear ${first}, we're` : "We're"} really sorry about your experience. This isn't the standard we aim for. Please WhatsApp us on ${phone} so we can look into it and put it right.`,
  ];
}

export function ReplyBox({ reviewId, stars, name, hasComment, existing, phone }: { reviewId: string; stars: number | null; name: string; hasComment: boolean; existing: string | null; phone: string }) {
  const [state, action] = useFormState<GState, FormData>(replyAction, {});
  const [text, setText] = useState(existing ?? "");
  const [open, setOpen] = useState(!existing);
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="text-[12.5px] font-medium text-accent hover:underline">
        Edit reply
      </button>
    );
  }
  return (
    <form action={action} className="mt-2">
      <input type="hidden" name="review_id" value={reviewId} />
      {!existing && (
        <div className="mb-1.5 flex flex-wrap gap-1.5">
          {suggestions(stars, name, hasComment, phone).map((s, i) => (
            <button key={i} type="button" onClick={() => setText(s)} className="rounded-full border border-black/10 bg-[#f6f3ec] px-2.5 py-1 text-[11.5px] text-ink/70 hover:border-accent/50">
              Suggestion {i + 1}
            </button>
          ))}
        </div>
      )}
      <textarea name="comment" rows={3} maxLength={4000} value={text} onChange={(e) => setText(e.target.value)} placeholder="Write a reply. It's public on Google." className={box} />
      <div className="mt-1.5 flex flex-wrap items-center gap-3">
        <Submit text={existing ? "Update reply" : "Post reply"} busy="Posting…" />
        {existing && (
          <button type="button" onClick={() => setOpen(false)} className="text-[12.5px] text-ink/50 hover:underline">
            Cancel
          </button>
        )}
        <Result state={state} />
      </div>
    </form>
  );
}

// ---------- posts ----------

export function PostForm() {
  const [state, action] = useFormState<GState, FormData>(createPostAction, {});
  const [kind, setKind] = useState("STANDARD");
  const [cta, setCta] = useState("BOOK");
  const [summary, setSummary] = useState("");
  return (
    <form action={action} className="space-y-3">
      <div className="flex gap-2">
        {[
          ["STANDARD", "Update"],
          ["OFFER", "Offer"],
        ].map(([k, l]) => (
          <label key={k} className={"cursor-pointer rounded-md border px-3 py-1.5 text-[13px] " + (kind === k ? "border-accent bg-accent/10 font-semibold text-ink" : "border-black/10 text-ink/60")}>
            <input type="radio" name="kind" value={k} checked={kind === k} onChange={() => setKind(k)} className="sr-only" />
            {l}
          </label>
        ))}
      </div>
      {kind === "OFFER" && (
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="sm:col-span-3">
            <label className={label}>Offer title</label>
            <input name="offer_title" maxLength={58} className={box} placeholder="20% off blanket cleaning" />
          </div>
          <div>
            <label className={label}>Starts</label>
            <input type="date" name="offer_start" className={box} />
          </div>
          <div>
            <label className={label}>Ends</label>
            <input type="date" name="offer_end" className={box} />
          </div>
          <div>
            <label className={label}>Coupon code (optional)</label>
            <input name="coupon" maxLength={58} className={box} />
          </div>
          <div className="sm:col-span-3">
            <label className={label}>Terms (optional)</label>
            <input name="terms" maxLength={500} className={box} placeholder="Valid at our Pathanamthitta store." />
          </div>
        </div>
      )}
      <div>
        <label className={label}>Text</label>
        <textarea name="summary" rows={4} maxLength={1500} value={summary} onChange={(e) => setSummary(e.target.value)} className={box} placeholder="Monsoon special: blankets and quilts washed, dried and folded in 48 hours." />
        <span className="text-[11.5px] text-ink/45">{summary.length} / 1500 · the first 80 characters show in the preview</span>
      </div>
      <div className="grid gap-3 sm:grid-cols-[180px_1fr]">
        <div>
          <label className={label}>Button</label>
          <select name="cta" value={cta} onChange={(e) => setCta(e.target.value)} className={box}>
            <option value="">No button</option>
            <option value="BOOK">Book</option>
            <option value="ORDER">Order online</option>
            <option value="LEARN_MORE">Learn more</option>
            <option value="CALL">Call now</option>
            <option value="SIGN_UP">Sign up</option>
          </select>
        </div>
        {cta && cta !== "CALL" && (
          <div>
            <label className={label}>Button link</label>
            <input name="cta_url" className={box} defaultValue="https://www.thelondonwash.com/?utm_source=google&utm_medium=organic&utm_campaign=gbp_post" />
          </div>
        )}
      </div>
      <div>
        <label className={label}>Photo link (optional)</label>
        <input name="image_url" className={box} placeholder="https://… (JPG or PNG, at least 400 × 300)" />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Submit text="Publish on Google" busy="Publishing…" />
        <Result state={state} />
      </div>
    </form>
  );
}

// ---------- hours ----------

type Slot = { open: string; close: string };

export function RegularHoursForm({ initial }: { initial: Record<string, Slot[]> }) {
  const [state, action] = useFormState<GState, FormData>(saveRegularHoursAction, {});
  const [days, setDays] = useState(initial);
  const set = (d: string, slots: Slot[]) => setDays({ ...days, [d]: slots });
  return (
    <form action={action}>
      <input type="hidden" name="hours" value={JSON.stringify(days)} />
      <div className="divide-y divide-black/5">
        {DAYS.map((d) => {
          const slots = days[d] ?? [];
          const closed = slots.length === 0;
          return (
            <div key={d} className="flex flex-wrap items-center gap-3 py-2">
              <span className="w-24 text-[13.5px] font-semibold capitalize text-ink">{d.toLowerCase()}</span>
              <label className="flex items-center gap-1.5 text-[12.5px] text-ink/60">
                <input type="checkbox" checked={!closed} onChange={(e) => set(d, e.target.checked ? [{ open: "09:00", close: "21:00" }] : [])} />
                Open
              </label>
              {closed ? (
                <span className="text-[13px] text-ink/40">Closed</span>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  {slots.map((s, i) => (
                    <span key={i} className="flex items-center gap-1">
                      <input type="time" value={s.open} onChange={(e) => set(d, slots.map((x, j) => (j === i ? { ...x, open: e.target.value } : x)))} className="border border-black/10 px-2 py-1 text-[13px]" />
                      –
                      <input type="time" value={s.close} onChange={(e) => set(d, slots.map((x, j) => (j === i ? { ...x, close: e.target.value } : x)))} className="border border-black/10 px-2 py-1 text-[13px]" />
                      {slots.length > 1 && (
                        <button type="button" onClick={() => set(d, slots.filter((_, j) => j !== i))} className="px-1 text-[12px] text-[#9c3326]">
                          ✕
                        </button>
                      )}
                    </span>
                  ))}
                  {slots.length < 3 && (
                    <button type="button" onClick={() => set(d, [...slots, { open: "16:00", close: "20:00" }])} className="text-[12px] text-accent hover:underline">
                      + break
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => setDays(Object.fromEntries(DAYS.map((d) => [d, days.MONDAY?.length ? days.MONDAY : [{ open: "09:00", close: "21:00" }]])))} className="rounded-md border border-black/10 px-3 py-2 text-[12.5px] text-ink/70">
          Copy Monday to all days
        </button>
        <Submit text="Save hours on Google" />
        <Result state={state} />
      </div>
    </form>
  );
}

type Special = { date: string; closed: boolean; open: string; close: string };

export function SpecialHoursForm({ initial }: { initial: Special[] }) {
  const [state, action] = useFormState<GState, FormData>(saveSpecialHoursAction, {});
  const [rows, setRows] = useState(initial);
  const set = (i: number, patch: Partial<Special>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  return (
    <form action={action}>
      <input type="hidden" name="special" value={JSON.stringify(rows)} />
      {rows.length === 0 && <p className="mb-2 text-[13px] text-ink/50">No special days. Add holidays like Onam, Vishu or Christmas so Google shows the right hours.</p>}
      <div className="space-y-2">
        {rows.map((r, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2">
            <input type="date" value={r.date} onChange={(e) => set(i, { date: e.target.value })} className="border border-black/10 px-2 py-1 text-[13px]" />
            <label className="flex items-center gap-1.5 text-[12.5px] text-ink/60">
              <input type="checkbox" checked={r.closed} onChange={(e) => set(i, { closed: e.target.checked })} />
              Closed all day
            </label>
            {!r.closed && (
              <>
                <input type="time" value={r.open} onChange={(e) => set(i, { open: e.target.value })} className="border border-black/10 px-2 py-1 text-[13px]" />
                –
                <input type="time" value={r.close} onChange={(e) => set(i, { close: e.target.value })} className="border border-black/10 px-2 py-1 text-[13px]" />
              </>
            )}
            <button type="button" onClick={() => setRows(rows.filter((_, j) => j !== i))} className="px-1 text-[12px] text-[#9c3326]">
              Remove
            </button>
          </div>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => setRows([...rows, { date: "", closed: true, open: "09:00", close: "13:00" }])} className="rounded-md border border-dashed border-black/20 px-3 py-1.5 text-[12.5px] text-ink/70">
          + Add a special day
        </button>
        <Submit text="Save special hours" />
        <Result state={state} />
      </div>
    </form>
  );
}
