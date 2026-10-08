"use client";

import { useRef, useState } from "react";
import type { OrderPhotoSet } from "@/lib/photos/order-photos";
import { uploadPhoto } from "@/lib/photos/compress";

// Phone side: one big button per garment tag opens the camera; the photo is
// shrunk on the phone and uploaded straight away.

export function PhoneUploader({ token, orderNumber, firstName, initial }: { token: string; orderNumber: string; firstName: string; initial: OrderPhotoSet }) {
  const [set, setSet] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const cam = useRef<HTMLInputElement>(null);
  const target = useRef("");

  async function refresh() {
    const res = await fetch(`/api/public/order-photos?t=${encodeURIComponent(token)}`, { cache: "no-store" });
    if (res.ok) setSet(await res.json());
  }

  function shoot(garmentId: string) {
    target.current = garmentId;
    cam.current?.click();
  }

  async function onFile(files: FileList | null) {
    if (!files?.length) return;
    const garmentId = target.current;
    setBusy(garmentId);
    setError("");
    try {
      for (const f of Array.from(files)) await uploadPhoto("/api/public/order-photos", f, { t: token, garment_id: garmentId });
    } catch (e: any) {
      setError(e?.message ?? "Upload failed. Try again.");
    }
    if (cam.current) cam.current.value = "";
    setBusy(null);
    refresh();
  }

  const total = set.garments.length;
  const done = total - set.missing;
  const next = set.garments.find((g) => !g.photos.length);

  return (
    <main className="mx-auto max-w-md p-4 pb-16" style={{ fontFamily: "system-ui, sans-serif" }}>
      <input ref={cam} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => onFile(e.target.files)} />
      <div className="text-[12px] font-semibold uppercase tracking-wide text-black/50">The London Wash · garment photos</div>
      <h1 className="text-[24px] font-semibold">
        {orderNumber}
        {firstName ? <span className="text-black/50"> · {firstName}</span> : null}
      </h1>
      <div className={"mt-1 text-[14px] font-semibold " + (total && !set.missing ? "text-[#2c6a4e]" : "text-[#8a5a12]")}>
        {total ? (set.missing ? `${done} of ${total} done` : `All ${total} garments done. You can close this page.`) : "No garment tags on this order"}
      </div>
      {error && <p className="mt-3 rounded-md bg-[#f8e7e4] px-3 py-2 text-[13px] text-[#9c3326]">{error}</p>}

      {next && (
        <button type="button" onClick={() => shoot(next.id)} disabled={!!busy} className="mt-4 w-full rounded-2xl bg-[#15213a] px-4 py-5 text-[17px] font-semibold text-white disabled:opacity-60">
          {busy ? "Uploading…" : `📷 Photo of ${next.tag}`}
          <span className="block text-[13px] font-normal text-white/70">
            {next.item}
            {next.service ? ` · ${next.service}` : ""}
          </span>
        </button>
      )}

      <ul className="mt-5 space-y-2">
        {set.garments.map((g) => (
          <li key={g.id} className="flex items-center gap-3 rounded-xl border border-black/10 p-3">
            <div className="min-w-0 flex-1">
              <div className="font-mono text-[14px] font-semibold">{g.tag}</div>
              <div className="truncate text-[12.5px] text-black/55">
                {g.item}
                {g.service ? ` · ${g.service}` : ""}
              </div>
            </div>
            {g.photos[0] ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={g.photos[0].url} alt="" className="h-12 w-12 rounded-md object-cover" />
            ) : null}
            <button type="button" onClick={() => shoot(g.id)} disabled={!!busy} className={"rounded-lg px-3 py-2 text-[13px] font-semibold " + (g.photos.length ? "border border-black/15 text-black/70" : "bg-[#c7b58f] text-[#15213a]")}>
              {busy === g.id ? "…" : g.photos.length ? `+1 (${g.photos.length})` : "Take photo"}
            </button>
          </li>
        ))}
      </ul>
    </main>
  );
}
