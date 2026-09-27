import Link from "next/link";

const TABS = [
  { href: "/club", label: "Overview" },
  { href: "/club/rules", label: "Rules" },
  { href: "/club/tiers", label: "Tiers & benefits" },
  { href: "/club/rewards", label: "Rewards" },
  { href: "/club/campaigns", label: "Campaigns" },
  { href: "/club/automations", label: "Automations" },
];

export function ClubHeader({
  current,
  title,
  sub,
  saved,
}: {
  current: string;
  title: string;
  sub?: string;
  saved?: string;
}) {
  return (
    <div className="mb-6 space-y-4">
      <div>
        <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-accent">The London Wash Club</div>
        <h1 className="text-ink">{title}</h1>
        {sub && <p className="mt-2 max-w-3xl text-sm text-ink-2">{sub}</p>}
      </div>
      <nav className="flex gap-1 overflow-x-auto border-b border-hair" aria-label="Loyalty Club">
        {TABS.map((t) => {
          const active = t.href === current;
          return (
            <Link
              key={t.href}
              href={t.href}
              aria-current={active ? "page" : undefined}
              className={
                "-mb-px whitespace-nowrap border-b-2 px-3 py-2.5 text-[13.5px] font-semibold transition " +
                (active ? "border-navy text-ink" : "border-transparent text-ink-3 hover:text-ink")
              }
            >
              {t.label}
            </Link>
          );
        })}
      </nav>
      {saved && (
        <div role="status" className="rounded-xl bg-[#e2eee7] px-4 py-3 text-[13px] font-medium text-[#2c6a4e]">
          {saved}
        </div>
      )}
    </div>
  );
}

export function Card({ title, sub, children, action }: { title?: string; sub?: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="border border-black/10 bg-white">
      {(title || action) && (
        <div className="flex flex-wrap items-end justify-between gap-3 px-5 pb-2 pt-4">
          <div>
            {title && <h2 className="text-[15px] font-semibold text-ink">{title}</h2>}
            {sub && <p className="mt-0.5 text-[12.5px] text-ink-2">{sub}</p>}
          </div>
          {action}
        </div>
      )}
      <div className="px-5 pb-5 pt-2">{children}</div>
    </section>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[12.5px] font-semibold text-ink-2">{label}</span>
      {children}
      {hint && <span className="text-[11.5px] text-ink-3">{hint}</span>}
    </label>
  );
}

export const inputCls = "w-full border border-black/10 px-3 py-2 text-[13.5px] text-ink";
export const btnPrimary = "bg-slate-900 px-5 py-2 text-[13px] font-semibold text-white hover:brightness-110";
export const btnSecondary = "rounded-full border border-hair-2 bg-white px-4 py-1.5 text-[12.5px] font-semibold text-ink hover:bg-beige";

export function Kpi({ label, value, note, color }: { label: string; value: string; note?: string; color?: string }) {
  return (
    <div className="border border-black/10 bg-white px-4 py-3.5" style={color ? { borderTop: `3px solid ${color}` } : undefined}>
      <div className="text-[12px] font-medium text-ink-2">{label}</div>
      <div className="mt-1 text-[24px] font-bold leading-tight tabular-nums text-ink">{value}</div>
      {note && <div className="mt-0.5 text-[12px] text-ink-3">{note}</div>}
    </div>
  );
}

export function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    live: "bg-[#e2eee7] text-[#2c6a4e]",
    on: "bg-[#e2eee7] text-[#2c6a4e]",
    active: "bg-[#e2eee7] text-[#2c6a4e]",
    scheduled: "bg-[#e2e9f2] text-[#2b5584]",
    draft: "bg-beige text-ink-2",
    off: "bg-beige text-ink-2",
    paused: "bg-[#f5ebd9] text-[#8a5a12]",
    ended: "bg-beige text-ink-3",
  };
  const label: Record<string, string> = { live: "Live", on: "On", active: "Active", scheduled: "Scheduled", draft: "Draft", off: "Off", paused: "Paused", ended: "Ended" };
  return (
    <span className={"inline-flex rounded-full px-2.5 py-0.5 text-[10.5px] font-bold uppercase tracking-wide " + (map[status] || "bg-beige text-ink-2")}>
      {label[status] || status}
    </span>
  );
}
