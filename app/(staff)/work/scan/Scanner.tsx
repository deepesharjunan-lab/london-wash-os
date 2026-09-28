"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { scanLookupAction, stageAction, type ScanResult } from "../actions";

type Controls = { stop: () => void };

const time = (iso: string | null) =>
  iso ? new Date(iso).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" }) : "";

function beep(ok: boolean) {
  try {
    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    const ctx = new Ctx();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.value = ok ? 880 : 220;
    g.gain.value = 0.08;
    o.connect(g).connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + 0.12);
    setTimeout(() => ctx.close().catch(() => undefined), 400);
    if (navigator.vibrate) navigator.vibrate(ok ? 40 : [60, 40, 60]);
  } catch {}
}

/**
 * Camera barcode scanner (Code 128 garment tags, and QR) with a typed
 * fallback. Hardware scanners that type the code and press Enter work in the
 * text box too. After each scan it shows the garment and what you can do.
 */
export function Scanner() {
  const video = useRef<HTMLVideoElement>(null);
  const controls = useRef<Controls | null>(null);
  const lastCode = useRef<{ code: string; at: number } | null>(null);
  const looking = useRef(false);
  const unmounted = useRef(false);
  const [camera, setCamera] = useState<"off" | "starting" | "on" | "error">("off");
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [manual, setManual] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ScanResult | null>(null);

  const stopCamera = useCallback(() => {
    controls.current?.stop();
    controls.current = null;
    setCamera("off");
  }, []);

  const lookUp = useCallback(
    async (code: string) => {
      const clean = code.replace(/\D/g, "");
      if (!clean) return;
      const now = Date.now();
      if (looking.current) return;
      // The same tag stays in view for a while; don't look it up (or beep) again.
      if (lastCode.current && lastCode.current.code === clean && now - lastCode.current.at < 10000) return;
      lastCode.current = { code: clean, at: now };
      looking.current = true;
      setBusy(true);
      try {
        const res = await scanLookupAction(clean);
        beep(res.ok);
        setResult(res);
        if (res.ok) stopCamera();
      } finally {
        looking.current = false;
        setBusy(false);
      }
    },
    [stopCamera]
  );

  const startCamera = useCallback(async () => {
    setCameraError(null);
    setCamera("starting");
    try {
      const [{ BrowserMultiFormatReader }, { BarcodeFormat, DecodeHintType }] = await Promise.all([import("@zxing/browser"), import("@zxing/library")]);
      const hints = new Map();
      hints.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.CODE_128, BarcodeFormat.QR_CODE]);
      hints.set(DecodeHintType.TRY_HARDER, true);
      const reader = new BrowserMultiFormatReader(hints, { delayBetweenScanAttempts: 120 });
      if (!video.current || unmounted.current) return;
      const ctrl = await reader.decodeFromConstraints(
        { video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } } },
        video.current,
        (res) => {
          if (res) lookUp(res.getText());
        }
      );
      if (unmounted.current) {
        ctrl.stop(); // left the page while the camera was starting
        return;
      }
      controls.current?.stop();
      controls.current = ctrl;
      setCamera("on");
    } catch (e: any) {
      setCamera("error");
      setCameraError(
        e?.name === "NotAllowedError"
          ? "Camera is blocked. Allow the camera for this app in your phone's settings, or type the tag number below."
          : "Couldn't start the camera. Type the tag number below instead."
      );
    }
  }, [lookUp]);

  useEffect(() => {
    unmounted.current = false;
    startCamera();
    return () => {
      unmounted.current = true;
      controls.current?.stop();
      controls.current = null;
    };
  }, [startCamera]);

  async function act(action: "start" | "finish" | "skip") {
    if (!result?.ok || !result.garment.stageId) return;
    setBusy(true);
    try {
      const res = await stageAction({ garmentId: result.garment.id, stageId: result.garment.stageId, action });
      beep(res.ok);
      setResult(res);
    } finally {
      setBusy(false);
    }
  }

  function scanNext() {
    setResult(null);
    setManual("");
    lastCode.current = null;
    startCamera();
  }

  const g = result?.ok ? result.garment : null;
  return (
    <div className="flex flex-col gap-4">
      {/* The video stays mounted so the camera can restart instantly for the next garment. */}
      <div className={g ? "hidden" : "relative aspect-[4/3] overflow-hidden rounded-[18px] bg-[#0d1422]"}>
            <video ref={video} className="h-full w-full object-cover" muted playsInline />
            {camera === "on" && (
              <div className="pointer-events-none absolute inset-x-[12%] top-1/2 h-[34%] -translate-y-1/2 rounded-xl border-2 border-[#e3d2ac]/80 shadow-[0_0_0_9999px_rgba(0,0,0,.35)]">
                <div className="absolute inset-x-3 top-1/2 h-0.5 -translate-y-1/2 animate-pulse bg-[#e3d2ac]/80" />
              </div>
            )}
            {camera !== "on" && (
              <div className="absolute inset-0 grid place-items-center p-6 text-center text-[13.5px] text-white/75">
                {camera === "starting" ? "Starting camera…" : cameraError ?? (
                  <button type="button" onClick={startCamera} className="rounded-full bg-[#efe8da] px-5 py-3 text-[15px] font-semibold text-[#15213a]">
                    Start camera
                  </button>
                )}
              </div>
            )}
      </div>
      {!g && (
        <>
          <p className="text-center text-[13px] text-ink-2">Point the camera at the barcode on the garment tag.</p>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              lastCode.current = null;
              looking.current = false;
              lookUp(manual);
            }}
          >
            <input
              value={manual}
              onChange={(e) => setManual(e.target.value)}
              inputMode="numeric"
              placeholder="Or type the tag number"
              aria-label="Tag number"
              className="min-h-[52px] w-full rounded-xl border border-hair-2 bg-white px-3.5 text-[16px] outline-none focus:border-brass focus:ring-2 focus:ring-brass/30"
            />
            <button type="submit" disabled={busy || !manual.trim()} className="min-h-[52px] shrink-0 rounded-xl bg-navy px-5 text-[15px] font-semibold text-[#f8f5ef] disabled:opacity-40">
              Find
            </button>
          </form>
          {result && !result.ok && (
            <p role="alert" className="rounded-xl bg-[#f6e4df] px-4 py-3 text-[13.5px] text-[#9c3326]">
              {result.error}
            </p>
          )}
        </>
      )}

      {g && result?.ok && (
        <>
          {result.message && (
            <p role="status" className="rounded-xl bg-[#e2eee7] px-4 py-3 text-[14px] font-semibold text-[#2c6a4e]">
              {result.message}
            </p>
          )}
          <section className="flex flex-col gap-3 rounded-[16px] border border-hair bg-white p-4 shadow-[0_10px_28px_-16px_rgba(21,33,58,.22)]">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="font-mono text-[12px] tracking-[0.1em] text-ink-3">TAG {g.tag}</div>
                <div className="text-[19px] font-semibold leading-tight">{g.itemName}</div>
                <div className="text-[13px] text-ink-2">{g.serviceName}</div>
              </div>
              <span className="shrink-0 rounded-full bg-beige px-2.5 py-1 text-[12px] font-semibold text-ink-2">
                {g.piece} of {g.pieces}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-[13px]">
              <div className="rounded-xl bg-ivory px-3 py-2">
                <div className="text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-3">Order</div>
                <a href={`/work/orders/${g.orderId}`} className="font-semibold underline-offset-2 hover:underline">
                  {g.orderNumber}
                </a>
              </div>
              <div className="rounded-xl bg-ivory px-3 py-2">
                <div className="text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-3">Customer</div>
                <div className="truncate font-semibold">{g.customerName}</div>
              </div>
            </div>
            {g.notes && <p className="rounded-xl bg-[#f5ebd9] px-3 py-2 text-[13px] text-[#8a5a12]">Note: {g.notes}</p>}
            <div className="rounded-xl border border-hair px-3 py-2.5">
              <div className="text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-3">Now</div>
              <div className="text-[15px] font-semibold">
                {g.stageName ?? "—"}{" "}
                <span className={"text-[12.5px] font-semibold " + (g.state === "in_progress" ? "text-[#2b5584]" : "text-[#8a5a12]")}>
                  · {g.state === "in_progress" ? `in progress${g.startedBy ? ` (${g.mine ? "you" : g.startedBy}, since ${time(g.startedAt)})` : ""}` : "waiting"}
                </span>
              </div>
              {g.nextName && <div className="text-[12.5px] text-ink-2">Next: {g.nextName}</div>}
            </div>

            {result.allowed.reason && <p className="rounded-xl bg-[#e2e9f2] px-3 py-2.5 text-[13.5px] text-[#2b5584]">{result.allowed.reason}</p>}

            {result.allowed.actions.includes("start") && (
              <button type="button" disabled={busy} onClick={() => act("start")} className="min-h-[58px] rounded-full bg-navy text-[17px] font-semibold text-[#f8f5ef] disabled:opacity-50">
                {busy ? "Saving…" : `Start ${g.stageName}`}
              </button>
            )}
            {result.allowed.actions.includes("finish") && (
              <button type="button" disabled={busy} onClick={() => act("finish")} className="min-h-[58px] rounded-full bg-[#2c6a4e] text-[17px] font-semibold text-white disabled:opacity-50">
                {busy ? "Saving…" : `Finish ${g.stageName}`}
              </button>
            )}
            {result.allowed.actions.includes("skip") && (
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  if (confirm(`Skip ${g.stageName} for this garment? Use this only when it doesn't need this step.`)) act("skip");
                }}
                className="min-h-[44px] rounded-full border border-hair-2 text-[14px] font-semibold text-ink-2 disabled:opacity-50"
              >
                Doesn&apos;t need {g.stageName?.toLowerCase()} — skip
              </button>
            )}
          </section>
          <button type="button" onClick={scanNext} className="min-h-[54px] rounded-full border border-hair-2 bg-white text-[16px] font-semibold">
            Scan next garment
          </button>
        </>
      )}
    </div>
  );
}
