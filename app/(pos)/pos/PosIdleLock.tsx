"use client";

import { useEffect } from "react";
import { lockPosAction } from "./lock-actions";

const IDLE_MS = 15 * 60 * 1000;

/** Locks the POS after 15 minutes without a tap, click or key press. */
export function PosIdleLock() {
  useEffect(() => {
    let timer = setTimeout(() => lockPosAction(), IDLE_MS);
    const reset = () => {
      clearTimeout(timer);
      timer = setTimeout(() => lockPosAction(), IDLE_MS);
    };
    const events = ["pointerdown", "keydown", "wheel", "touchstart"] as const;
    events.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    return () => {
      clearTimeout(timer);
      events.forEach((e) => window.removeEventListener(e, reset));
    };
  }, []);
  return null;
}
