"use client";

export function PrintButton() {
  return (
    <button type="button" onClick={() => window.print()} className="rounded-md border border-hair-2 bg-white px-4 py-3 text-ink">
      Save as PDF
    </button>
  );
}
