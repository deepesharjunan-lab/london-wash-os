import Link from "next/link";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { automationTemplates, AUTOMATION_COLS, type Automation } from "@/lib/engage/automations";
import { describeWhen, RECIPES } from "@/lib/engage/automation-defs";
import { AutomationForm } from "../form";
import { deleteAutomationAction, toggleAutomationAction } from "../actions";

// One automation: settings, and its recent messages.

export const dynamic = "force-dynamic";

const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" }) : "—";
const REC: Record<string, { label: string; tone: string }> = {
  queued: { label: "Waiting", tone: "text-ink/50" },
  sending: { label: "Sending", tone: "text-[#8a5a12]" },
  sent: { label: "Sent", tone: "text-ink/70" },
  delivered: { label: "Delivered", tone: "text-[#2c6a4e]" },
  read: { label: "Read", tone: "text-[#2c6a4e] font-semibold" },
  failed: { label: "Failed", tone: "text-[#9c3326]" },
  skipped: { label: "Skipped", tone: "text-ink/40" },
};

export default async function AutomationPage({ params, searchParams }: { params: { id: string }; searchParams: { saved?: string; notice?: string } }) {
  const db = createAdminClient();
  const [{ data }, { data: runs }, { templates }, { data: segs }] = await Promise.all([
    db.from("engage_automation").select(AUTOMATION_COLS).eq("id", params.id).maybeSingle(),
    db.from("engage_automation_run").select("id, customer_id, order_id, wa_id, name, status, error, due_at, sent_at, replied_at").eq("automation_id", params.id).order("created_at", { ascending: false }).limit(200),
    automationTemplates(),
    db.from("engage_segment").select("id, name").order("name"),
  ]);
  if (!data) notFound();
  const a = data as Automation;
  const rows = (runs ?? []) as { id: string; customer_id: string | null; order_id: string | null; wa_id: string; name: string | null; status: string; error: string | null; due_at: string; sent_at: string | null; replied_at: string | null }[];
  const recipe = RECIPES.find((r) => r.template === a.template_name && r.trigger === a.trigger) ?? null;
  const tpl = templates.find((t) => t.name === a.template_name);

  return (
    <div>
      <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-accent">
        <Link href="/engage/automations" className="hover:underline">
          Engage · Automations
        </Link>
      </div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-archivo text-2xl font-extrabold text-ink">{a.name}</h1>
        <div className="flex items-center gap-2">
          <form action={toggleAutomationAction}>
            <input type="hidden" name="id" value={a.id} />
            <input type="hidden" name="on" value={a.active ? "0" : "1"} />
            <button type="submit" className={`rounded-full px-3 py-1 text-[12.5px] font-semibold ${a.active ? "bg-[#e2eee7] text-[#2c6a4e]" : "bg-black/5 text-ink/55"}`}>
              {a.active ? "● On · switch off" : "○ Off · switch on"}
            </button>
          </form>
          <form action={deleteAutomationAction}>
            <input type="hidden" name="id" value={a.id} />
            <button type="submit" className="rounded-md border border-black/10 bg-white px-3 py-1.5 text-[12.5px] font-medium text-[#9c3326] hover:border-[#9c3326]/40">
              Delete
            </button>
          </form>
        </div>
      </div>
      <p className="mb-4 text-sm text-ink/60">
        {describeWhen(a)} · template <b>{a.template_name}</b>
      </p>
      {searchParams.saved && !searchParams.notice && <p className="mb-4 rounded-md bg-[#e2eee7] px-3 py-2 text-[13px] text-[#2c6a4e]">Saved.</p>}
      {searchParams.notice && <p className="mb-4 rounded-md bg-[#fdf0dc] px-3 py-2 text-[13px] text-[#8a5a12]">{searchParams.notice}</p>}

      <AutomationForm
        key={a.id + (searchParams.saved ?? "")}
        initial={{
          id: a.id,
          name: a.name,
          trigger: a.trigger,
          delay_minutes: a.delay_minutes,
          trigger_days: a.trigger_days,
          condition: a.condition,
          template: `${a.template_name}|${a.template_language}`,
          field_values: a.field_values ?? {},
          segment_id: a.segment_id,
          respect_quiet: a.respect_quiet,
          cooldown_days: a.cooldown_days,
          active: a.active,
        }}
        templates={templates}
        segments={(segs ?? []) as { id: string; name: string }[]}
        recipe={recipe}
        recipeTemplate={recipe ? (tpl ? (tpl.approved ? "approved" : "pending") : "missing") : null}
      />

      <h2 className="mb-2 mt-8 font-archivo text-lg font-bold text-ink">Recent messages</h2>
      <section className="overflow-x-auto border-2 border-black/10 bg-white">
        <table className="w-full min-w-[680px] text-sm">
          <thead>
            <tr className="border-b-2 border-black/10 text-left text-[11px] uppercase tracking-wide text-ink/50">
              <th className="px-4 py-2.5">Customer</th>
              <th className="px-4 py-2.5">Status</th>
              <th className="px-4 py-2.5">Due / sent</th>
              <th className="px-4 py-2.5">Reply</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const s = REC[r.status] ?? REC.queued;
              return (
                <tr key={r.id} className="border-b border-black/5 last:border-0">
                  <td className="px-4 py-2.5">
                    {r.customer_id ? (
                      <Link href={`/customers/${r.customer_id}`} className="text-ink hover:underline">
                        {r.name ?? "Customer"}
                      </Link>
                    ) : (
                      r.name ?? "Customer"
                    )}
                    <div className="text-[12px] text-ink/45">
                      +{r.wa_id}
                      {r.order_id && (
                        <>
                          {" · "}
                          <Link href={`/orders/${r.order_id}`} className="hover:underline">
                            order
                          </Link>
                        </>
                      )}
                    </div>
                  </td>
                  <td className={`px-4 py-2.5 ${s.tone}`}>
                    {s.label}
                    {r.error && (
                      <div className="max-w-[320px] truncate text-[11.5px] text-ink/50" title={r.error}>
                        {/131030|allowed list/i.test(r.error) ? "Test number: recipient not registered" : r.error}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-[12.5px] text-ink/60">{r.sent_at ? when(r.sent_at) : `due ${when(r.due_at)}`}</td>
                  <td className="px-4 py-2.5 text-[12.5px]">
                    {r.replied_at ? (
                      <Link href={`/whatsapp?c=${r.wa_id}`} className="text-accent hover:underline">
                        Replied · open chat
                      </Link>
                    ) : (
                      <span className="text-ink/35">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
            {!rows.length && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-ink/45">
                  No messages yet. {a.active ? "They appear here as soon as the automation is triggered." : "Switch the automation on to start."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
