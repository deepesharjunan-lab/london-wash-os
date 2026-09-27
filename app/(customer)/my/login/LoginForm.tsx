"use client";

import { useFormState, useFormStatus } from "react-dom";
import { loginAction } from "../actions";

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex min-h-[52px] w-full items-center justify-center rounded-full bg-[#efe8da] text-[15px] font-semibold text-[#15213a] disabled:opacity-60"
    >
      {pending ? "Please wait…" : label}
    </button>
  );
}

const field =
  "w-full min-h-[52px] rounded-xl border border-white/15 bg-white/5 px-4 text-[16px] text-white outline-none placeholder:text-white/35 focus:border-[#c7b58f] focus:ring-2 focus:ring-[#c7b58f]/30";

export default function LoginForm() {
  const [state, action] = useFormState(loginAction, { step: "phone" as const });

  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      {state.step === "phone" ? (
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
      ) : (
        <>
          <input type="hidden" name="phone" value={state.phone ?? ""} />
          <p className="text-[14px] text-white/70">Code for +91 {state.phone}</p>
          <label className="flex flex-col gap-1.5">
            <span className="text-[12px] font-semibold uppercase tracking-[0.12em] text-white/55">6-digit code</span>
            <input
              className={field + " text-center font-mono text-[22px] tracking-[0.5em]"}
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              pattern="\d{6}"
              aria-invalid={state.error ? true : undefined}
              aria-describedby={state.error ? "login-error" : undefined}
              autoFocus
              required
            />
          </label>
        </>
      )}

      {state.message && !state.error && (
        <p role="status" className="rounded-xl bg-white/10 px-4 py-3 text-[13.5px] leading-snug text-white/85">
          {state.message}
        </p>
      )}
      {state.error && (
        <p id="login-error" role="alert" className="rounded-xl bg-[#9c3326]/25 px-4 py-3 text-[13.5px] leading-snug text-[#ffd9d2]">
          {state.error}
        </p>
      )}

      <Submit label={state.step === "phone" ? "Continue" : "Sign in"} />
      {state.step === "code" && (
        <button type="submit" name="restart" value="1" className="text-[14px] font-semibold text-white/70 underline-offset-4 hover:underline">
          Use a different number
        </button>
      )}
    </form>
  );
}
