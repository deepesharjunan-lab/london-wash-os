"use client";

import { useEffect, useState } from "react";
import { Switch } from "@/lib/ui/Toggle";

type Save = (sub: { endpoint: string; keys: { p256dh: string; auth: string } }) => Promise<{ ok?: boolean; error?: string }>;
type Remove = (endpoint: string) => Promise<unknown>;

const b64ToBytes = (b64: string) => {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};

const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
const isStandalone = () => window.matchMedia("(display-mode: standalone)").matches || (navigator as any).standalone === true;

/**
 * "Turn on notifications" for this phone. Asks permission, subscribes to push
 * and saves the subscription through the server action it's given.
 */
export function PushToggle({ publicKey, save, remove, tone = "light" }: { publicKey: string | null; save: Save; remove: Remove; tone?: "light" | "dark" }) {
  const [state, setState] = useState<"loading" | "unsupported" | "ios-install" | "denied" | "off" | "on" | "busy">("loading");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      if (!publicKey || !("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
        setState(isIos() && !isStandalone() ? "ios-install" : "unsupported");
        return;
      }
      if (Notification.permission === "denied") return setState("denied");
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        // Re-save in case this phone was last used by someone else.
        const j = sub.toJSON() as any;
        await save({ endpoint: j.endpoint, keys: j.keys }).catch(() => undefined);
        setState("on");
      } else setState("off");
    })().catch(() => setState("unsupported"));
  }, [publicKey, save]);

  async function turnOn() {
    setError(null);
    setState("busy");
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") return setState(perm === "denied" ? "denied" : "off");
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(publicKey!) });
      const j = sub.toJSON() as any;
      const res = await save({ endpoint: j.endpoint, keys: j.keys });
      if (res?.error) {
        setError(res.error);
        return setState("off");
      }
      setState("on");
    } catch {
      setError("Couldn't turn on notifications on this phone.");
      setState("off");
    }
  }

  async function turnOff() {
    setState("busy");
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await remove(sub.endpoint);
        await sub.unsubscribe();
      }
    } finally {
      setState("off");
    }
  }

  const dark = tone === "dark";
  const box = "flex items-center justify-between gap-3 rounded-[14px] border px-4 py-3 " + (dark ? "border-white/15 bg-white/5 text-white" : "border-hair bg-white");
  const sub = "text-[12.5px] " + (dark ? "text-white/60" : "text-ink-2");

  if (state === "loading") return null;
  return (
    <div className={box}>
      <span className="min-w-0">
        <b className="block text-[14px]">Notifications</b>
        <span className={sub}>
          {state === "on" && "On for this phone."}
          {state === "off" && "Get an alert on this phone the moment something needs you."}
          {state === "busy" && "One moment…"}
          {state === "denied" && "Blocked. Allow notifications for this site in your phone's settings."}
          {state === "unsupported" && "This browser can't show notifications. Use Chrome on Android, or Safari on iPhone."}
          {state === "ios-install" && "On iPhone, first add this app to your Home Screen (Share → Add to Home Screen), then open it from there."}
          {error && <span className="block text-[#9c3326]">{error}</span>}
        </span>
      </span>
      {(state === "off" || state === "on" || state === "busy") && (
        <button
          type="button"
          role="switch"
          aria-checked={state === "on"}
          aria-label={state === "on" ? "Notifications on. Turn off" : "Notifications off. Turn on"}
          onClick={state === "on" ? turnOff : turnOn}
          disabled={state === "busy"}
          className="inline-flex min-h-[44px] shrink-0 items-center rounded-full px-1 disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1f7a4d]/40"
        >
          <Switch on={state === "on"} dark={dark} />
        </button>
      )}
    </div>
  );
}
