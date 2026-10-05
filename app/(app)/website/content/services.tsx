"use client";

import { useState } from "react";
import { saveServicesAction } from "../actions";
import { SaveForm, box } from "../ui";
import { SERVICE_UNITS, type ServiceItem } from "@/lib/site/defs";

// Services & prices grid on the website: edit, reorder, hide, add, remove.

export function ServicesEditor({ initial, icons, iconSvgs }: { initial: ServiceItem[]; icons: string[]; iconSvgs: Record<string, string> }) {
  const [list, setList] = useState<ServiceItem[]>(initial);
  const set = (i: number, patch: Partial<ServiceItem>) => setList(list.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const move = (i: number, d: number) => {
    const j = i + d;
    if (j < 0 || j >= list.length) return;
    const next = [...list];
    [next[i], next[j]] = [next[j], next[i]];
    setList(next);
  };
  return (
    <SaveForm action={saveServicesAction} saveText="Save services & prices">
      <input type="hidden" name="services" value={JSON.stringify(list)} />
      <p className="mb-3 text-[12.5px] text-ink/55">A price of 0 shows “Ask us, priced per garment”. Hidden services stay in the list but are not shown on the website.</p>
      <div className="space-y-2">
        {list.map((s, i) => (
          <div key={i} className={"grid gap-2 border border-black/10 p-3 sm:grid-cols-[44px_1.2fr_2fr_90px_96px_auto] " + (s.hidden ? "bg-black/[0.03] opacity-60" : "bg-white")}>
            <div className="flex items-center gap-1">
              <span className="grid h-9 w-9 place-items-center rounded-full bg-beige text-navy [&>svg]:h-5 [&>svg]:w-5" dangerouslySetInnerHTML={{ __html: iconSvgs[s.icon] ?? "" }} />
            </div>
            <div className="space-y-1">
              <input className={box} value={s.title} maxLength={60} placeholder="Service name" onChange={(e) => set(i, { title: e.target.value })} />
              <select className={box + " py-1 text-[12.5px]"} value={s.icon} onChange={(e) => set(i, { icon: e.target.value })} aria-label="Icon">
                {icons.map((k) => (
                  <option key={k} value={k}>
                    icon: {k}
                  </option>
                ))}
              </select>
            </div>
            <textarea className={box} rows={2} value={s.text} maxLength={200} placeholder="Short description" onChange={(e) => set(i, { text: e.target.value })} />
            <div>
              <div className="text-[11px] text-ink/50">From ₹</div>
              <input className={box} type="number" min={0} value={s.price} onChange={(e) => set(i, { price: Number(e.target.value) })} />
            </div>
            <div>
              <div className="text-[11px] text-ink/50">per</div>
              <select className={box} value={s.unit} onChange={(e) => set(i, { unit: e.target.value })}>
                {SERVICE_UNITS.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-wrap items-center gap-1 text-[12px]">
              <button type="button" onClick={() => move(i, -1)} className="rounded border border-black/10 px-2 py-1" aria-label="Move up">
                ↑
              </button>
              <button type="button" onClick={() => move(i, 1)} className="rounded border border-black/10 px-2 py-1" aria-label="Move down">
                ↓
              </button>
              <button type="button" onClick={() => set(i, { hidden: !s.hidden })} className="rounded border border-black/10 px-2 py-1">
                {s.hidden ? "Show" : "Hide"}
              </button>
              <button type="button" onClick={() => setList(list.filter((_, j) => j !== i))} className="rounded border border-black/10 px-2 py-1 text-[#9c3326]">
                Remove
              </button>
            </div>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={() => setList([...list, { title: "", text: "", price: 0, unit: "piece", icon: "sparkle" }])}
        className="mt-3 rounded-md border border-dashed border-black/20 px-4 py-2 text-[13px] text-ink/70 hover:border-navy/40"
      >
        + Add a service
      </button>
    </SaveForm>
  );
}
