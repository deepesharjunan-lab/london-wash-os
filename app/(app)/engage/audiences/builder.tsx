"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { previewSegmentAction, saveSegmentAction, type PreviewResult, type SaveState } from "./actions";
import { CHANNELS, FILTER_TYPES, MONTHS, defaultFilter, describeFilter, type Filter, type FilterType } from "@/lib/engage/segments";
import type { FilterOptions } from "@/lib/engage/segments-server";

const box = "border border-black/10 bg-white px-2 py-1.5 text-sm outline-none focus:border-accent";
const numIn = box + " w-28";

function Chips({ options, value, onChange }: { options: { id: string; name: string }[]; value: string[]; onChange: (v: string[]) => void }) {
  if (!options.length) return <span className="text-[12.5px] text-ink/45">Nothing to choose from yet.</span>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const on = value.includes(o.id);
        return (
          <button
            key={o.id}
            type="button"
            onClick={() => onChange(on ? value.filter((x) => x !== o.id) : [...value, o.id])}
            className={`rounded-full border px-2.5 py-1 text-[12.5px] ${on ? "border-navy bg-navy text-white" : "border-black/10 bg-white text-ink/75 hover:border-navy/40"}`}
          >
            {o.name}
          </button>
        );
      })}
    </div>
  );
}

function TextValues({ value, onChange, suggestions, placeholder }: { value: string[]; onChange: (v: string[]) => void; suggestions: string[]; placeholder: string }) {
  const [draft, setDraft] = useState("");
  const listId = useRef(`dl-${Math.random().toString(36).slice(2)}`).current;
  const add = () => {
    const v = draft.trim();
    if (v && !value.some((x) => x.toLowerCase() === v.toLowerCase())) onChange([...value, v]);
    setDraft("");
  };
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {value.map((v) => (
        <span key={v} className="inline-flex items-center gap-1 rounded-full bg-navy px-2.5 py-1 text-[12.5px] text-white">
          {v}
          <button type="button" onClick={() => onChange(value.filter((x) => x !== v))} aria-label={`Remove ${v}`}>
            ×
          </button>
        </span>
      ))}
      <input
        list={listId}
        value={draft}
        placeholder={placeholder}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            add();
          }
        }}
        onBlur={add}
        className={box + " w-44"}
      />
      <datalist id={listId}>
        {suggestions.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
    </div>
  );
}

function Range({ min, max, onChange, prefix }: { min?: number; max?: number; onChange: (min?: number, max?: number) => void; prefix?: string }) {
  const parse = (s: string) => (s === "" ? undefined : Number(s));
  return (
    <div className="flex flex-wrap items-center gap-2 text-[13px] text-ink/70">
      from {prefix}
      <input type="number" min={0} className={numIn} value={min ?? ""} onChange={(e) => onChange(parse(e.target.value), max)} placeholder="any" />
      to {prefix}
      <input type="number" min={0} className={numIn} value={max ?? ""} onChange={(e) => onChange(min, parse(e.target.value))} placeholder="any" />
    </div>
  );
}

function FilterEditor({ f, set, options }: { f: Filter; set: (f: Filter) => void; options: FilterOptions }) {
  switch (f.type) {
    case "last_order":
      return (
        <div className="flex flex-wrap items-center gap-2 text-[13px]">
          <select className={box} value={f.op} onChange={(e) => set({ ...f, op: e.target.value as typeof f.op })}>
            <option value="not_within">No order in the last</option>
            <option value="within">Ordered in the last</option>
            <option value="never">Has never ordered</option>
          </select>
          {f.op !== "never" && (
            <>
              <input type="number" min={1} className={numIn} value={f.days ?? ""} onChange={(e) => set({ ...f, days: Number(e.target.value) })} /> days
            </>
          )}
        </div>
      );
    case "order_count":
    case "points":
    case "rating":
      return <Range min={f.min} max={f.max} onChange={(min, max) => set({ ...f, min, max })} />;
    case "total_spent":
    case "avg_order":
      return <Range min={f.min} max={f.max} prefix="₹" onChange={(min, max) => set({ ...f, min, max })} />;
    case "services":
      return (
        <div className="space-y-2">
          <select className={box} value={f.op} onChange={(e) => set({ ...f, op: e.target.value as "any" | "none" })}>
            <option value="any">Has used any of</option>
            <option value="none">Has never used</option>
          </select>
          <Chips options={options.services} value={f.ids} onChange={(ids) => set({ ...f, ids })} />
        </div>
      );
    case "customer_since":
      return (
        <div className="flex flex-wrap items-center gap-2 text-[13px]">
          <select className={box} value={f.op} onChange={(e) => set({ ...f, op: e.target.value as "within" | "before" })}>
            <option value="within">Joined in the last</option>
            <option value="before">Customer for more than</option>
          </select>
          <input type="number" min={1} className={numIn} value={f.days} onChange={(e) => set({ ...f, days: Number(e.target.value) })} /> days
        </div>
      );
    case "birthday":
      return (
        <div className="flex flex-wrap items-center gap-2 text-[13px]">
          <select className={box} value={f.op} onChange={(e) => set({ ...f, op: e.target.value as "month" | "next_days", month: f.month ?? new Date().getMonth() + 1, days: f.days ?? 7 })}>
            <option value="next_days">In the next</option>
            <option value="month">In the month of</option>
          </select>
          {f.op === "month" ? (
            <select className={box} value={f.month ?? 1} onChange={(e) => set({ ...f, month: Number(e.target.value) })}>
              {MONTHS.map((m, i) => (
                <option key={m} value={i + 1}>
                  {m}
                </option>
              ))}
            </select>
          ) : (
            <>
              <input type="number" min={0} max={366} className={numIn} value={f.days ?? 7} onChange={(e) => set({ ...f, days: Number(e.target.value) })} /> days
            </>
          )}
          <span className="text-[12px] text-ink/45">Only customers who saved a birthday.</span>
        </div>
      );
    case "tier":
      return <Chips options={options.tiers} value={f.ids} onChange={(ids) => set({ ...f, ids })} />;
    case "branch":
      return <Chips options={options.branches} value={f.ids} onChange={(ids) => set({ ...f, ids })} />;
    case "location":
      return (
        <div className="space-y-2">
          <select className={box} value={f.field} onChange={(e) => set({ ...f, field: e.target.value as "city" | "pincode", values: [] })}>
            <option value="city">City</option>
            <option value="pincode">PIN code</option>
          </select>
          <TextValues
            value={f.values}
            onChange={(values) => set({ ...f, values })}
            suggestions={f.field === "city" ? options.cities : options.pincodes}
            placeholder={f.field === "city" ? "Type a city, Enter" : "Type a PIN code, Enter"}
          />
        </div>
      );
    case "account":
      return (
        <select className={box} value={f.op} onChange={(e) => set({ ...f, op: e.target.value as typeof f.op })}>
          <option value="individual">Individual customers</option>
          <option value="corporate">Corporate account customers</option>
          <option value="family">Part of a family account</option>
        </select>
      );
    case "tags":
      return (
        <div className="space-y-2">
          <select className={box} value={f.op} onChange={(e) => set({ ...f, op: e.target.value as "any" | "none" })}>
            <option value="any">Has any of these tags</option>
            <option value="none">Has none of these tags</option>
          </select>
          <TextValues value={f.values} onChange={(values) => set({ ...f, values })} suggestions={options.tags} placeholder="Type a tag, Enter" />
        </div>
      );
    case "channel":
      return <Chips options={Object.entries(CHANNELS).map(([id, name]) => ({ id, name }))} value={f.values} onChange={(values) => set({ ...f, values })} />;
    case "whatsapp":
      return (
        <select className={box} value={f.op} onChange={(e) => set({ ...f, op: e.target.value as "chatted" | "never" })}>
          <option value="chatted">Has chatted with us</option>
          <option value="never">Has never chatted</option>
        </select>
      );
  }
}

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="rounded-md bg-[#1f7a4d] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#19663f] disabled:opacity-50">
      {pending ? "Saving…" : "Save audience"}
    </button>
  );
}

export function AudienceBuilder({
  initial,
  options,
}: {
  initial?: { id: string; name: string; description: string | null; match: "all" | "any"; filters: Filter[] };
  options: FilterOptions;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [match, setMatch] = useState<"all" | "any">(initial?.match ?? "all");
  const [filters, setFilters] = useState<Filter[]>(initial?.filters ?? []);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [counting, setCounting] = useState(false);
  const [saveState, saveAction] = useFormState<SaveState, FormData>(saveSegmentAction, {});
  const ticket = useRef(0);

  // Live count, a moment after the last change.
  useEffect(() => {
    const t = setTimeout(async () => {
      const mine = ++ticket.current;
      setCounting(true);
      const r = await previewSegmentAction(filters, match);
      if (mine === ticket.current) {
        setPreview(r);
        setCounting(false);
      }
    }, 450);
    return () => clearTimeout(t);
  }, [filters, match]);

  const names = {
    services: Object.fromEntries(options.services.map((s) => [s.id, s.name])),
    tiers: Object.fromEntries(options.tiers.map((s) => [s.id, s.name])),
    branches: Object.fromEntries(options.branches.map((s) => [s.id, s.name])),
  };
  const groups = [...new Set(FILTER_TYPES.map((t) => t.group))];

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_400px]">
      <div className="space-y-5">
        <div className="border-2 border-black/10 bg-white p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-[15px] font-bold text-ink">Who should be in this audience?</h2>
            {filters.length > 1 && (
              <div className="flex items-center gap-2 text-[13px] text-ink/70">
                Customers matching
                <select className={box} value={match} onChange={(e) => setMatch(e.target.value as "all" | "any")}>
                  <option value="all">all of these</option>
                  <option value="any">any of these</option>
                </select>
              </div>
            )}
          </div>

          {!filters.length && <p className="mb-3 text-[13px] text-ink/55">No filters yet: this audience is every customer. Add filters to narrow it down.</p>}
          <div className="space-y-3">
            {filters.map((f, i) => (
              <div key={i} className="rounded-md border border-black/10 bg-[#fbf7ef] p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="text-[12px] font-semibold uppercase tracking-wide text-ink/55">
                    {i > 0 && <span className="mr-1 text-accent">{match === "all" ? "AND" : "OR"}</span>}
                    {FILTER_TYPES.find((t) => t.type === f.type)?.label}
                  </span>
                  <button type="button" onClick={() => setFilters(filters.filter((_, j) => j !== i))} className="text-[18px] leading-none text-ink/40 hover:text-ink" aria-label="Remove filter">
                    ×
                  </button>
                </div>
                <FilterEditor f={f} set={(nf) => setFilters(filters.map((x, j) => (j === i ? nf : x)))} options={options} />
                <p className="mt-2 text-[12px] text-ink/50">{describeFilter(f, names)}</p>
              </div>
            ))}
          </div>

          <div className="mt-3">
            <select
              className={box}
              value=""
              onChange={(e) => {
                if (e.target.value) setFilters([...filters, defaultFilter(e.target.value as FilterType)]);
              }}
            >
              <option value="">+ Add a filter…</option>
              {groups.map((g) => (
                <optgroup key={g} label={g}>
                  {FILTER_TYPES.filter((t) => t.group === g).map((t) => (
                    <option key={t.type} value={t.type}>
                      {t.label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
        </div>

        <form action={saveAction} className="space-y-3 border-2 border-black/10 bg-white p-5">
          <input type="hidden" name="id" value={initial?.id ?? ""} />
          <input type="hidden" name="match" value={match} />
          <input type="hidden" name="filters" value={JSON.stringify(filters)} />
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-[12px] font-semibold uppercase tracking-wide text-ink/55">Audience name</label>
              <input name="name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="e.g. Haven't ordered in 60 days" className={box + " w-full"} />
            </div>
            <div>
              <label className="mb-1 block text-[12px] font-semibold uppercase tracking-wide text-ink/55">Note (optional)</label>
              <input name="description" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={300} placeholder="What this audience is for" className={box + " w-full"} />
            </div>
          </div>
          {saveState.error && <p className="rounded-md bg-[#f6e4df] px-3 py-2 text-[13px] text-[#9c3326]">{saveState.error}</p>}
          <div className="flex items-center gap-3">
            <SaveButton />
            <Link href="/engage/audiences" className="text-sm text-ink/60 hover:underline">
              Cancel
            </Link>
          </div>
          <p className="text-[12px] text-ink/45">Saved audiences update by themselves: a customer who starts or stops matching moves in or out automatically.</p>
        </form>
      </div>

      <aside className="self-start border-2 border-black/10 bg-white p-5 xl:sticky xl:top-20">
        <div className="mb-1 text-[12px] font-semibold uppercase tracking-wide text-ink/55">Live count {counting && <span className="ml-1 normal-case text-ink/40">· counting…</span>}</div>
        {preview?.error ? (
          <p className="text-[13px] text-[#9c3326]">{preview.error}</p>
        ) : preview ? (
          <>
            <div className="text-[34px] font-extrabold leading-tight text-ink">{preview.reachable?.toLocaleString("en-IN")}</div>
            <div className="mb-3 text-[13px] text-ink/65">customers can be messaged on WhatsApp</div>
            <ul className="mb-4 space-y-0.5 text-[12.5px] text-ink/60">
              <li>
                {preview.matched?.toLocaleString("en-IN")} match the filters (of {preview.total?.toLocaleString("en-IN")} customers)
              </li>
              {!!preview.optedOut && <li>{preview.optedOut} opted out of offers (skipped)</li>}
              {!!preview.noPhone && <li>{preview.noPhone} without a valid mobile number (skipped)</li>}
            </ul>
            {!!preview.sample?.length && (
              <>
                <div className="mb-1 text-[12px] font-semibold uppercase tracking-wide text-ink/55">Top customers in this audience</div>
                <ul className="divide-y divide-black/5 text-[12.5px]">
                  {preview.sample.map((s) => (
                    <li key={s.id} className="flex items-baseline justify-between gap-2 py-1.5">
                      <Link href={`/customers/${s.id}`} className="min-w-0 truncate text-ink hover:underline">
                        {s.name}
                      </Link>
                      <span className="shrink-0 text-ink/50">
                        {s.orders} orders · ₹{s.spent.toLocaleString("en-IN")}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </>
        ) : (
          <p className="text-[13px] text-ink/45">Counting…</p>
        )}
      </aside>
    </div>
  );
}
