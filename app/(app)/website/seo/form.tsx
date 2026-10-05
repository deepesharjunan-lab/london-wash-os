"use client";

import { useMemo, useState } from "react";
import { saveSeoAction } from "../actions";
import { SaveForm, box, label } from "../ui";
import { ToggleInput } from "@/lib/ui/Toggle";
import type { Seo } from "@/lib/site/defs";

// SEO editor with a live Google result, a share preview and a checklist.

export type PageFacts = {
  h1: string[];
  h2: string[];
  images: number;
  imagesWithoutAlt: number;
  words: number;
  text: string;
  hasPhone: boolean;
  hasAddress: boolean;
};

type Check = { ok: boolean | "info"; label: string; tip: string; weight: number };

function Counter({ n, min, max }: { n: number; min: number; max: number }) {
  const tone = n === 0 ? "text-ink/40" : n < min ? "text-[#8a5a12]" : n > max ? "text-[#9c3326]" : "text-[#2c6a4e]";
  return (
    <span className={"text-[11.5px] " + tone}>
      {n} characters · best {min}–{max}
    </span>
  );
}

export function SeoForm({ initial, facts }: { initial: Seo; facts: PageFacts }) {
  const [s, setS] = useState<Seo>(initial);
  const up = (k: keyof Seo) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setS({ ...s, [k]: e.target.value });
  const focus = s.keywords.split(",")[0]?.trim().toLowerCase() ?? "";
  const words = focus.split(/\s+/).filter((w) => w.length > 2);
  const has = (t: string) => !!focus && words.every((w) => t.toLowerCase().includes(w));

  const checks: Check[] = useMemo(
    () => [
      { ok: s.title.length >= 30 && s.title.length <= 60, label: "Title length", tip: "Google shows about 60 characters. Aim for 30–60.", weight: 2 },
      { ok: s.description.length >= 120 && s.description.length <= 160, label: "Description length", tip: "Google shows about 155 characters. Aim for 120–160.", weight: 2 },
      { ok: has(s.title), label: "Focus keyword in the title", tip: `Put “${focus || "your main keyword"}” in the title.`, weight: 3 },
      { ok: has(s.description), label: "Focus keyword in the description", tip: "Use the main keyword naturally in the description.", weight: 2 },
      { ok: facts.h1.some(has) || facts.h2.some(has) || has(facts.text), label: "Focus keyword on the page", tip: "Use the keyword in a heading or the page text (Website → Texts).", weight: 2 },
      { ok: /pathanamthitta|vettipuram|kerala/i.test(s.title + " " + s.description), label: "Your town in the title or description", tip: "Local searches (“laundry Pathanamthitta”) match pages that name the town.", weight: 3 },
      { ok: facts.h1.length === 1, label: "One main heading (H1)", tip: `The page has ${facts.h1.length} H1 headings; it should have exactly one.`, weight: 1 },
      { ok: facts.imagesWithoutAlt === 0, label: "Images have descriptions (alt text)", tip: `${facts.imagesWithoutAlt} of ${facts.images} images have no description.`, weight: 1 },
      { ok: facts.words >= 300, label: "Enough text on the page", tip: `About ${facts.words} words. Pages with 300+ words rank better.`, weight: 1 },
      { ok: s.indexing, label: "Google may show the website", tip: "Indexing is switched off, so Google will drop the site from results.", weight: 4 },
      { ok: s.local_business, label: "Business details for Google", tip: "Switch on business details so Google can show your address, hours and map.", weight: 3 },
      { ok: facts.hasPhone && facts.hasAddress, label: "Phone and address on the page", tip: "Add them in Website → Business details.", weight: 2 },
      { ok: /^https:\/\/www\./.test(s.canonical), label: "Main address uses https://www.", tip: "Use https://www.thelondonwash.com/ as the main address.", weight: 1 },
      { ok: /^https:\/\//.test(s.og_image), label: "Share image", tip: "Set an image for WhatsApp and Facebook link previews.", weight: 1 },
      { ok: s.google_verification.trim() ? true : "info", label: "Google Search Console connected", tip: "Add the verification code (steps below) to see searches and get indexed faster.", weight: 1 },
      { ok: s.ga_id.trim() ? true : "info", label: "Google Analytics", tip: "Optional: add a G-… ID to count visitors.", weight: 0 },
    ],
    [s, facts, focus]
  );
  const total = checks.reduce((a, c) => a + c.weight, 0);
  const got = checks.reduce((a, c) => a + (c.ok === true ? c.weight : 0), 0);
  const score = Math.round((got / total) * 100);
  const tone = score >= 85 ? "#1f7a4d" : score >= 60 ? "#c08a1e" : "#9c3326";
  const host = s.canonical.replace(/^https?:\/\//, "").replace(/\/$/, "");
  const cut = (t: string, n: number) => (t.length > n ? t.slice(0, n - 1).trimEnd() + "…" : t);

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_400px]">
      <div className="border-2 border-black/10 bg-white p-5">
        <SaveForm action={saveSeoAction} saveText="Save SEO settings">
          <div className="space-y-4">
            <div>
              <label className={label}>Page title (the blue link on Google)</label>
              <input name="title" value={s.title} onChange={up("title")} className={box} maxLength={120} />
              <Counter n={s.title.length} min={30} max={60} />
            </div>
            <div>
              <label className={label}>Description (the grey text under it)</label>
              <textarea name="description" value={s.description} onChange={up("description")} className={box} rows={3} maxLength={320} />
              <Counter n={s.description.length} min={120} max={160} />
            </div>
            <div>
              <label className={label}>Focus keywords</label>
              <input name="keywords" value={s.keywords} onChange={up("keywords")} className={box} placeholder="laundry Pathanamthitta, dry cleaning near me" />
              <p className="mt-0.5 text-[11.5px] text-ink/45">What customers type into Google, separated by commas. The first one is checked in the list on the right. (Google itself ignores a keywords tag, so this is only for the checklist.)</p>
            </div>

            <h3 className="pt-2 text-[14px] font-bold text-ink">When the link is shared (WhatsApp, Facebook)</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className={label}>Share title</label>
                <input name="og_title" value={s.og_title} onChange={up("og_title")} className={box} placeholder={s.title} />
              </div>
              <div>
                <label className={label}>Share image link</label>
                <input name="og_image" value={s.og_image} onChange={up("og_image")} className={box} />
              </div>
              <div className="sm:col-span-2">
                <label className={label}>Share description</label>
                <textarea name="og_description" value={s.og_description} onChange={up("og_description")} className={box} rows={2} placeholder={s.description} />
              </div>
            </div>

            <h3 className="pt-2 text-[14px] font-bold text-ink">Google settings</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className={label}>Main address of the site</label>
                <input name="canonical" value={s.canonical} onChange={up("canonical")} className={box} />
              </div>
              <div>
                <label className={label}>Google Analytics ID (optional)</label>
                <input name="ga_id" value={s.ga_id} onChange={up("ga_id")} className={box} placeholder="G-XXXXXXXXXX" />
              </div>
              <div>
                <label className={label}>Google verification code</label>
                <input name="google_verification" value={s.google_verification} onChange={up("google_verification")} className={box} placeholder="paste the code or the whole meta tag" />
              </div>
              <div>
                <label className={label}>Bing verification code (optional)</label>
                <input name="bing_verification" value={s.bing_verification} onChange={up("bing_verification")} className={box} />
              </div>
            </div>
            <div className="flex flex-col gap-3 pt-1">
              <ToggleInput name="indexing" defaultChecked={initial.indexing} label="Let Google show the website" hint="Switch off only if the site should disappear from search results." />
              <ToggleInput name="local_business" defaultChecked={initial.local_business} label="Business details for Google" hint="Address, phone, hours and map pin in the format Google reads (schema.org)." />
            </div>
          </div>
        </SaveForm>
      </div>

      <aside className="space-y-5 self-start xl:sticky xl:top-20">
        <div className="border-2 border-black/10 bg-white p-4">
          <div className="flex items-center gap-4">
            <div className="grid h-16 w-16 place-items-center rounded-full border-[5px] text-[20px] font-extrabold" style={{ borderColor: tone, color: tone }}>
              {score}
            </div>
            <div>
              <div className="font-bold text-ink">SEO score</div>
              <div className="text-[12.5px] text-ink/55">{score >= 85 ? "Looking good." : score >= 60 ? "Good start: a few fixes below." : "Needs work: see the fixes below."}</div>
            </div>
          </div>
          <ul className="mt-3 space-y-1.5 text-[13px]">
            {checks.map((c) => (
              <li key={c.label} className="flex gap-2">
                <span className={c.ok === true ? "text-[#1f7a4d]" : c.ok === "info" ? "text-ink/35" : "text-[#9c3326]"}>{c.ok === true ? "✓" : c.ok === "info" ? "○" : "✕"}</span>
                <span>
                  <span className="text-ink">{c.label}</span>
                  {c.ok !== true && <span className="block text-[12px] text-ink/50">{c.tip}</span>}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <div className="mb-1.5 text-[12px] font-semibold uppercase tracking-wide text-ink/55">On Google</div>
          <div className="rounded-lg border border-black/10 bg-white p-4 font-sans">
            <div className="flex items-center gap-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/site/assets/logo-square.jpg" alt="" className="h-7 w-7 rounded-full border border-black/10" />
              <div className="leading-tight">
                <div className="text-[13px] text-[#202124]">The London Wash</div>
                <div className="text-[12px] text-[#4d5156]">{host}</div>
              </div>
            </div>
            <div className="mt-1.5 text-[19px] leading-snug text-[#1a0dab]">{cut(s.title || "Page title", 62)}</div>
            <div className="mt-0.5 text-[13.5px] leading-snug text-[#4d5156]">{cut(s.description || "Description", 158)}</div>
          </div>
        </div>

        <div>
          <div className="mb-1.5 text-[12px] font-semibold uppercase tracking-wide text-ink/55">Shared on WhatsApp / Facebook</div>
          <div className="overflow-hidden rounded-lg border border-black/10 bg-[#f0f2f5]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={s.og_image} alt="" className="aspect-[1.91/1] w-full bg-black/5 object-cover" />
            <div className="px-3 py-2">
              <div className="text-[11.5px] uppercase text-[#65676b]">{host.replace(/^www\./, "")}</div>
              <div className="text-[15px] font-semibold leading-snug text-[#050505]">{cut(s.og_title || s.title, 70)}</div>
              <div className="text-[13px] leading-snug text-[#65676b]">{cut(s.og_description || s.description, 110)}</div>
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
}
