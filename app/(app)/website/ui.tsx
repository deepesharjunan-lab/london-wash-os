"use client";

import { useFormState, useFormStatus } from "react-dom";
import type { SaveState } from "./actions";

// Shared bits for the Website CMS pages.

export const box = "w-full border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-accent";
export const label = "mb-1 block text-[12px] font-semibold uppercase tracking-wide text-ink/55";

function SaveButton({ text }: { text: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="rounded-md bg-[#1f7a4d] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#19663f] disabled:opacity-50">
      {pending ? "Saving…" : text}
    </button>
  );
}

/** A form that saves with a server action and shows the result next to the button. */
export function SaveForm({
  action,
  children,
  saveText = "Save",
  className = "",
  sticky = false,
}: {
  action: (prev: SaveState, form: FormData) => Promise<SaveState>;
  children: React.ReactNode;
  saveText?: string;
  className?: string;
  sticky?: boolean;
}) {
  const [state, formAction] = useFormState<SaveState, FormData>(action, {});
  return (
    <form action={formAction} className={className}>
      {children}
      <div className={"mt-4 flex flex-wrap items-center gap-3 " + (sticky ? "sticky bottom-0 -mx-5 border-t border-black/10 bg-white/95 px-5 py-3 backdrop-blur" : "")}>
        <SaveButton text={saveText} />
        {state.ok && <span className="text-[13px] text-[#2c6a4e]">{state.ok}</span>}
        {state.error && <span className="text-[13px] text-[#9c3326]">{state.error}</span>}
      </div>
    </form>
  );
}
