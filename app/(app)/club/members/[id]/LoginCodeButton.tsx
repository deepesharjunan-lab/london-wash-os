"use client";

import { useFormState, useFormStatus } from "react-dom";
import { createMemberLoginCode } from "../../actions";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="rounded-full border border-hair-2 bg-white px-4 py-1.5 text-[12.5px] font-semibold text-ink hover:bg-beige disabled:opacity-60">
      {pending ? "Creating…" : "Create app sign-in code"}
    </button>
  );
}

export default function LoginCodeButton({ customerId }: { customerId: string }) {
  const [state, action] = useFormState(createMemberLoginCode, {});
  return (
    <form action={action} className="flex flex-wrap items-center gap-3">
      <input type="hidden" name="customer_id" value={customerId} />
      <Submit />
      {state.code && (
        <span role="status" className="rounded-xl bg-beige px-3 py-1.5 text-[13px] text-ink">
          Code <b className="font-mono text-[16px] tracking-[0.2em]">{state.code}</b> · valid 15 minutes, one use. Give it to the customer only.
        </span>
      )}
      {state.error && <span role="alert" className="text-[13px] text-[#9c3326]">{state.error}</span>}
    </form>
  );
}
