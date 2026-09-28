"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { punchAction } from "./actions";

type Props = {
  state: "out" | "in" | "done";
  checkIn: string | null;
  checkOut: string | null;
  branchName: string;
  radius: number;
  branchReady: boolean;
};

const time = (iso: string | null) =>
  iso ? new Date(iso).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" }) : "";

function getPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!("geolocation" in navigator)) return reject(new Error("unsupported"));
    navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 });
  });
}

/** Punch in / out. Reads the phone's location; the server checks it's within the branch radius. */
export function PunchCard({ state, checkIn, checkOut, branchName, radius, branchReady }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);

  async function go(kind: "in" | "out") {
    setMsg(null);
    setBusy(true);
    try {
      let pos: GeolocationPosition;
      try {
        pos = await getPosition();
      } catch (e: any) {
        const denied = e?.code === 1;
        setMsg({
          tone: "err",
          text: denied
            ? "Location is blocked. Allow location for this app in your phone's settings, then try again."
            : "Couldn't find your location. Turn on location (GPS) and try again.",
        });
        return;
      }
      const res = await punchAction({ kind, lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy });
      if ("error" in res && res.error) setMsg({ tone: "err", text: res.error });
      else {
        setMsg({ tone: "ok", text: kind === "in" ? "Punched in. Have a good shift!" : "Punched out. Thank you!" });
        startTransition(() => router.refresh());
      }
    } finally {
      setBusy(false);
    }
  }

  const dot = state === "in" ? "bg-[#3f9b6f]" : state === "done" ? "bg-ink-3" : "bg-[#c0843a]";
  return (
    <section className="flex flex-col gap-3 rounded-[18px] bg-[linear-gradient(150deg,#1D2E50_0%,#121D35_100%)] p-5 text-[#f3eee4] shadow-[0_20px_40px_-24px_rgba(10,14,24,.55)]">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.18em] text-[#c7b58f]">
          <span className={"h-2 w-2 rounded-full " + dot} />
          {state === "in" ? "On shift" : state === "done" ? "Shift done" : "Not punched in"}
        </span>
        <span className="text-[12px] text-white/60">{branchName}</span>
      </div>
      <div className="font-display text-[26px] font-medium leading-tight">
        {state === "in" && <>Since {time(checkIn)}</>}
        {state === "done" && (
          <>
            {time(checkIn)} – {time(checkOut)}
          </>
        )}
        {state === "out" && <>Punch in to start</>}
      </div>
      {!branchReady ? (
        <p className="rounded-xl bg-white/10 px-3 py-2.5 text-[13px] text-white/80">The branch location isn&apos;t set yet, so punch-in is off. Ask the owner to set it.</p>
      ) : state !== "done" ? (
        <button
          type="button"
          onClick={() => go(state === "in" ? "out" : "in")}
          disabled={busy}
          className={
            "inline-flex min-h-[54px] items-center justify-center gap-2 rounded-full text-[16px] font-semibold transition active:scale-[.985] disabled:opacity-60 " +
            (state === "in" ? "border border-white/25 text-white" : "bg-[#efe8da] text-[#15213a]")
          }
        >
          {busy ? "Checking your location…" : state === "in" ? "Punch out" : "Punch in"}
        </button>
      ) : null}
      {state === "out" && branchReady && <p className="text-[12px] text-white/55">You need to be at the branch, within {radius} m.</p>}
      {msg && (
        <p role={msg.tone === "err" ? "alert" : "status"} className={"rounded-xl px-3 py-2.5 text-[13px] " + (msg.tone === "err" ? "bg-[#9c3326]/30 text-[#ffd9d2]" : "bg-[#2c6a4e]/35 text-[#d9f2e6]")}>
          {msg.text}
        </p>
      )}
    </section>
  );
}
