"use client";

import { useFormState, useFormStatus } from "react-dom";
import { staffLoginAction } from "../actions";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex min-h-[52px] w-full items-center justify-center rounded-full bg-[#efe8da] text-[15px] font-semibold text-[#15213a] disabled:opacity-60"
    >
      {pending ? "Signing in…" : "Sign in"}
    </button>
  );
}

const field =
  "w-full min-h-[52px] rounded-xl border border-white/15 bg-white/5 px-4 text-[16px] text-white outline-none placeholder:text-white/35 focus:border-[#c7b58f] focus:ring-2 focus:ring-[#c7b58f]/30";

export default function StaffLoginForm() {
  const [state, action] = useFormState(staffLoginAction, {});
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <label className="flex flex-col gap-1.5">
        <span className="text-[12px] font-semibold uppercase tracking-[0.12em] text-white/55">Mobile number</span>
        <span className="flex gap-2">
          <span className="grid min-h-[52px] w-[70px] shrink-0 place-items-center rounded-xl border border-white/15 bg-white/5 font-semibold text-white">+91</span>
          <input
            className={field}
            name="phone"
            inputMode="numeric"
            autoComplete="tel-national"
            maxLength={14}
            defaultValue={state.phone ?? ""}
            aria-invalid={state.error ? true : undefined}
            aria-describedby={state.error ? "login-error" : undefined}
            required
          />
        </span>
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-[12px] font-semibold uppercase tracking-[0.12em] text-white/55">PIN</span>
        <input
          className={field + " text-center font-mono text-[22px] tracking-[0.5em]"}
          name="pin"
          type="password"
          inputMode="numeric"
          autoComplete="current-password"
          maxLength={6}
          aria-invalid={state.error ? true : undefined}
          aria-describedby={state.error ? "login-error" : undefined}
          required
        />
      </label>
      {state.error && (
        <p id="login-error" role="alert" className="rounded-xl bg-[#9c3326]/25 px-4 py-3 text-[13.5px] leading-snug text-[#ffd9d2]">
          {state.error}
        </p>
      )}
      <Submit />
    </form>
  );
}
