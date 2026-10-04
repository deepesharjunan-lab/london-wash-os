import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { cancelCampaignAction } from "../actions";
import { CAMPAIGN_STATUS } from "@/lib/engage/campaign-status";
import { LivePump } from "./live";

// One campaign: progress, delivery funnel, and every recipient.

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

export default async function CampaignPage({ params, searchParams }: { params: { id: string }; searchParams: { show?: string } }) {
  const { data: auth } = await createClient().auth.getUser();
  if (!auth?.user) return <p className="text-sm text-ink/60">Sign in to see campaigns.</p>;
  const db = createAdminClient();
  const [{ data: c }, { data: rec }] = await Promise.all([
    db.from("engage_campaign").select("*").eq("id", params.id).maybeSingle(),
    db.from("engage_campaign_recipient").select("id, customer_id, wa_id, name, status, error, sent_at, replied_at").eq("campaign_id", params.id).order("created_at").limit(50000),
  ]);
  if (!c) notFound();
  const campaign = c as any;
  const rows = (rec ?? []) as { id: string; customer_id: string | null; wa_id: string; name: string | null; status: string; error: string | null; sent_at: string | null; replied_at: string | null }[];

  const count = (f: (r: (typeof rows)[number]) => boolean) => rows.filter(f).length;
  const total = rows.length;
  const sent = count((r) => ["sent", "delivered", "read"].includes(r.status));
  const delivered = count((r) => ["delivered", "read"].includes(r.status));
  const read = count((r) => r.status === "read");
  const replied = count((r) => !!r.replied_at);
  const failed = count((r) => r.status === "failed");
  const waiting = count((r) => ["queued", "sending"].includes(r.status));
  const done = total - waiting;
  const pct = (n: number) => (total ? Math.round((n / total) * 100) : 0);
  const st = CAMPAIGN_STATUS[campaign.status] ?? CAMPAIGN_STATUS.draft;
  const active = campaign.status === "sending" || (campaign.status === "scheduled" && campaign.scheduled_at && new Date(campaign.scheduled_at).getTime() <= Date.now() + 60000);

  const filter = searchParams.show ?? "all";
  const shown = rows.filter((r) =>
    filter === "failed" ? r.status === "failed" : filter === "replied" ? !!r.replied_at : filter === "read" ? r.status === "read" : true
  );
  const errorSummary = new Map<string, number>();
  for (const r of rows) if (r.status === "failed" && r.error) errorSummary.set(r.error, (errorSummary.get(r.error) ?? 0) + 1);

  return (
    <div>
      <LivePump active={!!active} />
      <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-accent">
        <Link href="/engage/campaigns" className="hover:underline">
          Engage · Campaigns
        </Link>
      </div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-archivo text-2xl font-extrabold text-ink">{campaign.name}</h1>
        <div className="flex items-center gap-2">
          <span className={`rounded-full px-3 py-1 text-[12.5px] font-semibold ${st.tone}`}>{st.label}</span>
          {["draft", "scheduled", "sending"].includes(campaign.status) && (
            <form action={cancelCampaignAction}>
              <input type="hidden" name="id" value={campaign.id} />
              <button type="submit" className="rounded-md border border-black/10 bg-white px-3 py-1.5 text-[12.5px] font-medium text-[#9c3326] hover:border-[#9c3326]/40">
                {campaign.status === "sending" ? "Stop sending" : "Cancel"}
              </button>
            </form>
          )}
        </div>
      </div>
      <p className="mb-5 text-sm text-ink/60">
        Template <b>{campaign.template_name}</b> → audience <b>{campaign.segment_name ?? "Everyone"}</b>
        {campaign.status === "scheduled" ? ` · scheduled for ${when(campaign.scheduled_at)}` : campaign.started_at ? ` · started ${when(campaign.started_at)}` : ""}
        {campaign.finished_at ? ` · finished ${when(campaign.finished_at)}` : ""}
      </p>
      {campaign.error && <p className="mb-4 rounded-md bg-[#f6e4df] px-3 py-2 text-[13px] text-[#9c3326]">{campaign.error}</p>}

      {campaign.status === "sending" && (
        <div className="mb-5">
          <div className="mb-1 text-[12.5px] text-ink/60">
            Sending… {done.toLocaleString("en-IN")} of {total.toLocaleString("en-IN")} processed
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-black/10">
            <div className="h-full bg-[#1f7a4d] transition-all" style={{ width: `${pct(done)}%` }} />
          </div>
        </div>
      )}

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {[
          { k: "Recipients", v: total, sub: "" },
          { k: "Sent", v: sent, sub: `${pct(sent)}%` },
          { k: "Delivered", v: delivered, sub: `${pct(delivered)}%` },
          { k: "Read", v: read, sub: `${pct(read)}%` },
          { k: "Replied", v: replied, sub: `${pct(replied)}%` },
          { k: "Failed", v: failed, sub: `${pct(failed)}%` },
        ].map((x) => (
          <div key={x.k} className="border-2 border-black/10 bg-white p-3">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-ink/50">{x.k}</div>
            <div className="text-[24px] font-extrabold text-ink">{x.v.toLocaleString("en-IN")}</div>
            {x.sub && <div className="text-[12px] text-ink/45">{x.sub}</div>}
          </div>
        ))}
      </div>

      {errorSummary.size > 0 && (
        <div className="mb-5 rounded-md bg-[#fbf7ef] p-3 text-[12.5px] text-ink/70">
          <div className="mb-1 font-semibold text-ink/80">Why messages failed</div>
          {[...errorSummary.entries()].map(([e, n]) => (
            <div key={e}>
              {n} × {/131030|allowed list/i.test(e) ? "Meta's test number can only message registered test numbers (this goes away when the real number is connected)" : e}
            </div>
          ))}
        </div>
      )}

      <div className="mb-3 flex flex-wrap gap-1.5">
        {[
          ["all", "Everyone"],
          ["read", "Read"],
          ["replied", "Replied"],
          ["failed", "Failed"],
        ].map(([k, l]) => (
          <Link
            key={k}
            href={`/engage/campaigns/${campaign.id}${k === "all" ? "" : `?show=${k}`}`}
            className={`rounded-full border px-3 py-1 text-[12.5px] ${filter === k ? "border-navy bg-navy text-white" : "border-black/10 bg-white text-ink/70"}`}
          >
            {l}
          </Link>
        ))}
      </div>
      <section className="overflow-x-auto border-2 border-black/10 bg-white">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b-2 border-black/10 text-left text-[11px] uppercase tracking-wide text-ink/50">
              <th className="px-4 py-2.5">Customer</th>
              <th className="px-4 py-2.5">Status</th>
              <th className="px-4 py-2.5">Sent</th>
              <th className="px-4 py-2.5">Reply</th>
            </tr>
          </thead>
          <tbody>
            {shown.slice(0, 500).map((r) => {
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
                    <div className="text-[12px] text-ink/45">+{r.wa_id}</div>
                  </td>
                  <td className={`px-4 py-2.5 ${s.tone}`}>
                    {s.label}
                    {r.error && <div className="max-w-[320px] truncate text-[11.5px] text-[#9c3326]" title={r.error}>{r.error}</div>}
                  </td>
                  <td className="px-4 py-2.5 text-[12.5px] text-ink/60">{when(r.sent_at)}</td>
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
            {!shown.length && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-ink/45">
                  {campaign.status === "scheduled" ? "The list is built when the campaign starts." : "Nobody here yet."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
        {shown.length > 500 && <p className="border-t border-black/5 px-4 py-2 text-[12.5px] text-ink/50">Showing the first 500.</p>}
      </section>
    </div>
  );
}
