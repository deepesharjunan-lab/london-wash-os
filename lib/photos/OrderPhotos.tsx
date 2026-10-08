"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { OrderPhoto, OrderPhotoSet } from "./order-photos";
import { uploadPhoto } from "./compress";

// Garment photos panel for the POS "order created" screen and the console
// order page. Every garment tag should get a photo. On the desktop POS,
// "Take photos with phone" shows a QR code; photos taken on the phone appear
// here within a few seconds.

export function OrderPhotos({ orderId, initial }: { orderId: string; initial: OrderPhotoSet }) {
  const [set, setSet] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [qr, setQr] = useState<{ qr: string; url: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const target = useRef<string>("");

  const refresh = useCallback(async () => {
    const res = await fetch(`/api/order-photos?order=${orderId}`, { cache: "no-store" });
    if (res.ok) setSet(await res.json());
  }, [orderId]);

  // While the QR code is open, pick up photos taken on the phone.
  useEffect(() => {
    if (!qr) return;
    const t = setInterval(refresh, 3000);
    return () => clearInterval(t);
  }, [qr, refresh]);

  async function openQr() {
    setError("");
    const res = await fetch("/api/order-photos/link", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ order_id: orderId }) });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return setError(json.error ?? "Couldn't create the phone link.");
    setQr(json);
  }

  function pick(garmentId: string) {
    target.current = garmentId;
    fileRef.current?.click();
  }

  async function onFiles(files: FileList | null) {
    if (!files?.length) return;
    const garmentId = target.current;
    setBusy(garmentId || "other");
    setError("");
    try {
      for (const f of Array.from(files)) await uploadPhoto("/api/order-photos", f, { order_id: orderId, garment_id: garmentId });
    } catch (e: any) {
      setError(e?.message ?? "Upload failed");
    }
    if (fileRef.current) fileRef.current.value = "";
    setBusy(null);
    refresh();
  }

  async function remove(p: OrderPhoto) {
    if (!window.confirm("Delete this photo?")) return;
    await fetch(`/api/order-photos/${p.id}`, { method: "DELETE" });
    refresh();
  }

  async function toggleKeep(p: OrderPhoto) {
    await fetch(`/api/order-photos/${p.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ keep: !p.keep }) });
    refresh();
  }

  const total = set.garments.length;
  const done = total - set.missing;

  return (
    <section className="rounded-xl border border-black/10 bg-white p-4">
      <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => onFiles(e.target.files)} />
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-[15px] font-semibold text-ink">Garment photos</div>
          <div className={"text-[12.5px] " + (total && !set.missing ? "text-[#2c6a4e]" : "text-[#8a5a12]")}>
            {total ? (set.missing ? `${done} of ${total} garments photographed · ${set.missing} still need a photo` : `All ${total} garments photographed`) : "This order has no garment tags yet"}
          </div>
        </div>
        <button type="button" onClick={openQr} className="rounded-lg bg-[#15213a] px-4 py-2.5 text-[13.5px] font-semibold text-white hover:opacity-90">
          Take photos with phone
        </button>
      </div>
      {error && <p className="mb-2 rounded-md bg-[#f8e7e4] px-3 py-2 text-[12.5px] text-[#9c3326]">{error}</p>}

      <ul className="divide-y divide-black/5">
        {set.garments.map((g) => (
          <li key={g.id} className="flex flex-wrap items-center gap-3 py-2.5">
            <div className="w-44 min-w-0">
              <div className="font-mono text-[12.5px] font-semibold text-ink">{g.tag}</div>
              <div className="truncate text-[12px] text-ink/55">
                {g.item}
                {g.service ? ` · ${g.service}` : ""}
              </div>
            </div>
            <div className="flex flex-1 flex-wrap items-center gap-2">
              {g.photos.map((p) => (
                <Thumb key={p.id} p={p} onDelete={() => remove(p)} onKeep={() => toggleKeep(p)} />
              ))}
              {!g.photos.length && <span className="rounded bg-[#fbf3e2] px-2 py-1 text-[11.5px] font-semibold text-[#8a5a12]">No photo yet</span>}
              <button type="button" onClick={() => pick(g.id)} disabled={busy === g.id} className="rounded-md border border-dashed border-black/20 px-2.5 py-1.5 text-[12px] text-ink/70 hover:border-black/40 disabled:opacity-50">
                {busy === g.id ? "Uploading…" : "+ From computer"}
              </button>
            </div>
          </li>
        ))}
      </ul>

      {set.other.length > 0 && (
        <div className="mt-3 border-t border-black/5 pt-3">
          <div className="mb-1.5 text-[12px] font-semibold uppercase tracking-wide text-ink/50">Other photos</div>
          <div className="flex flex-wrap gap-2">
            {set.other.map((p) => (
              <Thumb key={p.id} p={p} onDelete={() => remove(p)} onKeep={() => toggleKeep(p)} />
            ))}
          </div>
        </div>
      )}
      <p className="mt-3 text-[11.5px] text-ink/45">Photos are deleted automatically 5 days after delivery. Tap ★ on a photo to keep it, for example to show damage.</p>

      {qr && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" onClick={() => setQr(null)}>
          <div className="w-full max-w-[380px] rounded-2xl bg-white p-6 text-center" onClick={(e) => e.stopPropagation()}>
            <div className="text-[17px] font-semibold text-ink">Scan with your phone camera</div>
            <p className="mt-1 text-[13px] text-ink/60">Then take one photo of each garment tag. Photos appear here as you go.</p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qr.qr} alt="QR code for the phone photo page" className="mx-auto my-4 h-60 w-60" />
            <div className={"text-[14px] font-semibold " + (set.missing ? "text-[#8a5a12]" : "text-[#2c6a4e]")}>
              {total ? `${done} of ${total} garments done` : "No garment tags"}
            </div>
            <p className="mt-1 text-[11.5px] text-ink/45">The link works for 2 hours.</p>
            <button type="button" onClick={() => setQr(null)} className="mt-4 w-full rounded-lg border border-black/10 py-2.5 text-[13.5px] font-semibold text-ink">
              Done
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

function Thumb({ p, onDelete, onKeep }: { p: OrderPhoto; onDelete: () => void; onKeep: () => void }) {
  return (
    <span className="group relative inline-block">
      <a href={p.url} target="_blank" rel="noopener">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={p.url} alt="Garment photo" className="h-16 w-16 rounded-md object-cover ring-1 ring-black/10" />
      </a>
      <button type="button" onClick={onKeep} title={p.keep ? "Kept (won't be auto-deleted)" : "Keep this photo"} className={"absolute left-0.5 top-0.5 rounded bg-white/90 px-1 text-[12px] leading-5 " + (p.keep ? "text-[#c58a00]" : "text-ink/40")}>
        ★
      </button>
      <button type="button" onClick={onDelete} title="Delete photo" className="absolute right-0.5 top-0.5 hidden rounded bg-white/90 px-1 text-[12px] leading-5 text-[#9c3326] group-hover:block">
        ×
      </button>
    </span>
  );
}
