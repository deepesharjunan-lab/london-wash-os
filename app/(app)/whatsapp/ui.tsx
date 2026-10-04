"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useFormState, useFormStatus } from "react-dom";
import { sendReplyAction, type ReplyState } from "./actions";

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

function SendButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={disabled || pending}
      className="shrink-0 rounded-md bg-[#1f7a4d] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#19663f] disabled:opacity-50"
    >
      {pending ? "Sending…" : "Send"}
    </button>
  );
}

export function Composer({ waId, blockedReason }: { waId: string; blockedReason: string | null }) {
  const [state, action] = useFormState<ReplyState, FormData>(sendReplyAction, {});
  const formRef = useRef<HTMLFormElement>(null);
  const boxRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (state.sentAt) {
      formRef.current?.reset();
      boxRef.current?.focus();
    }
  }, [state.sentAt]);

  return (
    <form ref={formRef} action={action} className="border-t border-black/10 bg-[#fbf7ef] p-3">
      <input type="hidden" name="wa_id" value={waId} />
      {blockedReason && <p className="mb-2 rounded-md bg-[#fdf0dc] px-3 py-2 text-[12.5px] text-[#8a5a12]">{blockedReason}</p>}
      {state.error && <p className="mb-2 rounded-md bg-[#f6e4df] px-3 py-2 text-[12.5px] text-[#9c3326]">{state.error}</p>}
      <div className="flex items-end gap-2">
        <textarea
          ref={boxRef}
          name="body"
          rows={2}
          maxLength={4000}
          disabled={!!blockedReason}
          placeholder={blockedReason ? "Replies are closed for this chat" : "Type a reply… (Enter to send, Shift+Enter for a new line)"}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              if (e.currentTarget.value.trim()) formRef.current?.requestSubmit();
            }
          }}
          className="min-h-[44px] flex-1 resize-y border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-accent disabled:bg-black/5"
        />
        <SendButton disabled={!!blockedReason} />
      </div>
      <p className="mt-1.5 text-[11.5px] text-ink/45">Sent from The London Wash WhatsApp number. Your name is saved with the message for the team, not shown to the customer.</p>
    </form>
  );
}
