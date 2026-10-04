"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { audienceSizeAction, createCampaignAction, sendTestAction, type CampaignState } from "../actions";
import { variableByKey } from "@/lib/engage/variables";

export type TemplateOption = {
  key: string;
  name: string;
  language: string;
  category: string;
  headerFormat: string | null;
  headerText: string | null;
  headerImage: string | null;
  body: string;
  footer: string | null;
  buttons: { type: string; text: string }[];
  vars: { pos: number; key: string; example: string }[];
  fixed: string[]; // fields to fill once for everyone
};
export type SegmentOption = { id: string; name: string };

// Approximate Meta prices for India (per delivered message); check Meta's rate card for exact current rates.
const RATE: Record<string, number> = { MARKETING: 0.88, UTILITY: 0.13 };

const box = "w-full border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-accent";
const label = "mb-1 block text-[12px] font-semibold uppercase tracking-wide text-ink/55";

function Submit({ children, formAction, tone = "green", confirmText }: { children: React.ReactNode; formAction: (f: FormData) => void; tone?: "green" | "plain"; confirmText?: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      formAction={formAction}
      disabled={pending}
      onClick={(e) => {
        if (confirmText && !window.confirm(confirmText)) e.preventDefault();
      }}
      className={
        tone === "green"
          ? "rounded-md bg-[#1f7a4d] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#19663f] disabled:opacity-50"
          : "rounded-md border border-black/10 bg-white px-4 py-2 text-sm font-medium text-ink hover:border-navy/40 disabled:opacity-50"
      }
    >
      {pending ? "Working…" : children}
    </button>
  );
}

export function CampaignForm({ templates, segments, defaultSegment }: { templates: TemplateOption[]; segments: SegmentOption[]; defaultSegment?: string }) {
  const [createState, createAction] = useFormState<CampaignState, FormData>(createCampaignAction, {});
  const [testState, testAction] = useFormState<CampaignState, FormData>(sendTestAction, {});
  const [tplKey, setTplKey] = useState(templates[0]?.key ?? "");
  const [segment, setSegment] = useState(defaultSegment ?? "");
  const [size, setSize] = useState<{ reachable: number; matched: number } | null>(null);
  const [when, setWhen] = useState<"now" | "schedule">("now");
  const [fixed, setFixed] = useState<Record<string, string>>({});
  const tpl = useMemo(() => templates.find((t) => t.key === tplKey) ?? null, [templates, tplKey]);

  useEffect(() => {
    let live = true;
    setSize(null);
    audienceSizeAction(segment).then((r) => {
      if (live && !("error" in r)) setSize(r);
    });
    return () => {
      live = false;
    };
  }, [segment]);

  const preview = useMemo(() => {
    if (!tpl) return "";
    return tpl.body.replace(/\{\{(\d+)\}\}/g, (_m, n) => {
      const v = tpl.vars.find((x) => x.pos === Number(n));
      if (!v) return `{{${n}}}`;
      return tpl.fixed.includes(v.key) ? fixed[v.key] || `[${variableByKey(v.key)?.label ?? v.key}]` : v.example;
    });
  }, [tpl, fixed]);

  const cost = tpl && size ? Math.round(size.reachable * (RATE[tpl.category] ?? 0.88)) : null;

  if (!templates.length) {
    return (
      <div className="max-w-xl border-2 border-black/10 bg-white p-6 text-sm text-ink/70">
        No approved templates on the sending account yet.{" "}
        <Link href="/engage/templates/new" className="font-medium text-accent hover:underline">
          Create a template
        </Link>{" "}
        and wait for WhatsApp to approve it (usually a few minutes).
      </div>
    );
  }

  return (
    <form className="grid gap-6 xl:grid-cols-[1fr_360px]">
      <div className="space-y-5 border-2 border-black/10 bg-white p-5">
        <div>
          <label className={label}>Campaign name</label>
          <input name="name" className={box} maxLength={100} placeholder="e.g. Diwali offer, win-back October" />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={label}>Template</label>
            <select name="template" className={box} value={tplKey} onChange={(e) => setTplKey(e.target.value)}>
              {templates.map((t) => (
                <option key={t.key} value={t.key}>
                  {t.name} ({t.category === "MARKETING" ? "marketing" : "utility"}, {t.language})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={label}>Audience</label>
            <select name="segment_id" className={box} value={segment} onChange={(e) => setSegment(e.target.value)}>
              <option value="">Everyone</option>
              {segments.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <p className="mt-1 text-[12px] text-ink/55">
              {size ? (
                <>
                  <b className="text-ink">{size.reachable.toLocaleString("en-IN")}</b> customers will get it ({size.matched.toLocaleString("en-IN")} match; opted-out and invalid numbers skipped)
                </>
              ) : (
                "Counting…"
              )}{" "}
              ·{" "}
              <Link href="/engage/audiences/new" className="text-accent hover:underline">
                new audience
              </Link>
            </p>
          </div>
        </div>

        {tpl && tpl.fixed.length > 0 && (
          <div>
            <label className={label}>Same for everyone</label>
            <div className="grid gap-2 sm:grid-cols-2">
              {tpl.fixed.map((k) => (
                <div key={k}>
                  <div className="mb-0.5 text-[12.5px] text-ink/70">{variableByKey(k)?.label ?? k}</div>
                  <input name={`field_${k}`} className={box} maxLength={200} placeholder={variableByKey(k)?.example} value={fixed[k] ?? ""} onChange={(e) => setFixed({ ...fixed, [k]: e.target.value })} />
                </div>
              ))}
            </div>
          </div>
        )}
        {tpl && tpl.vars.some((v) => !tpl.fixed.includes(v.key)) && (
          <p className="-mt-2 text-[12px] text-ink/50">
            Filled in for each customer: {tpl.vars.filter((v) => !tpl.fixed.includes(v.key)).map((v) => variableByKey(v.key)?.label ?? v.key).join(", ")}.
          </p>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={label}>When</label>
            <div className="flex gap-3 text-[13.5px]">
              <label className="flex items-center gap-1.5">
                <input type="radio" name="when" value="now" checked={when === "now"} onChange={() => setWhen("now")} /> Send now
              </label>
              <label className="flex items-center gap-1.5">
                <input type="radio" name="when" value="schedule" checked={when === "schedule"} onChange={() => setWhen("schedule")} /> Schedule
              </label>
            </div>
            {when === "schedule" && <input type="datetime-local" name="scheduled_at" className={box + " mt-2"} />}
            {when === "schedule" && <p className="mt-1 text-[12px] text-ink/50">India time. Sends within a minute of the chosen time.</p>}
          </div>
          <div>
            <label className={label}>Don't disturb</label>
            <div className="flex items-center gap-2 text-[13px] text-ink/70">
              Skip customers sent another campaign in the last
              <input type="number" name="skip_recent_days" min={0} max={30} defaultValue={2} className="w-16 border border-black/10 bg-white px-2 py-1.5 text-sm" /> days
            </div>
          </div>
        </div>

        <div className="rounded-md bg-[#fbf7ef] p-3">
          <label className={label}>Send a test first</label>
          <div className="flex flex-wrap gap-2">
            <input name="test_phone" className={box + " max-w-[220px]"} placeholder="Your WhatsApp number" />
            <Submit formAction={testAction} tone="plain">
              Send test
            </Submit>
          </div>
          {testState.testResult && <p className="mt-2 text-[12.5px] text-[#2c6a4e]">{testState.testResult}</p>}
          {testState.error && <p className="mt-2 text-[12.5px] text-[#9c3326]">{testState.error}</p>}
        </div>

        {createState.error && <p className="rounded-md bg-[#f6e4df] px-3 py-2 text-[13px] text-[#9c3326]">{createState.error}</p>}
        <div className="flex flex-wrap items-center gap-3">
          <Submit
            formAction={createAction}
            confirmText={when === "now" ? `Send this campaign to ${size?.reachable ?? "the"} customers now?` : undefined}
          >
            {when === "now" ? `Send now${size ? ` to ${size.reachable.toLocaleString("en-IN")}` : ""}` : "Schedule campaign"}
          </Submit>
          <Link href="/engage/campaigns" className="text-sm text-ink/60 hover:underline">
            Cancel
          </Link>
          {cost != null && (
            <span className="text-[12.5px] text-ink/55">
              Estimated WhatsApp charge ≈ ₹{cost.toLocaleString("en-IN")} ({tpl?.category === "MARKETING" ? "marketing" : "utility"} rate, approx.)
            </span>
          )}
        </div>
      </div>

      <aside className="self-start xl:sticky xl:top-20">
        <div className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-ink/55">Preview</div>
        {tpl && (
          <div className="rounded-xl bg-[#e5ddd5] p-4">
            <div className="max-w-[300px] overflow-hidden rounded-lg bg-white text-[13.5px] shadow-sm">
              {tpl.headerFormat === "IMAGE" &&
                (tpl.headerImage ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={tpl.headerImage} alt="" className="max-h-44 w-full object-cover" />
                ) : (
                  <div className="grid h-28 place-items-center bg-black/5 text-[12px] text-ink/40">Image</div>
                ))}
              <div className="px-3 pb-1.5 pt-2">
                {tpl.headerFormat === "TEXT" && tpl.headerText && <div className="mb-1 font-bold">{tpl.headerText}</div>}
                <div className="whitespace-pre-wrap break-words">{preview}</div>
                {tpl.footer && <div className="mt-1.5 text-[12px] text-ink/45">{tpl.footer}</div>}
              </div>
              {tpl.buttons.map((b, i) => (
                <div key={i} className="border-t border-black/5 py-2 text-center text-[13.5px] font-medium text-[#1a8cd8]">
                  {b.text}
                </div>
              ))}
            </div>
          </div>
        )}
        <p className="mt-2 text-[12px] text-ink/50">Replies come into the WhatsApp Inbox. Customers who reply STOP stop getting offers.</p>
      </aside>
    </form>
  );
}
