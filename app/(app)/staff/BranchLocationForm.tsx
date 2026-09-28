"use client";

import { useState } from "react";
import { saveBranchLocation } from "./actions";

/** Branch location for punch-in. "Use this device's location" fills it in when you're standing at the branch. */
export function BranchLocationForm({ lat, lng, radius }: { lat: number | null; lng: number | null; radius: number }) {
  const [la, setLa] = useState(lat == null ? "" : String(lat));
  const [ln, setLn] = useState(lng == null ? "" : String(lng));
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function readHere() {
    setMsg(null);
    if (!("geolocation" in navigator)) return setMsg("This browser can't read location.");
    setBusy(true);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setLa(p.coords.latitude.toFixed(6));
        setLn(p.coords.longitude.toFixed(6));
        setMsg(`Location read (±${Math.round(p.coords.accuracy)} m). Check it on the map, then save.`);
        setBusy(false);
      },
      (e) => {
        setMsg(e.code === 1 ? "Location is blocked for this site. Allow it in the browser, or paste the coordinates from Google Maps." : "Couldn't read the location.");
        setBusy(false);
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
    );
  }

  const valid = la !== "" && ln !== "" && Number.isFinite(Number(la)) && Number.isFinite(Number(ln));
  return (
    <form action={saveBranchLocation} className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_140px_auto] sm:items-end">
      <label className="text-[12px] font-semibold text-ink/60">
        Latitude
        <input name="latitude" value={la} onChange={(e) => setLa(e.target.value)} inputMode="decimal" placeholder="9.931233" className="mt-1 w-full border border-black/10 px-3 py-2 text-[13px]" required />
      </label>
      <label className="text-[12px] font-semibold text-ink/60">
        Longitude
        <input name="longitude" value={ln} onChange={(e) => setLn(e.target.value)} inputMode="decimal" placeholder="76.267303" className="mt-1 w-full border border-black/10 px-3 py-2 text-[13px]" required />
      </label>
      <label className="text-[12px] font-semibold text-ink/60">
        Radius (m)
        <input name="radius" type="number" min={20} max={2000} defaultValue={radius} className="mt-1 w-full border border-black/10 px-3 py-2 text-[13px]" />
      </label>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={readHere} disabled={busy} className="rounded-md border border-black/10 bg-white px-3 py-2 text-[13px] font-semibold text-ink disabled:opacity-50">
          {busy ? "Reading…" : "Use this device's location"}
        </button>
        <button type="submit" className="rounded-md bg-accent px-4 py-2 text-[13px] font-semibold text-white hover:brightness-110">
          Save
        </button>
      </div>
      <div className="text-[12.5px] text-ink/60 sm:col-span-4">
        {msg && <span className="mr-2">{msg}</span>}
        {valid && (
          <a href={`https://www.google.com/maps?q=${la},${ln}`} target="_blank" rel="noopener noreferrer" className="font-semibold text-accent underline-offset-2 hover:underline">
            Check on Google Maps
          </a>
        )}
      </div>
    </form>
  );
}
