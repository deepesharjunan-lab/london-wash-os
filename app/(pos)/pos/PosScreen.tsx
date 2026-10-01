"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { createCustomerQuick, createOrder, getCheckoutLoyalty } from "@/app/(app)/orders/new/actions";
import { searchCustomers, type CustomerHit } from "./actions";

/* ------------------------------------------------------------------ */
/* Types                                                                */
/* ------------------------------------------------------------------ */

export type PosEntry = {
  id: string; // price_list_entry id
  list: string;
  service_id: string;
  item_id: string | null;
  name: string | null; // product name; null = one price for the whole service (e.g. per kg)
  sub: string | null;
  priority: number;
  pieces: number;
  unit: string;
  price_minor: number;
};
export type PosService = { id: string; name: string; uses_sub_categories: boolean };
type Customer = { id: string; full_name: string; phone: string | null };
type Loyalty = {
  available: number;
  pointValueMinor: number;
  minRedeem: number;
  maxRedeemPct: number;
  denominations: number[];
  vouchers: { code: string; label: string; valueMinor: number; minOrderMinor: number }[];
};
type Line = { qty: number; tags: string[]; text: string };

const UNIT: Record<string, string> = { per_piece: "pc", per_kg: "kg", per_set: "set" };
const NOTE_TAGS = ["Stain", "Torn", "Button missing", "Colour fade", "Delicate", "Express"];
const PAY = [
  { v: "", l: "Pay later" },
  { v: "cash", l: "Cash" },
  { v: "upi", l: "UPI" },
  { v: "card", l: "Card" },
];
const TINTS = [
  ["#e8eef8", "#2b5584"],
  ["#f3ece0", "#8a5a12"],
  ["#e6f1ec", "#2c6a4e"],
  ["#f4e6ea", "#8c2f4a"],
  ["#ece9f6", "#4b3f8f"],
  ["#e7f2f4", "#1f6670"],
  ["#f6ede4", "#9a4d1c"],
];

const rupees = (minor: number) => `₹${(minor / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const tint = (key: string) => {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return TINTS[h % TINTS.length];
};
const monogram = (name: string) =>
  name
    .replace(/[^A-Za-z0-9 ]/g, " ")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase() || "LW";

function Icon({ d, className = "h-[18px] w-[18px]" }: { d: string; className?: string }) {
  return <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" dangerouslySetInnerHTML={{ __html: d }} />;
}
const I = {
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/>',
  user: '<circle cx="12" cy="8.5" r="3.5"/><path d="M5 20c1-3.5 3.8-5 7-5s6 1.5 7 5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  note: '<path d="M5 4h10l4 4v12H5z"/><path d="M14 4v5h5M8 13h8M8 16.5h5"/>',
  trash: '<path d="M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13"/>',
  star: '<path d="M12 3.5c.6 3.8 2.7 5.9 6.5 6.5-3.8.6-5.9 2.7-6.5 6.5-.6-3.8-2.7-5.9-6.5-6.5 3.8-.6 5.9-2.7 6.5-6.5z"/>',
};

/* ------------------------------------------------------------------ */
/* Screen                                                               */
/* ------------------------------------------------------------------ */

export function PosScreen({
  priceLists,
  entries,
  services,
  subCategories,
  initialCustomer,
}: {
  priceLists: { id: string; name: string; is_default: boolean }[];
  entries: PosEntry[];
  services: PosService[];
  subCategories: { id: string; name: string }[];
  initialCustomer: Customer | null;
}) {
  const [listId, setListId] = useState(priceLists.find((p) => p.is_default)?.id ?? priceLists[0]?.id ?? "");
  const [serviceId, setServiceId] = useState("");
  const [subId, setSubId] = useState("");
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<Record<string, Line>>({});
  const [noteOpen, setNoteOpen] = useState<string | null>(null);
  const [customer, setCustomer] = useState<Customer | null>(initialCustomer);
  const [channel, setChannel] = useState("pos_counter");
  const [payMethod, setPayMethod] = useState("");
  const [payAmount, setPayAmount] = useState("");
  const [payTouched, setPayTouched] = useState(false);
  const [redeemPoints, setRedeemPoints] = useState(0);
  const [voucherCode, setVoucherCode] = useState("");
  const [loyalty, setLoyalty] = useState<Loyalty | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const serviceById = useMemo(() => new Map(services.map((s) => [s.id, s] as [string, PosService])), [services]);
  const subName = useMemo(() => new Map(subCategories.map((s) => [s.id, s.name] as [string, string])), [subCategories]);
  const listEntries = useMemo(() => entries.filter((e) => e.list === listId), [entries, listId]);
  const entryById = useMemo(() => new Map(listEntries.map((e) => [e.id, e] as [string, PosEntry])), [listEntries]);
  const labelOf = (e: PosEntry) => e.name ?? `${serviceById.get(e.service_id)?.name ?? "Service"} (any item)`;

  const serviceCounts = useMemo(() => {
    const m = new Map<string, number>();
    listEntries.forEach((e) => m.set(e.service_id, (m.get(e.service_id) ?? 0) + 1));
    return m;
  }, [listEntries]);
  const shownServices = services.filter((s) => serviceCounts.get(s.id));
  const current = serviceId ? serviceById.get(serviceId) ?? null : null;

  const subTabs = useMemo(() => {
    if (!current?.uses_sub_categories) return [];
    const counts = new Map<string, number>();
    listEntries.filter((e) => e.service_id === current.id && e.sub).forEach((e) => counts.set(e.sub!, (counts.get(e.sub!) ?? 0) + 1));
    return subCategories.filter((s) => counts.get(s.id)).map((s) => ({ ...s, count: counts.get(s.id)! }));
  }, [current, listEntries, subCategories]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return listEntries
      .filter((e) => !serviceId || e.service_id === serviceId)
      .filter((e) => !subId || e.sub === subId)
      .filter((e) => !q || labelOf(e).toLowerCase().includes(q) || (serviceById.get(e.service_id)?.name ?? "").toLowerCase().includes(q))
      .sort((a, b) => (a.name === null ? -1 : 0) - (b.name === null ? -1 : 0) || a.priority - b.priority || labelOf(a).localeCompare(labelOf(b)));
    // eslint-disable-next-line
  }, [listEntries, serviceId, subId, search, serviceById]);

  /* ---------------- cart ---------------- */
  const lines = Object.entries(cart)
    .map(([id, l]) => ({ id, l, e: entryById.get(id) }))
    .filter((x): x is { id: string; l: Line; e: PosEntry } => !!x.e && x.l.qty > 0);
  const subtotal = lines.reduce((a, x) => a + x.e.price_minor * x.l.qty, 0);
  const tagCount = lines.reduce((a, x) => a + x.l.qty * (x.e.unit === "per_kg" ? 1 : x.e.pieces), 0);
  const qtyOf = (id: string) => cart[id]?.qty ?? 0;
  const setQty = (id: string, qty: number) =>
    setCart((c) => {
      const next = { ...c };
      if (qty <= 0) delete next[id];
      else next[id] = { ...(c[id] ?? { tags: [], text: "" }), qty: Math.min(999, qty) };
      return next;
    });

  /* ---------------- loyalty ---------------- */
  useEffect(() => {
    let cancelled = false;
    setLoyalty(null);
    setRedeemPoints(0);
    setVoucherCode("");
    if (!customer) return;
    getCheckoutLoyalty(customer.id)
      .then((l) => !cancelled && setLoyalty(l as Loyalty | null))
      .catch(() => !cancelled && setLoyalty(null));
    return () => {
      cancelled = true;
    };
  }, [customer]);
  const voucher = loyalty?.vouchers.find((v) => v.code === voucherCode) ?? null;
  const voucherMinor = voucher && subtotal >= voucher.minOrderMinor ? Math.min(voucher.valueMinor, subtotal) : 0;
  const pointOptions = loyalty
    ? loyalty.denominations.filter(
        (d) =>
          loyalty.available >= loyalty.minRedeem &&
          d <= loyalty.available &&
          Math.round(d * loyalty.pointValueMinor) <= Math.floor((subtotal * loyalty.maxRedeemPct) / 100) &&
          Math.round(d * loyalty.pointValueMinor) <= subtotal - voucherMinor
      )
    : [];
  useEffect(() => {
    if (redeemPoints && !pointOptions.includes(redeemPoints)) setRedeemPoints(0);
    if (voucher && subtotal < voucher.minOrderMinor) setVoucherCode("");
  }, [subtotal, redeemPoints, pointOptions, voucher]);
  const pointsMinor = loyalty ? Math.round(redeemPoints * loyalty.pointValueMinor) : 0;
  const total = Math.max(0, subtotal - voucherMinor - pointsMinor);
  const payNowMinor = payMethod ? Math.min(total, Math.round((Number(payTouched ? payAmount : total / 100) || 0) * 100)) : 0;
  const due = total - payNowMinor;

  function changeList(id: string) {
    if (lines.length && !confirm("Changing the price list clears the items in this order. Continue?")) return;
    setCart({});
    setListId(id);
    setServiceId("");
    setSubId("");
  }

  function clearOrder() {
    setCart({});
    setCustomer(null);
    setPayMethod("");
    setPayTouched(false);
    setPayAmount("");
    setError(null);
  }

  function submit() {
    setError(null);
    if (!customer) return setError("Choose or add a customer first.");
    if (!lines.length) return setError("Add at least one item.");
    startTransition(async () => {
      const res = await createOrder({
        customer_id: customer.id,
        price_list_profile_id: listId,
        channel,
        lines: lines.map(({ e, l }) => ({
          price_list_entry_id: e.id,
          service_id: e.service_id,
          item_id: e.item_id,
          unit: e.unit,
          unit_price_minor: e.price_minor,
          quantity: l.qty,
          notes: [...l.tags, l.text.trim()].filter(Boolean).join("; ") || null,
        })),
        redeem_points: redeemPoints || undefined,
        voucher_code: voucherCode || undefined,
        payment: payMethod && payNowMinor > 0 ? { method: payMethod, amount_minor: payNowMinor } : null,
        return_to: "pos",
      });
      // On success the server sends us to the confirmation screen; we only get here on an error.
      if (res && "error" in res && res.error) setError(res.error);
    });
  }

  const searchRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    searchRef.current?.focus();
  }, [serviceId, subId]);

  return (
    <div className="grid h-full min-h-0 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_410px]">
      {/* ---------------- Products ---------------- */}
      <section className="flex min-h-0 flex-col">
        <div className="flex flex-wrap items-center gap-3 px-5 pb-3 pt-4">
          <h1 className="text-[19px] font-semibold text-ink">Services</h1>
          <label className="relative ml-auto flex min-w-[220px] flex-1 items-center sm:max-w-[340px]">
            <Icon d={I.search} className="pointer-events-none absolute left-3 h-4 w-4 text-ink-3" />
            <input
              ref={searchRef}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search products"
              aria-label="Search products"
              className="h-10 w-full rounded-xl border border-hair bg-white pl-9 pr-3 text-[14px] outline-none focus:border-brass focus:ring-2 focus:ring-brass/25"
            />
          </label>
          {priceLists.length > 1 && (
            <select value={listId} onChange={(e) => changeList(e.target.value)} aria-label="Price list" className="h-10 rounded-xl border border-hair bg-white px-3 text-[13.5px] font-semibold">
              {priceLists.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Service cards */}
        <div className="flex gap-2.5 overflow-x-auto px-5 pb-3" role="tablist" aria-label="Service">
          {[{ id: "", name: "All services", uses_sub_categories: false }, ...shownServices].map((s) => {
            const active = serviceId === s.id;
            const count = s.id ? serviceCounts.get(s.id) ?? 0 : listEntries.length;
            const [bg, fg] = tint(s.id || "all");
            return (
              <button
                key={s.id || "all"}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => {
                  setServiceId(s.id);
                  setSubId("");
                }}
                className={
                  "flex min-w-[150px] shrink-0 items-center justify-between gap-3 rounded-xl border px-3.5 py-2.5 text-left transition " +
                  (active ? "border-navy bg-navy text-white shadow-[0_6px_16px_-8px_rgba(21,33,58,.6)]" : "border-hair bg-white hover:border-hair-2")
                }
              >
                <span className="min-w-0">
                  <b className="block truncate text-[13.5px]">{s.name}</b>
                  <span className={"text-[11.5px] " + (active ? "text-white/60" : "text-ink-3")}>{count} items</span>
                </span>
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-[11px] font-bold" style={{ background: active ? "rgba(255,255,255,.14)" : bg, color: active ? "#e3d2ac" : fg }}>
                  {s.id ? monogram(s.name) : "∗"}
                </span>
              </button>
            );
          })}
        </div>

        {/* Sub categories */}
        {subTabs.length > 0 && (
          <div className="flex flex-wrap gap-1.5 px-5 pb-3" role="tablist" aria-label="Sub category">
            {[{ id: "", name: "All", count: listEntries.filter((e) => e.service_id === serviceId).length }, ...subTabs].map((s) => (
              <button
                key={s.id || "all"}
                type="button"
                role="tab"
                aria-selected={subId === s.id}
                onClick={() => setSubId(s.id)}
                className={
                  "rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition " +
                  (subId === s.id ? "bg-[#c7b58f] text-[#15213a]" : "border border-hair bg-white text-ink-2 hover:bg-beige")
                }
              >
                {s.name} <span className="opacity-60">{s.count}</span>
              </button>
            ))}
          </div>
        )}

        {/* Product grid */}
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-6">
          {visible.length === 0 ? (
            <div className="grid h-40 place-items-center rounded-2xl border border-dashed border-hair-2 text-[14px] text-ink-3">No products match.</div>
          ) : (
            <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(168px, 1fr))" }}>
              {visible.map((e) => {
                const qty = qtyOf(e.id);
                const label = labelOf(e);
                const [bg, fg] = tint(e.service_id);
                return (
                  <article
                    key={e.id}
                    className={"flex flex-col overflow-hidden rounded-2xl border bg-white transition " + (qty ? "border-navy shadow-[0_8px_20px_-12px_rgba(21,33,58,.55)]" : "border-hair hover:border-hair-2")}
                  >
                    <button type="button" onClick={() => setQty(e.id, qty + 1)} className="flex flex-1 flex-col text-left" aria-label={`Add ${label}`}>
                      <span className="relative grid h-[74px] place-items-center" style={{ background: bg, color: fg }}>
                        <span className="font-display text-[26px] font-medium tracking-tight">{monogram(label)}</span>
                        {e.pieces > 1 && e.unit !== "per_kg" && (
                          <span className="absolute right-2 top-2 rounded-full bg-white/80 px-2 py-0.5 text-[10.5px] font-bold text-ink">{e.pieces} pcs</span>
                        )}
                        {qty > 0 && <span className="absolute left-2 top-2 grid h-6 min-w-[24px] place-items-center rounded-full bg-navy px-1.5 text-[11.5px] font-bold text-white">{qty}</span>}
                      </span>
                      <span className="flex flex-1 flex-col gap-0.5 px-3 pb-1 pt-2.5">
                        <b className="line-clamp-2 text-[13.5px] font-semibold leading-snug text-ink">{label}</b>
                        <span className="truncate text-[11.5px] text-ink-3">
                          {[!serviceId ? serviceById.get(e.service_id)?.name : null, e.sub ? subName.get(e.sub) : null].filter(Boolean).join(" · ") || " "}
                        </span>
                      </span>
                    </button>
                    <div className="flex items-center justify-between gap-2 px-3 pb-3 pt-1">
                      <span className="text-[14.5px] font-bold text-ink">
                        {rupees(e.price_minor)}
                        <span className="text-[11px] font-semibold text-ink-3"> /{UNIT[e.unit] ?? e.unit}</span>
                      </span>
                      {qty > 0 ? (
                        <span className="flex items-center gap-1 rounded-full border border-hair bg-white p-0.5">
                          <button type="button" onClick={() => setQty(e.id, qty - 1)} aria-label={`One less ${label}`} className="grid h-7 w-7 place-items-center rounded-full text-ink hover:bg-beige">
                            <Icon d={I.minus} className="h-4 w-4" />
                          </button>
                          <span className="min-w-[18px] text-center text-[13px] font-bold tabular-nums">{qty}</span>
                          <button type="button" onClick={() => setQty(e.id, qty + 1)} aria-label={`One more ${label}`} className="grid h-7 w-7 place-items-center rounded-full bg-navy text-white">
                            <Icon d={I.plus} className="h-4 w-4" />
                          </button>
                        </span>
                      ) : (
                        <button type="button" onClick={() => setQty(e.id, 1)} aria-label={`Add ${label}`} className="grid h-8 w-8 place-items-center rounded-full border border-hair text-ink hover:border-navy hover:bg-navy hover:text-white">
                          <Icon d={I.plus} className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* ---------------- Order panel ---------------- */}
      <aside className="flex min-h-0 flex-col border-l border-hair bg-white">
        <div className="flex items-center justify-between px-5 pb-2 pt-4">
          <h2 className="text-[17px] font-semibold">Order details</h2>
          {(lines.length > 0 || customer) && (
            <button type="button" onClick={clearOrder} className="text-[12.5px] font-semibold text-ink-3 hover:text-[#9c3326]">
              Clear
            </button>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5">
          <CustomerPicker customer={customer} onChange={setCustomer} loyalty={loyalty} />

          <div className="mt-3 grid grid-cols-3 gap-1 rounded-xl bg-beige p-1" role="radiogroup" aria-label="Order taken by">
            {[
              ["pos_counter", "Counter"],
              ["phone", "Phone"],
              ["whatsapp", "WhatsApp"],
            ].map(([v, l]) => (
              <button
                key={v}
                type="button"
                role="radio"
                aria-checked={channel === v}
                onClick={() => setChannel(v)}
                className={"rounded-lg py-1.5 text-[12.5px] font-semibold " + (channel === v ? "bg-white text-ink shadow-sm" : "text-ink-2")}
              >
                {l}
              </button>
            ))}
          </div>

          <div className="mt-4 flex items-center justify-between text-[12px] font-semibold uppercase tracking-[0.1em] text-ink-3">
            <span>Items</span>
            <span>
              {tagCount} {tagCount === 1 ? "tag" : "tags"}
            </span>
          </div>
          {lines.length === 0 ? (
            <div className="mt-2 rounded-xl border border-dashed border-hair-2 px-4 py-8 text-center text-[13.5px] text-ink-3">Tap products on the left to add them.</div>
          ) : (
            <ul className="mt-2 flex flex-col gap-2">
              {lines.map(({ id, l, e }) => {
                const [bg, fg] = tint(e.service_id);
                const label = labelOf(e);
                const hasNote = l.tags.length > 0 || l.text.trim();
                return (
                  <li key={id} className="rounded-xl border border-hair p-2.5">
                    <div className="flex items-start gap-2.5">
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg text-[12px] font-bold" style={{ background: bg, color: fg }}>
                        {monogram(label)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <b className="block truncate text-[13.5px]">{label}</b>
                        <span className="block truncate text-[11.5px] text-ink-3">
                          {serviceById.get(e.service_id)?.name} · {rupees(e.price_minor)}/{UNIT[e.unit] ?? e.unit}
                        </span>
                      </span>
                      <b className="shrink-0 text-[13.5px] tabular-nums">{rupees(e.price_minor * l.qty)}</b>
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <span className="flex items-center gap-1 rounded-full border border-hair p-0.5">
                        <button type="button" onClick={() => setQty(id, l.qty - 1)} aria-label="One less" className="grid h-7 w-7 place-items-center rounded-full hover:bg-beige">
                          <Icon d={l.qty === 1 ? I.trash : I.minus} className="h-4 w-4" />
                        </button>
                        <input
                          value={l.qty}
                          onChange={(ev) => setQty(id, Math.max(0, parseInt(ev.target.value || "0", 10) || 0))}
                          inputMode="numeric"
                          aria-label={`Quantity of ${label}`}
                          className="w-9 bg-transparent text-center text-[13px] font-bold tabular-nums outline-none"
                        />
                        <button type="button" onClick={() => setQty(id, l.qty + 1)} aria-label="One more" className="grid h-7 w-7 place-items-center rounded-full bg-navy text-white">
                          <Icon d={I.plus} className="h-4 w-4" />
                        </button>
                      </span>
                      <span className="text-[11.5px] text-ink-3">{UNIT[e.unit] === "kg" ? "kg" : e.pieces > 1 ? `${l.qty * e.pieces} tags` : ""}</span>
                      <button
                        type="button"
                        onClick={() => setNoteOpen(noteOpen === id ? null : id)}
                        className={"ml-auto flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-semibold " + (hasNote ? "bg-[#f5ebd9] text-[#8a5a12]" : "text-ink-3 hover:bg-beige")}
                      >
                        <Icon d={I.note} className="h-3.5 w-3.5" /> {hasNote ? "Note" : "Add note"}
                      </button>
                    </div>
                    {hasNote && noteOpen !== id && <p className="mt-1.5 text-[12px] text-[#8a5a12]">{[...l.tags, l.text.trim()].filter(Boolean).join(" · ")}</p>}
                    {noteOpen === id && (
                      <div className="mt-2 rounded-lg bg-ivory p-2">
                        <div className="flex flex-wrap gap-1">
                          {NOTE_TAGS.map((t) => {
                            const on = l.tags.includes(t);
                            return (
                              <button
                                key={t}
                                type="button"
                                aria-pressed={on}
                                onClick={() => setCart((c) => ({ ...c, [id]: { ...c[id], tags: on ? c[id].tags.filter((x) => x !== t) : [...c[id].tags, t] } }))}
                                className={"rounded-full px-2.5 py-1 text-[11.5px] font-semibold " + (on ? "bg-[#8a5a12] text-white" : "border border-hair bg-white text-ink-2")}
                              >
                                {t}
                              </button>
                            );
                          })}
                        </div>
                        <input
                          value={l.text}
                          onChange={(ev) => setCart((c) => ({ ...c, [id]: { ...c[id], text: ev.target.value.slice(0, 200) } }))}
                          placeholder="Other note (e.g. ink mark on left cuff)"
                          aria-label="Note"
                          className="mt-1.5 h-9 w-full rounded-lg border border-hair bg-white px-2.5 text-[13px] outline-none focus:border-brass"
                        />
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          {customer && loyalty && (pointOptions.length > 0 || loyalty.vouchers.length > 0) && (
            <div className="mt-4 rounded-xl border border-brass/30 bg-[#fbf7ef] p-3">
              <div className="mb-2 flex items-center gap-1.5 text-[12.5px] font-semibold text-[#6f5c36]">
                <Icon d={I.star} className="h-4 w-4" /> London Wash Club · {loyalty.available.toLocaleString("en-IN")} points
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <select value={redeemPoints} onChange={(e) => setRedeemPoints(Number(e.target.value))} aria-label="Use points" className="h-9 rounded-lg border border-hair bg-white px-2 text-[13px]">
                  <option value={0}>Don&apos;t use points</option>
                  {pointOptions.map((d) => (
                    <option key={d} value={d}>
                      {d} pts = {rupees(Math.round(d * loyalty.pointValueMinor))}
                    </option>
                  ))}
                </select>
                <select value={voucherCode} onChange={(e) => setVoucherCode(e.target.value)} aria-label="Voucher" className="h-9 rounded-lg border border-hair bg-white px-2 text-[13px]">
                  <option value="">No voucher</option>
                  {loyalty.vouchers.map((v) => (
                    <option key={v.code} value={v.code} disabled={subtotal < v.minOrderMinor}>
                      {v.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}
          <div className="h-4" />
        </div>

        {/* Totals + pay */}
        <div className="border-t border-hair px-5 pb-4 pt-3">
          <div className="mb-2 grid grid-cols-4 gap-1 rounded-xl bg-beige p-1" role="radiogroup" aria-label="Payment now">
            {PAY.map((p) => (
              <button
                key={p.v || "later"}
                type="button"
                role="radio"
                aria-checked={payMethod === p.v}
                onClick={() => {
                  setPayMethod(p.v);
                  setPayTouched(false);
                }}
                className={"rounded-lg py-1.5 text-[12.5px] font-semibold " + (payMethod === p.v ? "bg-white text-ink shadow-sm" : "text-ink-2")}
              >
                {p.l}
              </button>
            ))}
          </div>
          {payMethod && (
            <label className="mb-2 flex items-center justify-between gap-2 text-[13px] text-ink-2">
              Amount received (₹)
              <input
                value={payTouched ? payAmount : String(total / 100)}
                onChange={(e) => {
                  setPayTouched(true);
                  setPayAmount(e.target.value.replace(/[^\d.]/g, ""));
                }}
                inputMode="decimal"
                aria-label="Amount received"
                className="h-9 w-28 rounded-lg border border-hair px-2.5 text-right text-[14px] font-semibold tabular-nums outline-none focus:border-brass"
              />
            </label>
          )}
          <dl className="space-y-1 text-[13.5px]">
            <div className="flex justify-between text-ink-2">
              <dt>Subtotal</dt>
              <dd className="tabular-nums">{rupees(subtotal)}</dd>
            </div>
            {voucherMinor + pointsMinor > 0 && (
              <div className="flex justify-between text-[#2c6a4e]">
                <dt>Club discount</dt>
                <dd className="tabular-nums">−{rupees(voucherMinor + pointsMinor)}</dd>
              </div>
            )}
            <div className="flex justify-between border-t border-hair pt-1.5 text-[16px] font-bold">
              <dt>Total</dt>
              <dd className="tabular-nums">{rupees(total)}</dd>
            </div>
            {payMethod && (
              <div className="flex justify-between text-ink-2">
                <dt>Balance due at collection</dt>
                <dd className="tabular-nums">{rupees(due)}</dd>
              </div>
            )}
          </dl>
          {error && (
            <p role="alert" className="mt-2 rounded-lg bg-[#f6e4df] px-3 py-2 text-[13px] text-[#9c3326]">
              {error}
            </p>
          )}
          <button
            type="button"
            onClick={submit}
            disabled={pending || !lines.length || !customer}
            className="mt-3 h-12 w-full rounded-xl bg-navy text-[15px] font-semibold text-white shadow-[0_10px_24px_-12px_rgba(21,33,58,.8)] transition hover:brightness-110 disabled:opacity-40"
          >
            {pending ? "Creating order…" : !customer ? "Choose a customer" : !lines.length ? "Add items" : `Create order · ${rupees(total)}`}
          </button>
        </div>
      </aside>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Customer search / quick add                                           */
/* ------------------------------------------------------------------ */

function CustomerPicker({ customer, onChange, loyalty }: { customer: Customer | null; onChange: (c: Customer | null) => void; loyalty: Loyalty | null }) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<CustomerHit[]>([]);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (customer || q.trim().length < 2) {
      setHits([]);
      return;
    }
    let cancelled = false;
    setBusy(true);
    const t = setTimeout(() => {
      searchCustomers(q)
        .then((r) => !cancelled && setHits(r))
        .finally(() => !cancelled && setBusy(false));
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [q, customer]);

  if (customer) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-hair bg-ivory px-3 py-2.5">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-navy text-[13px] font-bold text-[#e3d2ac]">
          {customer.full_name
            .split(" ")
            .filter(Boolean)
            .slice(0, 2)
            .map((p) => p[0])
            .join("")
            .toUpperCase()}
        </span>
        <span className="min-w-0 flex-1">
          <b className="block truncate text-[14px]">{customer.full_name}</b>
          <span className="block truncate text-[12px] text-ink-2">
            {customer.phone ?? "No phone"}
            {loyalty ? ` · ${loyalty.available.toLocaleString("en-IN")} pts` : ""}
          </span>
        </span>
        <button type="button" onClick={() => onChange(null)} className="text-[12.5px] font-semibold text-accent hover:underline">
          Change
        </button>
      </div>
    );
  }

  if (adding) {
    return (
      <div className="rounded-xl border border-hair p-3">
        <div className="mb-2 text-[12.5px] font-semibold text-ink-2">New customer</div>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" aria-label="Full name" className="mb-2 h-10 w-full rounded-lg border border-hair px-3 text-[14px] outline-none focus:border-brass" />
        <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Mobile number" inputMode="numeric" aria-label="Mobile number" className="h-10 w-full rounded-lg border border-hair px-3 text-[14px] outline-none focus:border-brass" />
        {err && <p className="mt-2 text-[12.5px] text-[#9c3326]">{err}</p>}
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              setErr(null);
              startTransition(async () => {
                const res = await createCustomerQuick({ full_name: name, phone });
                if ("error" in res && res.error) return setErr(res.error);
                if ("customer" in res && res.customer) {
                  onChange(res.customer as Customer);
                  setAdding(false);
                  setName("");
                  setPhone("");
                  setQ("");
                }
              });
            }}
            className="h-9 flex-1 rounded-lg bg-navy text-[13px] font-semibold text-white disabled:opacity-50"
          >
            {pending ? "Saving…" : "Save customer"}
          </button>
          <button type="button" onClick={() => setAdding(false)} className="h-9 rounded-lg border border-hair px-3 text-[13px] font-semibold">
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative">
      <label className="relative flex items-center">
        <Icon d={I.user} className="pointer-events-none absolute left-3 h-4 w-4 text-ink-3" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Customer name or mobile"
          aria-label="Find customer"
          autoComplete="off"
          className="h-11 w-full rounded-xl border border-hair bg-white pl-9 pr-24 text-[14px] outline-none focus:border-brass focus:ring-2 focus:ring-brass/25"
        />
        <button
          type="button"
          onClick={() => {
            setAdding(true);
            if (/^\d{6,}$/.test(q.replace(/\D/g, "")) && !/[a-z]/i.test(q)) setPhone(q.trim());
            else setName(q.trim());
          }}
          className="absolute right-1.5 rounded-lg bg-beige px-2.5 py-1.5 text-[12px] font-semibold text-ink"
        >
          + New
        </button>
      </label>
      {q.trim().length >= 2 && (
        <div className="absolute inset-x-0 top-[calc(100%+4px)] z-20 overflow-hidden rounded-xl border border-hair bg-white shadow-[0_18px_40px_-18px_rgba(21,33,58,.45)]">
          {busy && !hits.length ? (
            <div className="px-3 py-3 text-[13px] text-ink-3">Searching…</div>
          ) : hits.length ? (
            <ul>
              {hits.map((h) => (
                <li key={h.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onChange({ id: h.id, full_name: h.full_name, phone: h.phone });
                      setQ("");
                    }}
                    className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left hover:bg-ivory"
                  >
                    <span className="min-w-0">
                      <b className="block truncate text-[13.5px]">{h.full_name}</b>
                      <span className="text-[12px] text-ink-2">{h.phone ?? "No phone"}</span>
                    </span>
                    <span className="shrink-0 text-[11.5px] text-ink-3">{h.orders} orders</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <button type="button" onClick={() => setAdding(true)} className="w-full px-3 py-3 text-left text-[13px] text-ink-2 hover:bg-ivory">
              No match. <b className="text-ink">Add “{q.trim()}” as a new customer</b>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
