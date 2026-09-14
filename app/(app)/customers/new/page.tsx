"use client";

import { useFormState, useFormStatus } from "react-dom";
import Link from "next/link";
import { createCustomer } from "./actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:brightness-110 disabled:opacity-60"
    >
      {pending ? "Saving..." : "Save customer"}
    </button>
  );
}

export default function NewCustomerPage() {
  const [state, formAction] = useFormState(createCustomer, undefined);

  return (
    <div>
      <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-accent">Customers</div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="font-archivo text-2xl font-extrabold text-ink">New customer</h1>
        <Link href="/customers" className="text-sm font-medium text-ink/60 hover:text-accent">
          &larr; Back to customers
        </Link>
      </div>

      <form
        action={formAction}
        className="max-w-xl space-y-4 border-2 border-black/10 bg-white p-6"
      >
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-ink/50">
              Full name
            </label>
            <input
              name="full_name"
              required
              className="w-full border border-black/10 px-3 py-2 text-sm outline-none focus:border-accent"
              placeholder="e.g. Anjali Menon"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-ink/50">
              Phone
            </label>
            <input
              name="phone"
              required
              className="w-full border border-black/10 px-3 py-2 text-sm outline-none focus:border-accent"
              placeholder="+91 98765 43210"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-ink/50">
              Email (optional)
            </label>
            <input
              name="email"
              type="email"
              className="w-full border border-black/10 px-3 py-2 text-sm outline-none focus:border-accent"
              placeholder="name@example.com"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-ink/50">
              Tier
            </label>
            <select
              name="tier"
              defaultValue="Silver"
              className="w-full border border-black/10 px-3 py-2 text-sm outline-none focus:border-accent"
            >
              <option value="Silver">Silver</option>
              <option value="Gold">Gold</option>
              <option value="Platinum">Platinum</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-ink/50">
              Fold preference (optional)
            </label>
            <input
              name="fold_preference"
              className="w-full border border-black/10 px-3 py-2 text-sm outline-none focus:border-accent"
              placeholder="e.g. Standard fold"
            />
          </div>
          <div className="col-span-2">
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-ink/50">
              Detergent preference (optional)
            </label>
            <input
              name="detergent_preference"
              className="w-full border border-black/10 px-3 py-2 text-sm outline-none focus:border-accent"
              placeholder="e.g. Fragrance-free"
            />
          </div>
        </div>

        {state?.error && (
          <p className="border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">{state.error}</p>
        )}

        <div className="flex items-center gap-3 pt-2">
          <SubmitButton />
          <Link href="/customers" className="text-sm font-medium text-ink/60 hover:text-ink">
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
