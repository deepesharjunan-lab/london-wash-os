import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { CAMPAIGN_STATUS } from "@/lib/engage/campaign-status";

// ENGAGE → Campaigns: every campaign with its delivery numbers.

export const dynamic = "force-dynamic";

type Row = {
  id: string;
  name: string;
  template_name: string;
  segment_name: string | null;
  status: string;
  scheduled_at: string | null;
  started_at: string | null;
  finished_at: string | null;
  total_count: number;
  created_at: string;
};

const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" }) : "—";

export default async function CampaignsPage() {
  const { data: auth } = await createClient().auth.getUser();
  if (!auth?.user) return <p className="text-sm text-ink/60">Sign in to see campaigns.</p>;
  const db = createAdminClient();
  const { data } = await db
    .from("engage_campaign")
    .select("id, name, template_name, segment_name, status, scheduled_at, started_at, finished_at, total_count, created_at")
    .order("created_at", { ascending: false })
    .limit(100);
  const rows = (data ?? []) as Row[];

  // Delivery numbers per campaign.
  const stats = new Map<string, Record<string, number>>();
  if (rows.length) {
    const { data: rec } = await db.from("engage_campaign_recipient").select("campaign_id, status, replied_at").in("campaign_id", rows.map((r) => r.id)).limit(50000);
    for (const r of (rec ?? []) as { campaign_id: string; status: string; replied_at: string | null }[]) {
      const s = stats.get(r.campaign_id) ?? {};
      const delivered = ["delivered", "read"].includes(r.status);
      const sent = ["sent", "delivered", "read"].includes(r.status);
      s.sent = (s.sent ?? 0) + (sent ? 1 : 0);
      s.delivered = (s.delivered ?? 0) + (delivered ? 1 : 0);
      s.read = (s.read ?? 0) + (r.status === "read" ? 1 : 0);
      s.failed = (s.failed ?? 0) + (r.status === "failed" ? 1 : 0);
      s.replied = (s.replied ?? 0) + (r.replied_at ? 1 : 0);
      stats.set(r.campaign_id, s);
    }
  }

  return (
    <div>
      <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-accent">Engage</div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-archivo text-2xl font-extrabold text-ink">Campaigns</h1>
        <Link href="/engage/campaigns/new" className="rounded-md bg-[#1f7a4d] px-4 py-2 text-sm font-semibold text-white hover:bg-[#19663f]">
          + New campaign
        </Link>
      </div>
      <p className="mb-5 max-w-3xl text-sm text-ink/60">Send an approved WhatsApp template to an audience, now or at a set time, and see who received, read and replied.</p>

      <section className="overflow-x-auto border-2 border-black/10 bg-white">
        <table className="w-full min-w-[820px] text-sm">
          <thead>
            <tr className="border-b-2 border-black/10 text-left text-[11px] uppercase tracking-wide text-ink/50">
              <th className="px-4 py-2.5">Campaign</th>
              <th className="px-4 py-2.5">Status</th>
              <th className="px-4 py-2.5 text-right">Recipients</th>
              <th className="px-4 py-2.5 text-right">Delivered</th>
              <th className="px-4 py-2.5 text-right">Read</th>
              <th className="px-4 py-2.5 text-right">Replied</th>
              <th className="px-4 py-2.5 text-right">Failed</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const s = stats.get(r.id) ?? {};
              const st = CAMPAIGN_STATUS[r.status] ?? CAMPAIGN_STATUS.draft;
              const pct = (n?: number) => (r.total_count && n ? ` (${Math.round((n / r.total_count) * 100)}%)` : "");
              return (
                <tr key={r.id} className="border-b border-black/5 last:border-0">
                  <td className="px-4 py-3">
                    <Link href={`/engage/campaigns/${r.id}`} className="font-medium text-ink hover:underline">
                      {r.name}
                    </Link>
                    <div className="text-[12px] text-ink/50">
                      {r.template_name} → {r.segment_name ?? "Everyone"}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-block rounded-full px-2.5 py-1 text-[12px] font-semibold ${st.tone}`}>{st.label}</span>
                    <div className="mt-1 text-[11.5px] text-ink/45">
                      {r.status === "scheduled" ? `for ${when(r.scheduled_at)}` : r.started_at ? when(r.started_at) : when(r.created_at)}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-ink">{r.total_count.toLocaleString("en-IN")}</td>
                  <td className="px-4 py-3 text-right text-ink/75">
                    {(s.delivered ?? 0).toLocaleString("en-IN")}
                    <span className="text-[11.5px] text-ink/45">{pct(s.delivered)}</span>
                  </td>
                  <td className="px-4 py-3 text-right text-ink/75">
                    {(s.read ?? 0).toLocaleString("en-IN")}
                    <span className="text-[11.5px] text-ink/45">{pct(s.read)}</span>
                  </td>
                  <td className="px-4 py-3 text-right text-ink/75">{(s.replied ?? 0).toLocaleString("en-IN")}</td>
                  <td className={`px-4 py-3 text-right ${s.failed ? "text-[#9c3326]" : "text-ink/40"}`}>{(s.failed ?? 0).toLocaleString("en-IN")}</td>
                </tr>
              );
            })}
            {!rows.length && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-ink/45">
                  No campaigns yet. Make an audience and an approved template, then create your first campaign.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
