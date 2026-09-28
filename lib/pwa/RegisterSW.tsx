"use client";

import { useEffect } from "react";

/** Registers the service worker that shows push notifications and makes the apps installable. */
export function RegisterSW() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch((e) => console.warn("service worker", e));
  }, []);
  return null;
}
