"use client";

import { useFormState, useFormStatus } from "react-dom";
import { signIn } from "./actions";
import { useSearchParams } from "next/navigation";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:brightness-110 disabled:opacity-60"
    >
      {pending ? "Signing in..." : "Sign in"}
    </button>
  );
}

export default function LoginPage() {
  const [state, formAction] = useFormState(signIn, undefined);
  const searchParams = useSearchParams();
  const next = searchParams.get("next") || "/dashboard";

  return (
    <main className="flex min-h-screen items-center justify-center bg-sidebar px-4">
      <div className="w-full max-w-sm rounded-xl border border-white/10 bg-[#26221f] p-8 shadow-xl">
        <div className="mb-6 flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-accent" />
          <span className="font-archivo text-lg font-extrabold tracking-tight text-white">
            The London Wash
          </span>
        </div>
        <h1 className="mb-1 text-xl font-extrabold text-white">Sign in</h1>
        <p className="mb-6 text-sm text-white/50">Admin console &middot; staff access only</p>

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
              className="w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-accent"
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
              className="w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-accent"
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
      </div>
    </main>
  );
}
