"use client";

import { useState } from "react";
import { savePageAction } from "../../actions";
import { SaveForm, box, label } from "../../ui";
import type { ServicePage } from "@/lib/site/pages-defaults";

// Editor for one service page: content, FAQ, Google title/description, live/draft.

function Count({ n, min, max }: { n: number; min: number; max: number }) {
  const tone = n === 0 ? "text-ink/40" : n < min ? "text-[#8a5a12]" : n > max ? "text-[#9c3326]" : "text-[#2c6a4e]";
  return <span className={"text-[11.5px] " + tone}>{n} characters · best {min}–{max}</span>;
}

export function PageEditor({ initial, services, site }: { initial: ServicePage; services: string[]; site: string }) {
  const [p, setP] = useState<ServicePage>(initial);
  const set = (patch: Partial<ServicePage>) => setP({ ...p, ...patch });
  const cut = (t: string, n: number) => (t.length > n ? t.slice(0, n - 1).trimEnd() + "…" : t);
  const title = p.seo_title || `${p.h1} | The London Wash`;
  const desc = p.seo_description || p.intro;

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
      <div className="border-2 border-black/10 bg-white p-5">
        <SaveForm action={savePageAction} saveText="Save page" sticky>
          <input type="hidden" name="page" value={JSON.stringify(p)} />
          <input type="hidden" name="original_slug" value={initial.slug} />

          <label className="mb-4 inline-flex cursor-pointer items-center gap-2.5 text-[14px] font-semibold text-ink">
            <input type="checkbox" checked={p.published} onChange={(e) => set({ published: e.target.checked })} className="peer sr-only" />
            <span
              aria-hidden="true"
              className={"relative inline-flex h-[22px] w-10 items-center rounded-full transition-colors " + (p.published ? "bg-[#1f7a4d]" : "bg-[#cfc6b5]")}
            >
              <span className={"absolute left-[2px] h-[18px] w-[18px] rounded-full bg-white shadow-sm transition-transform " + (p.published ? "translate-x-[18px]" : "")} />
            </span>
            {p.published ? "Live on the website" : "Draft (hidden)"}
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className={label}>Short name (for links)</label>
              <input className={box} value={p.nav_label} maxLength={40} onChange={(e) => set({ nav_label: e.target.value })} />
            </div>
            <div>
              <label className={label}>Page address</label>
              <div className="flex items-center gap-1 text-[13px] text-ink/50">
                /services/
                <input className={box} value={p.slug} maxLength={60} onChange={(e) => set({ slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-") })} />
              </div>
              <p className="mt-0.5 text-[11.5px] text-ink/45">Avoid changing it once Google has found the page.</p>
            </div>
            <div>
              <label className={label}>Price from (service)</label>
              <select className={box} value={p.service} onChange={(e) => set({ service: e.target.value })}>
                <option value="">No price</option>
                {services.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={label}>Small heading</label>
              <input className={box} value={p.eyebrow} maxLength={60} onChange={(e) => set({ eyebrow: e.target.value })} />
            </div>
            <div className="sm:col-span-2">
              <label className={label}>Main heading (H1)</label>
              <input className={box} value={p.h1} maxLength={120} onChange={(e) => set({ h1: e.target.value })} />
              <p className="mt-0.5 text-[11.5px] text-ink/45">Include the service and the town, e.g. “Dry cleaning in Pathanamthitta”.</p>
            </div>
            <div className="sm:col-span-2">
              <label className={label}>Intro</label>
              <textarea className={box} rows={3} value={p.intro} maxLength={600} onChange={(e) => set({ intro: e.target.value })} />
            </div>
          </div>

          <h3 className="mb-2 mt-6 text-[15px] font-bold text-ink">Sections</h3>
          <div className="space-y-3">
            {p.sections.map((s, i) => (
              <div key={i} className="border border-black/10 p-3">
                <div className="mb-1 flex items-center gap-2">
                  <input className={box} placeholder="Heading" value={s.heading} maxLength={120} onChange={(e) => set({ sections: p.sections.map((x, j) => (j === i ? { ...x, heading: e.target.value } : x)) })} />
                  <button type="button" onClick={() => set({ sections: p.sections.filter((_, j) => j !== i) })} className="text-[12px] text-[#9c3326]">
                    Remove
                  </button>
                </div>
                <textarea className={box} rows={4} placeholder="Text (leave an empty line between paragraphs)" value={s.body} maxLength={3000} onChange={(e) => set({ sections: p.sections.map((x, j) => (j === i ? { ...x, body: e.target.value } : x)) })} />
              </div>
            ))}
          </div>
          <button type="button" onClick={() => set({ sections: [...p.sections, { heading: "", body: "" }] })} className="mt-2 rounded-md border border-dashed border-black/20 px-3 py-1.5 text-[13px] text-ink/70">
            + Add section
          </button>

          <h3 className="mb-2 mt-6 text-[15px] font-bold text-ink">Questions & answers</h3>
          <p className="mb-2 text-[12px] text-ink/50">Google can show these right in the search results.</p>
          <div className="space-y-3">
            {p.faq.map((f, i) => (
              <div key={i} className="border border-black/10 p-3">
                <div className="mb-1 flex items-center gap-2">
                  <input className={box} placeholder="Question" value={f.q} maxLength={200} onChange={(e) => set({ faq: p.faq.map((x, j) => (j === i ? { ...x, q: e.target.value } : x)) })} />
                  <button type="button" onClick={() => set({ faq: p.faq.filter((_, j) => j !== i) })} className="text-[12px] text-[#9c3326]">
                    Remove
                  </button>
                </div>
                <textarea className={box} rows={2} placeholder="Answer" value={f.a} maxLength={1000} onChange={(e) => set({ faq: p.faq.map((x, j) => (j === i ? { ...x, a: e.target.value } : x)) })} />
              </div>
            ))}
          </div>
          <button type="button" onClick={() => set({ faq: [...p.faq, { q: "", a: "" }] })} className="mt-2 rounded-md border border-dashed border-black/20 px-3 py-1.5 text-[13px] text-ink/70">
            + Add question
          </button>

          <h3 className="mb-2 mt-6 text-[15px] font-bold text-ink">On Google</h3>
          <div className="space-y-3">
            <div>
              <label className={label}>Google title</label>
              <input className={box} value={p.seo_title} maxLength={120} onChange={(e) => set({ seo_title: e.target.value })} />
              <Count n={p.seo_title.length} min={30} max={60} />
            </div>
            <div>
              <label className={label}>Google description</label>
              <textarea className={box} rows={3} value={p.seo_description} maxLength={320} onChange={(e) => set({ seo_description: e.target.value })} />
              <Count n={p.seo_description.length} min={120} max={160} />
            </div>
          </div>
        </SaveForm>
      </div>

      <aside className="self-start xl:sticky xl:top-20">
        <div className="mb-1.5 text-[12px] font-semibold uppercase tracking-wide text-ink/55">On Google</div>
        <div className="rounded-lg border border-black/10 bg-white p-4">
          <div className="text-[13px] text-[#202124]">The London Wash</div>
          <div className="text-[12px] text-[#4d5156]">
            {site.replace(/^https?:\/\//, "")} › services › {p.slug}
          </div>
          <div className="mt-1.5 text-[19px] leading-snug text-[#1a0dab]">{cut(title, 62)}</div>
          <div className="mt-0.5 text-[13.5px] leading-snug text-[#4d5156]">{cut(desc, 158)}</div>
          {p.faq.slice(0, 2).map((f, i) => (
            <div key={i} className="mt-2 border-t border-black/5 pt-1.5 text-[13px] text-[#202124]">
              {f.q} <span className="text-ink/40">⌄</span>
            </div>
          ))}
        </div>
        <p className="mt-2 text-[12px] text-ink/50">Tips: one service per page, the town in the heading and title, and real answers to questions customers ask you.</p>
      </aside>
    </div>
  );
}
