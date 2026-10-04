"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useFormState } from "react-dom";
import { sendReplyAction, type ReplyState } from "./actions";
import { webmOpusToOgg } from "./ogg";

/** Re-loads the inbox every few seconds while the tab is visible, so new messages appear. */
export function AutoRefresh({ seconds = 8 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, seconds * 1000);
    return () => clearInterval(t);
  }, [router, seconds]);
  return null;
}

/** Keeps the conversation box scrolled to the newest message when it changes (the page itself doesn't move). */
export function ScrollToEnd({ marker }: { marker: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const box = ref.current?.parentElement;
    if (box) box.scrollTop = box.scrollHeight;
  }, [marker]);
  return <div ref={ref} />;
}

/* ------------------------------------------------------------------ */
/* Showing photos, videos, voice notes and documents                   */
/* ------------------------------------------------------------------ */

export function MediaView({ id, kind, mime, name }: { id: string; kind: string; mime: string | null; name: string | null }) {
  const [failed, setFailed] = useState(false);
  const src = `/whatsapp/media/${encodeURIComponent(id)}`;
  if (failed) {
    return <p className="text-[12.5px] italic text-ink/50">This file is no longer available (WhatsApp keeps files for about 30 days).</p>;
  }
  if (kind === "image" || kind === "sticker") {
    return (
      <a href={src} target="_blank" rel="noreferrer" className="block">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={kind === "sticker" ? "Sticker" : "Photo"}
          loading="lazy"
          onError={() => setFailed(true)}
          className={kind === "sticker" ? "h-28 w-28 object-contain" : "max-h-72 max-w-full rounded-md bg-black/5 object-contain"}
        />
      </a>
    );
  }
  if (kind === "video") return <video src={src} controls preload="metadata" onError={() => setFailed(true)} className="max-h-72 max-w-full rounded-md bg-black" />;
  if (kind === "audio") return <audio src={src} controls preload="metadata" onError={() => setFailed(true)} className="w-64 max-w-full" />;
  const label = name || (mime?.includes("pdf") ? "Document.pdf" : "Document");
  return (
    <div className="flex items-center gap-3 rounded-md border border-black/10 bg-white/70 px-3 py-2">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded bg-[#e8eef5] text-[11px] font-bold uppercase text-[#2c4a6a]">
        {(label.split(".").pop() || "file").slice(0, 4)}
      </span>
      <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-ink">{label}</span>
      <a href={src} target="_blank" rel="noreferrer" className="shrink-0 text-[12.5px] font-medium text-accent hover:underline">
        Open
      </a>
      <a href={`${src}?download=1`} className="shrink-0 text-[12.5px] font-medium text-accent hover:underline">
        Save
      </a>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Reply box: text, attachments and voice messages                      */
/* ------------------------------------------------------------------ */

const MAX_BYTES = 4 * 1024 * 1024; // the server accepts uploads up to about 4.5 MB
const ACCEPT = "image/*,video/mp4,video/3gpp,audio/*,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt";

type Attachment = { blob: Blob; name: string; mime: string; url: string; kind: "image" | "video" | "audio" | "document" };

const kindOf = (mime: string): Attachment["kind"] =>
  mime.startsWith("image/") ? "image" : mime.startsWith("video/") ? "video" : mime.startsWith("audio/") ? "audio" : "document";
const sizeText = (n: number) => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);

/** Photos are resized to at most 1600 px and saved as JPEG (WhatsApp takes JPEG/PNG up to 5 MB). */
async function preparePhoto(file: File): Promise<Blob> {
  const keep = (file.type === "image/jpeg" || file.type === "image/png") && file.size <= 1.5 * 1024 * 1024;
  if (keep) return file;
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const g = canvas.getContext("2d")!;
  g.fillStyle = "#fff";
  g.fillRect(0, 0, canvas.width, canvas.height);
  g.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("resize failed"))), "image/jpeg", 0.82));
}

function pickRecorderType() {
  if (typeof MediaRecorder === "undefined") return null;
  for (const t of ["audio/ogg;codecs=opus", "audio/webm;codecs=opus", "audio/mp4"]) if (MediaRecorder.isTypeSupported(t)) return t;
  return "";
}

export function Composer({ waId, blockedReason }: { waId: string; blockedReason: string | null }) {
  const [state, action] = useFormState<ReplyState, FormData>(sendReplyAction, {});
  const [pending, startTransition] = useTransition();
  const [text, setText] = useState("");
  const [file, setFile] = useState<Attachment | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [recording, setRecording] = useState<{ started: number } | null>(null);
  const [now, setNow] = useState(Date.now());
  const fileInput = useRef<HTMLInputElement>(null);
  const boxRef = useRef<HTMLTextAreaElement>(null);
  const recorder = useRef<{ rec: MediaRecorder; stream: MediaStream; chunks: Blob[]; cancelled: boolean } | null>(null);

  const clearFile = () =>
    setFile((f) => {
      if (f) URL.revokeObjectURL(f.url);
      return null;
    });

  // After a successful send: empty the box.
  useEffect(() => {
    if (state.sentAt) {
      setText("");
      clearFile();
      boxRef.current?.focus();
    }
  }, [state.sentAt]);

  // Recording timer.
  useEffect(() => {
    if (!recording) return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [recording]);

  // Stop the microphone if the page goes away mid-recording.
  useEffect(() => () => recorder.current?.stream.getTracks().forEach((t) => t.stop()), []);

  async function attach(picked: File) {
    setLocalError(null);
    try {
      const kind = kindOf(picked.type || "");
      const blob = kind === "image" ? await preparePhoto(picked) : picked;
      if (blob.size > MAX_BYTES) {
        setLocalError(`That file is ${sizeText(blob.size)}. Files up to 4 MB can be sent from here; send bigger ones from the shop phone.`);
        return;
      }
      const mime = kind === "image" ? blob.type || "image/jpeg" : picked.type || "application/octet-stream";
      const name = kind === "image" && blob !== picked ? picked.name.replace(/\.[^.]+$/, "") + ".jpg" : picked.name;
      clearFile();
      setFile({ blob, name, mime, kind, url: URL.createObjectURL(blob) });
      boxRef.current?.focus();
    } catch {
      setLocalError("Couldn't read that file. Try a JPG or PNG photo, a PDF, or another file.");
    }
  }

  async function startRecording() {
    setLocalError(null);
    const type = pickRecorderType();
    if (type === null || !navigator.mediaDevices?.getUserMedia) {
      setLocalError("This browser can't record audio. Try Chrome, Edge or Safari.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = type ? new MediaRecorder(stream, { mimeType: type }) : new MediaRecorder(stream);
      const state = { rec, stream, chunks: [] as Blob[], cancelled: false };
      rec.ondataavailable = (e) => e.data.size && state.chunks.push(e.data);
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        recorder.current = null;
        setRecording(null);
        if (state.cancelled || !state.chunks.length) return;
        const recorded = new Blob(state.chunks, { type: rec.mimeType || type || "audio/webm" });
        let blob: Blob = recorded;
        let mime = recorded.type.split(";")[0];
        let ext = mime === "audio/mp4" ? "m4a" : "ogg";
        if (mime === "audio/webm") {
          const ogg = await webmOpusToOgg(recorded);
          if (!ogg) {
            setLocalError("Couldn't prepare the voice message. Please try again.");
            return;
          }
          blob = ogg;
          mime = "audio/ogg";
          ext = "ogg";
        }
        if (blob.size > MAX_BYTES) {
          setLocalError("That voice message is too long. Keep it under about 4 minutes.");
          return;
        }
        clearFile();
        setFile({ blob, name: `voice-message.${ext}`, mime, kind: "audio", url: URL.createObjectURL(blob) });
      };
      recorder.current = state;
      rec.start(500);
      setNow(Date.now());
      setRecording({ started: Date.now() });
    } catch {
      setLocalError("Microphone access was blocked. Allow the microphone for this site in the browser and try again.");
    }
  }

  function stopRecording(cancel: boolean) {
    const r = recorder.current;
    if (!r) return;
    r.cancelled = cancel;
    r.rec.stop();
  }

  function send() {
    if (pending || blockedReason || recording) return;
    if (!text.trim() && !file) return;
    const fd = new FormData();
    fd.set("wa_id", waId);
    fd.set("body", text);
    if (file) fd.set("file", new File([file.blob], file.name, { type: file.mime }));
    startTransition(() => action(fd));
  }

  const disabled = !!blockedReason;
  const secs = recording ? Math.floor((now - recording.started) / 1000) : 0;
  const error = localError ?? state.error;
  const iconBtn = "grid h-11 w-11 shrink-0 place-items-center rounded-md border border-black/10 bg-white text-ink/70 transition hover:border-navy/40 hover:text-ink disabled:opacity-40";

  return (
    <div className="border-t border-black/10 bg-[#fbf7ef] p-3">
      {blockedReason && <p className="mb-2 rounded-md bg-[#fdf0dc] px-3 py-2 text-[12.5px] text-[#8a5a12]">{blockedReason}</p>}
      {error && <p className="mb-2 rounded-md bg-[#f6e4df] px-3 py-2 text-[12.5px] text-[#9c3326]">{error}</p>}

      {file && (
        <div className="mb-2 flex items-center gap-3 rounded-md border border-black/10 bg-white p-2">
          {file.kind === "image" ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={file.url} alt="" className="h-14 w-14 rounded object-cover" />
          ) : file.kind === "audio" ? (
            <audio src={file.url} controls className="h-10 w-64 max-w-full" />
          ) : (
            <span className="grid h-14 w-14 place-items-center rounded bg-[#e8eef5] text-[11px] font-bold uppercase text-[#2c4a6a]">
              {file.kind === "video" ? "video" : (file.name.split(".").pop() || "file").slice(0, 4)}
            </span>
          )}
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-medium text-ink">{file.kind === "audio" ? "Voice message" : file.name}</span>
            <span className="text-[11.5px] text-ink/50">
              {sizeText(file.blob.size)}
              {file.kind === "audio" ? (text.trim() ? " · your text will follow as a separate message" : "") : " · the text below is sent as its caption"}
            </span>
          </span>
          <button type="button" onClick={clearFile} className="shrink-0 px-2 text-[20px] leading-none text-ink/40 hover:text-ink" aria-label="Remove attachment">
            ×
          </button>
        </div>
      )}

      {recording ? (
        <div className="flex items-center gap-3 rounded-md border border-[#e6b7ad] bg-white px-3 py-2">
          <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-[#c0392b]" />
          <span className="flex-1 text-[13.5px] font-medium text-ink">
            Recording… {Math.floor(secs / 60)}:{String(secs % 60).padStart(2, "0")}
          </span>
          <button type="button" onClick={() => stopRecording(true)} className="rounded-md px-3 py-1.5 text-[13px] text-ink/60 hover:text-ink">
            Cancel
          </button>
          <button type="button" onClick={() => stopRecording(false)} className="rounded-md bg-[#1f7a4d] px-4 py-1.5 text-[13px] font-semibold text-white">
            Stop
          </button>
        </div>
      ) : (
        <div className="flex items-end gap-2">
          <input
            ref={fileInput}
            type="file"
            accept={ACCEPT}
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) attach(f);
            }}
          />
          <button type="button" disabled={disabled || pending} onClick={() => fileInput.current?.click()} className={iconBtn} title="Attach a photo, video or document" aria-label="Attach a file">
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="m20 11.5-7.8 7.8a5 5 0 0 1-7.1-7.1l8.5-8.5a3.3 3.3 0 0 1 4.7 4.7l-8.5 8.5a1.7 1.7 0 0 1-2.4-2.4l7.8-7.8" />
            </svg>
          </button>
          <button type="button" disabled={disabled || pending} onClick={startRecording} className={iconBtn} title="Record a voice message" aria-label="Record a voice message">
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="9" y="3" width="6" height="11" rx="3" />
              <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" />
            </svg>
          </button>
          <textarea
            ref={boxRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={2}
            maxLength={4000}
            disabled={disabled}
            placeholder={
              disabled ? "Replies are closed for this chat" : file && file.kind !== "audio" ? "Add a caption (optional)…" : "Type a reply… (Enter to send, Shift+Enter for a new line)"
            }
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                send();
              }
            }}
            onPaste={(e) => {
              const pasted = [...e.clipboardData.files][0];
              if (pasted) {
                e.preventDefault();
                attach(pasted);
              }
            }}
            className="min-h-[44px] flex-1 resize-y border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-accent disabled:bg-black/5"
          />
          <button
            type="button"
            onClick={send}
            disabled={disabled || pending || (!text.trim() && !file)}
            className="h-11 shrink-0 rounded-md bg-[#1f7a4d] px-5 text-sm font-semibold text-white transition hover:bg-[#19663f] disabled:opacity-50"
          >
            {pending ? (file ? "Sending file…" : "Sending…") : "Send"}
          </button>
        </div>
      )}
      <p className="mt-1.5 text-[11.5px] text-ink/45">
        Sent from The London Wash WhatsApp number. Photos, videos, voice messages and documents up to 4 MB. Your name is saved for the team, not shown to the customer.
      </p>
    </div>
  );
}
