"use client";
import { useEffect } from "react";

/**
 * Opens the browser print dialog automatically once this print-preview page
 * has rendered. Staff can still cancel and use the on-screen "Print" button
 * (browser's own reprint) at any time afterwards.
 */
export function PrintOnLoad() {
  useEffect(() => {
    const t = setTimeout(() => window.print(), 200);
    return () => clearTimeout(t);
  }, []);
  return null;
}
