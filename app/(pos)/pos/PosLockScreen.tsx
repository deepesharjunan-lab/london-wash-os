"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { setPosPinAction, unlockPosAction } from "./lock-actions";
import { Logo } from "@/lib/brand/Logo";

type Mode = "unlock" | "set" | "confirm";

/** Full-screen 4-digit PIN pad shown before the POS opens. */
export function PosLockScreen({ hasPin, canManage, userName, branchName }: { hasPin: boolean; canManage: boolean; userName: string; branchName: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>(hasPin ? "unlock" : "set");
  const [pin, setPin] = useState("");
  const [first, setFirst] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const busy = useRef(false);

  const submit = (value: string) => {
    if (busy.current) return;
    if (mode === "set") {
      setFirst(value);
      setPin("");
      setMode("confirm");
      return;
    }
    busy.current = true;
    startTransition(async () => {
      const fd = new FormData();
      fd.set("pin", mode === "confirm" ? first : value);
      if (mode === "confirm") fd.set("confirm", value);
      const res = mode === "unlock" ? await unlockPosAction({}, fd) : await setPosPinAction({}, fd);
      busy.current = false;
      if (res.ok) {
        router.refresh();
        return;
      }
      setError(res.error ?? "Something went wrong.");
      setPin("");
      if (mode === "confirm") {
        setFirst("");
        setMode("set");
      }
    });
  };

  const press = (d: string) => {
    if (pending || busy.current || pin.length >= 4) return;
    setError(null);
    const next = pin + d;
    setPin(next);
    if (next.length === 4) setTimeout(() => submit(next), 80); // let the 4th dot show first
  };
  const back = () => setPin((p) => p.slice(0, -1));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (/^\d$/.test(e.key)) press(e.key);
      else if (e.key === "Backspace") back();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const blocked = !hasPin && !canManage;
  const title =
    mode === "unlock" ? "Enter POS PIN" : mode === "set" ? (hasPin ? "Choose a new POS PIN" : "Set a POS PIN") : "Enter the new PIN again";

  return (
    <div className="grid h-screen place-items-center bg-[radial-gradient(90%_70%_at_50%_30%,#1e2d4d_0%,#101828_70%)] px-5 text-[#efe8da]">
      <div className="flex w-full max-w-[340px] flex-col items-center gap-6">
        <div className="flex flex-col items-center gap-3">
          <Logo variant="mark" tone="light" className="h-auto w-[200px]" />
          <span className="text-[11px] font-semibold uppercase tracking-[0.28em] text-white/55">Reception POS · {branchName}</span>
        </div>

        {blocked ? (
          <p className="rounded-xl bg-white/10 px-4 py-3 text-center text-[14px] text-white/80">
            The POS PIN hasn&apos;t been set yet. Ask an Admin or Manager to open the POS once and set it.
          </p>
        ) : (
          <>
            <div className="text-center">
              <h1 className="text-[19px] font-semibold text-white">{title}</h1>
              <p className="mt-1 text-[13px] text-white/55">{mode === "unlock" ? `Signed in as ${userName}` : "4 digits. Share it only with counter staff."}</p>
            </div>
            <div className="flex gap-3.5" aria-label={`${pin.length} of 4 digits entered`} role="status">
              {[0, 1, 2, 3].map((i) => (
                <span key={i} className={"h-3.5 w-3.5 rounded-full border-2 transition " + (i < pin.length ? "border-[#e3d2ac] bg-[#e3d2ac]" : "border-white/35")} />
              ))}
            </div>
            <p role="alert" className="min-h-[20px] text-center text-[13px] text-[#ffb4a6]">
              {pending ? <span className="text-white/60">Checking…</span> : error}
            </p>
            <div className="grid w-full grid-cols-3 gap-3">
              {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
                <button key={d} type="button" onClick={() => press(d)} className="h-16 rounded-2xl bg-white/[0.07] text-[24px] font-semibold text-white transition hover:bg-white/[0.12] active:scale-95">
                  {d}
                </button>
              ))}
              <span />
              <button type="button" onClick={() => press("0")} className="h-16 rounded-2xl bg-white/[0.07] text-[24px] font-semibold text-white transition hover:bg-white/[0.12] active:scale-95">
                0
              </button>
              <button type="button" onClick={back} aria-label="Delete last digit" className="grid h-16 place-items-center rounded-2xl text-white/70 transition hover:bg-white/[0.07]">
                <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M9 5h11v14H9l-6-7z" />
                  <path d="m12 9 5 6M17 9l-5 6" />
                </svg>
              </button>
            </div>
          </>
        )}

        <div className="flex flex-col items-center gap-2 text-[13px]">
          {canManage && hasPin && mode === "unlock" && (
            <button type="button" onClick={() => { setMode("set"); setPin(""); setError(null); }} className="font-semibold text-white/60 underline-offset-4 hover:underline">
              Change POS PIN
            </button>
          )}
          {mode !== "unlock" && hasPin && (
            <button type="button" onClick={() => { setMode("unlock"); setPin(""); setFirst(""); setError(null); }} className="font-semibold text-white/60 underline-offset-4 hover:underline">
              Back to unlock
            </button>
          )}
          <Link href="/dashboard" className="text-white/45 hover:text-white/70">
            Go to the console
          </Link>
        </div>
      </div>
    </div>
  );
}
