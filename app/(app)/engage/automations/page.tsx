import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { AUTOMATION_COLS, type Automation } from "@/lib/engage/automations";
import { describeWhen, RECIPES } from "@/lib/engage/automation-defs";
import { toggleAutomationAction } from "./actions";
import { ToggleButton } from "@/lib/ui/Toggle";

// ENGAGE → Automations: messages that send themselves, with 30-day numbers,
// plus ready-made recipes to start from.

export const dynamic = "force-dynamic";

export default async function AutomationsPage({ searchParams }: { searchParams: { error?: string } }) {
  const db = createAdminClient();
  const since = new Date(Date.now() - 30 * 864e5).toISOString();
  const [{ data, error }, { data: runs }] = await Promise.all([
    db.from("engage_automation").select(AUTOMATION_COLS).order("created_at"),
    db.from("engage_automation_run").select("automation_id, status, replied_at").gte("created_at", since).limit(50000),
  ]);
  const autos = (data ?? []) as Automation[];
  const stats = new Map<string, Record<string, number>>();
  for (const r of (runs ?? []) as { automation_id: string; status: string; replied_at: string | null }[]) {
    const s = stats.get(r.automation_id) ?? {};
    const k = ["sent", "delivered", "read"].includes(r.status) ? "sent" : r.status === "sending" ? "queued" : r.status;
    s[k] = (s[k] ?? 0) + 1;
    if (r.status === "read") s.read_ = (s.read_ ?? 0) + 1;
    if (r.replied_at) s.replied = (s.replied ?? 0) + 1;
    stats.set(r.automation_id, s);
  }
  const used = new Set(autos.map((a) => `${a.trigger}|${a.template_name}`));
  const recipes = RECIPES.filter((r) => !used.has(`${r.trigger}|${r.template}`));

  return (
    <div>
      <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-accent">Engage</div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-archivo text-2xl font-extrabold text-ink">Automations</h1>
        <Link href="/engage/automations/new" className="rounded-md bg-[#1f7a4d] px-4 py-2 text-sm font-semibold text-white hover:bg-[#19663f]">
          + New automation
        </Link>
      </div>
      <p className="mb-5 max-w-3xl text-sm text-ink/60">
        WhatsApp messages that send themselves: an invoice link after every order, order updates, reminders and win-backs. Each one waits as long as you set, checks its
        condition just before sending, and respects quiet hours and STOP.
      </p>
      {searchParams.error && <p className="mb-4 rounded-md bg-[#f6e4df] px-3 py-2 text-[13px] text-[#9c3326]">{searchParams.error}</p>}
      {error && (
        <p className="mb-4 rounded-md bg-[#fdf0dc] px-3 py-2 text-[13px] text-[#8a5a12]">
          Automations aren't set up in the database yet. Run the database update (2026-10-05_engage_automations.sql) in Supabase.
        </p>
      )}

      {autos.length > 0 && (
        <section className="mb-8 overflow-x-auto border-2 border-black/10 bg-white">
          <table className="w-full min-w-[820px] text-sm">
            <thead>
              <tr className="border-b-2 border-black/10 text-left text-[11px] uppercase tracking-wide text-ink/50">
                <th className="px-4 py-2.5">Automation</th>
                <th className="px-4 py-2.5">Status</th>
                <th className="px-4 py-2.5 text-right">Sent (30 days)</th>
                <th className="px-4 py-2.5 text-right">Read</th>
                <th className="px-4 py-2.5 text-right">Replied</th>
                <th className="px-4 py-2.5 text-right">Waiting</th>
                <th className="px-4 py-2.5 text-right">Skipped / failed</th>
              </tr>
            </thead>
            <tbody>
              {autos.map((a) => {
                const s = stats.get(a.id) ?? {};
                return (
                  <tr key={a.id} className="border-b border-black/5 last:border-0">
                    <td className="px-4 py-3">
                      <Link href={`/engage/automations/${a.id}`} className="font-medium text-ink hover:underline">
                        {a.name}
                      </Link>
                      <div className="text-[12px] text-ink/50">
                        {describeWhen(a)} · {a.template_name}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <form action={toggleAutomationAction}>
                        <input type="hidden" name="id" value={a.id} />
                        <input type="hidden" name="on" value={a.active ? "0" : "1"} />
                        <ToggleButton on={a.active} label={a.name} />
                      </form>
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-ink">{(s.sent ?? 0).toLocaleString("en-IN")}</td>
                    <td className="px-4 py-3 text-right text-ink/75">{(s.read_ ?? 0).toLocaleString("en-IN")}</td>
                    <td className="px-4 py-3 text-right text-ink/75">{(s.replied ?? 0).toLocaleString("en-IN")}</td>
                    <td className="px-4 py-3 text-right text-ink/75">{(s.queued ?? 0).toLocaleString("en-IN")}</td>
                    <td className={`px-4 py-3 text-right ${s.failed ? "text-[#9c3326]" : "text-ink/45"}`}>
                      {(s.skipped ?? 0).toLocaleString("en-IN")} / {(s.failed ?? 0).toLocaleString("en-IN")}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}

      {recipes.length > 0 && (
        <>
          <h2 className="mb-1 font-archivo text-lg font-bold text-ink">Start from a recipe</h2>
          <p className="mb-3 text-[13px] text-ink/55">Each sets everything up; recipes with a new message create the WhatsApp template for you in one click.</p>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {recipes.map((r) => (
              <Link key={r.key} href={`/engage/automations/new?recipe=${r.key}`} className="block border-2 border-black/10 bg-white p-4 transition hover:border-navy/30">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-ink">{r.title}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${r.newTemplate?.category === "MARKETING" ? "bg-[#fdf0dc] text-[#8a5a12]" : "bg-[#e2eee7] text-[#2c6a4e]"}`}>
                    {r.newTemplate?.category === "MARKETING" ? "marketing" : "utility"}
                  </span>
                </div>
                <p className="mt-1 text-[13px] text-ink/60">{r.blurb}</p>
                <p className="mt-2 text-[12px] text-ink/45">{r.newTemplate ? "Creates a new template" : `Uses ${r.template} (already approved)`}</p>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
