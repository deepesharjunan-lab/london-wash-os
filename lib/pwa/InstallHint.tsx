"use client";

import { useEffect, useState } from "react";
import { Logo } from "@/lib/brand/Logo";

type BIP = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

/**
 * "Install the app" card. On Android/Chrome it opens the install prompt; on
 * iPhone it explains Share → Add to Home Screen. Hidden once installed, or
 * after the person dismisses it.
 */
export function InstallHint({ appName, storageKey }: { appName: string; storageKey: string }) {
  const [mode, setMode] = useState<"hidden" | "prompt" | "ios">("hidden");
  const [evt, setEvt] = useState<BIP | null>(null);

  useEffect(() => {
    const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as any).standalone === true;
    let dismissed = false;
    try {
      dismissed = localStorage.getItem(storageKey) === "1";
    } catch {}
    if (standalone || dismissed) return;
    if (/iphone|ipad|ipod/i.test(navigator.userAgent)) setMode("ios");
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setEvt(e as BIP);
      setMode("prompt");
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, [storageKey]);

  const dismiss = () => {
    try {
      localStorage.setItem(storageKey, "1");
    } catch {}
    setMode("hidden");
  };

  if (mode === "hidden") return null;
  return (
    <div className="flex items-center gap-3 rounded-[14px] border border-brass/40 bg-[#fbf7ef] px-4 py-3">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-navy">
        <Logo variant="monogram" alt="" className="h-auto w-7" />
      </span>
      <span className="min-w-0 flex-1 text-[13px] leading-snug text-ink-2">
        <b className="block text-[14px] text-ink">Install {appName}</b>
        {mode === "prompt" ? "Add it to your home screen for one-tap access and alerts." : "Tap Share, then “Add to Home Screen”."}
      </span>
      {mode === "prompt" && (
        <button
          type="button"
          className="inline-flex min-h-[40px] shrink-0 items-center rounded-full bg-navy px-3.5 text-[13px] font-semibold text-[#f8f5ef]"
          onClick={async () => {
            if (!evt) return;
            await evt.prompt();
            await evt.userChoice.catch(() => undefined);
            setMode("hidden");
          }}
        >
          Install
        </button>
      )}
      <button type="button" aria-label="Dismiss" className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-ink-3 hover:bg-beige" onClick={dismiss}>
        ✕
      </button>
    </div>
  );
}
