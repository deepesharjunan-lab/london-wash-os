import { createClient } from "@/lib/supabase/server";
import { fillTemplate, TEMPLATE_VARS } from "@/lib/loyalty/engine";
import { saveAutomation } from "../actions";
import { btnPrimary, Card, ClubHeader, Field, inputCls, StatusPill } from "../ui";

export const dynamic = "force-dynamic";

type Automation = {
  id: string;
  key: string;
  name: string;
  trigger_event: string;
  send_delay: string | null;
  channels: string[] | null;
  message_template: string;
  is_enabled: boolean;
};

const CHANNELS: [string, string][] = [["push", "Push notification"], ["whatsapp", "WhatsApp"], ["sms", "SMS"], ["email", "Email"]];
const SAMPLE: Record<string, string> = {
  first_name: "Ananya",
  tier: "Signature",
  next_tier: "Sovereign",
  gap: "₹6,600",
  points: "1,960",
  expiring_points: "320",
  expiry_date: "20 Oct 2026",
  order_no: "LW-26-10482",
  slot: "tomorrow, 10 am–12 pm",
  review_points: "50",
};

export default async function ClubAutomationsPage({ searchParams }: { searchParams: { saved?: string; error?: string } }) {
  const supabase = createClient();
  const { data } = await supabase
    .from("crm_automation")
    .select("id, key, name, trigger_event, send_delay, channels, message_template, is_enabled")
    .order("created_at", { ascending: true });
  const autos = (data ?? []) as Automation[];

  return (
    <div className="space-y-6">
      <ClubHeader
        current="/club/automations"
        title="CRM automations"
        sub="Messages sent when something happens to a member. Edit the wording and channels here, with no release needed."
        saved={searchParams.saved}
      />
      {searchParams.error && <div role="alert" className="rounded-xl bg-[#f6e4df] px-4 py-3 text-[13px] font-medium text-[#9c3326]">{searchParams.error}</div>}

      <div className="rounded-xl bg-[#e2e9f2] px-4 py-3 text-[13px] text-[#2b5584]">
        These templates are saved and ready. Sending them automatically on each channel (WhatsApp, SMS, email, push) is the next piece of work, so switching one on doesn&apos;t send anything yet.
      </div>

      <Card title="Variables" sub="Type these into a message; each member sees their own details.">
        <div className="flex flex-wrap gap-2">
          {TEMPLATE_VARS.map((v) => (
            <code key={v} className="rounded-md bg-beige px-2 py-1 font-mono text-[12px] text-ink">{v}</code>
          ))}
        </div>
      </Card>

      <div className="space-y-3">
        {autos.map((a) => {
          const ch = new Set(a.channels ?? []);
          return (
            <details key={a.id} className="group border border-black/10 bg-white [border-radius:14px]">
              <summary className="flex cursor-pointer list-none flex-wrap items-center gap-4 px-5 py-4">
                <span className="min-w-[220px] flex-1">
                  <b className="block text-[14px] text-ink">{a.name}</b>
                  <span className="text-[12.5px] text-ink-2">
                    {a.trigger_event}
                    {a.send_delay ? ` · ${a.send_delay}` : ""} · {CHANNELS.filter(([k]) => ch.has(k)).map(([, l]) => l).join(", ") || "No channel"}
                  </span>
                </span>
                <StatusPill status={a.is_enabled ? "on" : "off"} />
                <span className="text-[12.5px] font-semibold text-ink-3 group-open:hidden">Edit</span>
              </summary>
              <form action={saveAutomation} className="grid gap-5 border-t border-black/5 px-5 py-5 lg:grid-cols-[1.2fr_1fr]">
                <input type="hidden" name="id" value={a.id} />
                <div className="space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Trigger"><input className={inputCls + " bg-beige"} value={a.trigger_event} readOnly /></Field>
                    <Field label="Send"><input className={inputCls} name="send_delay" defaultValue={a.send_delay ?? ""} placeholder="Immediately" /></Field>
                  </div>
                  <fieldset>
                    <legend className="mb-2 text-[12.5px] font-semibold text-ink-2">Channels</legend>
                    <div className="flex flex-wrap gap-2">
                      {CHANNELS.map(([k, l]) => (
                        <label key={k} className="inline-flex items-center gap-1.5 rounded-full border border-hair-2 bg-white px-3 py-1 text-[12.5px] text-ink">
                          <input type="checkbox" name={`ch_${k}`} defaultChecked={ch.has(k)} /> {l}
                        </label>
                      ))}
                    </div>
                  </fieldset>
                  <Field label="Message">
                    <textarea className={inputCls + " min-h-[110px]"} name="message_template" defaultValue={a.message_template} required />
                  </Field>
                  <div className="flex flex-wrap items-center gap-4">
                    <label className="flex items-center gap-2 text-[13.5px] text-ink"><input type="checkbox" name="is_enabled" defaultChecked={a.is_enabled} /> Switched on</label>
                    <button type="submit" className={btnPrimary + " ml-auto"}>Save automation</button>
                  </div>
                </div>
                <div>
                  <div className="mb-2 text-[12.5px] font-semibold text-ink-2">Preview for a sample member</div>
                  <div className="whitespace-pre-wrap rounded-xl bg-beige px-4 py-3 text-[13.5px] text-ink">{fillTemplate(a.message_template, SAMPLE)}</div>
                  <p className="mt-2 text-[12px] text-ink-3">The preview shows the saved message. Save to refresh it.</p>
                </div>
              </form>
            </details>
          );
        })}
        {autos.length === 0 && <p className="text-sm text-ink-3">No automations found. Run the Club setup scripts first.</p>}
      </div>
    </div>
  );
}
