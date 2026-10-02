"use client";

import { Suspense } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { signIn } from "./actions";
import { useSearchParams } from "next/navigation";
import { Logo } from "@/lib/brand/Logo";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-full bg-[#efe8da] px-4 py-3 text-sm font-semibold text-navy shadow-sm transition hover:bg-white disabled:opacity-60"
    >
      {pending ? "Signing in..." : "Sign in"}
    </button>
  );
}

function LoginForm() {
  const [state, formAction] = useFormState(signIn, undefined);
  const searchParams = useSearchParams();
  const next = searchParams.get("next") || "/dashboard";

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="next" value={next} />
      <div>
        <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-white/50">
          Email
        </label>
        <input
          type="email"
          name="email"
          required
          autoComplete="username"
          className="w-full rounded-[10px] border border-white/15 bg-white/5 px-3 py-2.5 text-sm text-white outline-none focus:border-brass-2 focus:ring-2 focus:ring-brass-2/30"
          placeholder="you@thelondonwash.com"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-white/50">
          Password
        </label>
        <input
          type="password"
          name="password"
          required
          autoComplete="current-password"
          className="w-full rounded-[10px] border border-white/15 bg-white/5 px-3 py-2.5 text-sm text-white outline-none focus:border-brass-2 focus:ring-2 focus:ring-brass-2/30"
          placeholder="********"
        />
      </div>

      {state?.error && (
        <p className="rounded-md bg-red-500/10 px-3 py-2 text-sm text-red-400">
          {state.error}
        </p>
      )}

      <SubmitButton />
    </form>
  );
}

export default function LoginPage() {
  return (
    <main className="lw-login flex min-h-screen items-center justify-center bg-[radial-gradient(90%_60%_at_50%_35%,#1e2d4d_0%,#101828_70%)] px-4">
      <div className="w-full max-w-sm rounded-[20px] border border-white/10 bg-[#141d31]/90 p-8 shadow-[0_40px_90px_-40px_rgba(0,0,0,0.8)]">
        <Logo tone="light" className="mb-8 h-auto w-[230px]" />
        <h1 className="mb-1 font-display text-[30px] font-medium leading-tight text-[#efe8da]">Sign in</h1>
        <p className="mb-6 text-sm text-white/50">Operations console &middot; staff access only</p>

        <Suspense fallback={<div className="text-sm text-white/40">Loading...</div>}>
          <LoginForm />
        </Suspense>
      </div>
    </main>
  );
}
