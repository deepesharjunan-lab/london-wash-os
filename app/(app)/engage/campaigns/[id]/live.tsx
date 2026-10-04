"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * While a campaign is sending (or due to start), keeps the sender going in
 * short rounds and refreshes the numbers. The background sender also runs every
 * minute, so closing this page only slows things down; it never stops a campaign.
 */
export function LivePump({ active }: { active: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    let stop = false;
    (async () => {
      while (!stop) {
        try {
          await fetch("/api/public/engage/pump?quick=1", { cache: "no-store" });
        } catch {
          // the background sender will carry on
        }
        if (stop) break;
        router.refresh();
        await new Promise((r) => setTimeout(r, 2500));
      }
    })();
    return () => {
      stop = true;
    };
  }, [active, router]);
  return null;
}
