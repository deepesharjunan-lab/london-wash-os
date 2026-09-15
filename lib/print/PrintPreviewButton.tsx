"use client";

import { useRef, useState } from "react";

/**
 * Opens a printable page (invoice or garment tags) in an in-page lightbox
 * instead of a new browser tab. The iframe loads the standalone print
 * route (no sidebar/header - see app/(print)/layout.tsx), so the "Print"
 * button below prints only that document, not the surrounding console.
 */
export function PrintPreviewButton({
  label,
  url,
  className,
}: {
  label: string;
  url: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  function openModal() {
    setLoaded(false);
    setOpen(true);
  }

  function closeModal() {
    setOpen(false);
  }

  function handlePrint() {
    const win = iframeRef.current?.contentWindow;
    if (!win) return;
    win.focus();
    win.print();
  }

  return (
    <>
      <button type="button" onClick={openModal} className={className}>
        {label}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={closeModal}
          role="dialog"
          aria-modal="true"
          aria-label={label}
        >
          <div
            className="flex max-h-[92vh] w-full max-w-[420px] flex-col overflow-hidden rounded-lg bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-black/10 px-4 py-3">
              <div className="text-sm font-semibold text-ink">{label}</div>
              <button
                type="button"
                onClick={closeModal}
                aria-label="Close"
                className="grid h-6 w-6 place-items-center rounded text-ink/40 transition hover:bg-black/5 hover:text-ink"
              >
                &times;
              </button>
            </div>

            <div className="relative flex-1 overflow-auto bg-black/5">
              {!loaded && (
                <div className="absolute inset-0 grid place-items-center text-xs font-medium text-ink/40">
                  Loading preview...
                </div>
              )}
              <iframe
                ref={iframeRef}
                src={url}
                title={label}
                onLoad={() => setLoaded(true)}
                className="h-[70vh] w-full border-0 bg-white"
              />
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-black/10 px-4 py-3">
              <button
                type="button"
                onClick={closeModal}
                className="rounded-md border border-black/10 px-3 py-1.5 text-xs font-semibold text-ink/70 transition hover:bg-black/5"
              >
                Close
              </button>
              <button
                type="button"
                onClick={handlePrint}
                className="rounded-md bg-accent px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:brightness-110"
              >
                Print
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
