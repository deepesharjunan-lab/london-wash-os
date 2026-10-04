import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadFilterOptions, loadProfiles, runSegment } from "@/lib/engage/segments-server";
import { describeFilter, type Filter } from "@/lib/engage/segments";
import { deleteSegmentAction } from "./actions";

// ENGAGE → Audiences: saved customer segments with today's size.

export const dynamic = "force-dynamic";

type Segment = { id: string; name: string; description: string | null; match: "all" | "any"; filters: Filter[]; updated_at: string };

export default async function AudiencesPage({ searchParams }: { searchParams: { saved?: string } }) {
  const { data: auth } = await createClient().auth.getUser();
  if (!auth?.user) return <p className="text-sm text-ink/60">Sign in to see audiences.</p>;

  const [{ data }, profiles, options] = await Promise.all([
    createAdminClient().from("engage_segment").select("id, name, description, match, filters, updated_at").order("name"),
    loadProfiles().catch(() => null),
    loadFilterOptions(),
  ]);
  const segments = (data ?? []) as Segment[];
  const names = {
    services: Object.fromEntries(options.services.map((s) => [s.id, s.name])),
    tiers: Object.fromEntries(options.tiers.map((s) => [s.id, s.name])),
    branches: Object.fromEntries(options.branches.map((s) => [s.id, s.name])),
  };
  // Today's size of each audience (all run over one load of the customer profiles).
  const sizes = profiles ? await Promise.all(segments.map((s) => runSegment(s.filters, s.match, profiles))) : [];
  const everyone = profiles ? await runSegment([], "all", profiles) : null;

  return (
    <div>
      <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-accent">Engage</div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-archivo text-2xl font-extrabold text-ink">Audiences</h1>
        <Link href="/engage/audiences/new" className="rounded-md bg-[#1f7a4d] px-4 py-2 text-sm font-semibold text-white hover:bg-[#19663f]">
          + New audience
        </Link>
      </div>
      <p className="mb-5 max-w-3xl text-sm text-ink/60">
        Groups of customers for campaigns and automations, built from what we know: orders, spend, services, Club tier and points, birthday, area and more. Sizes
        update by themselves. Customers who replied STOP or have no valid mobile number are never messaged.
      </p>
      {searchParams.saved && <p className="mb-4 rounded-md bg-[#e2eee7] px-3 py-2 text-[13px] text-[#2c6a4e]">Saved “{searchParams.saved}”.</p>}
      {!profiles && (
        <p className="mb-4 rounded-md bg-[#fdf0dc] px-3 py-2 text-[13px] text-[#8a5a12]">
          Customer data for audiences isn't available yet. Run the database update (2026-10-05_engage_audiences.sql) in Supabase.
        </p>
      )}

      <section className="overflow-x-auto border-2 border-black/10 bg-white">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b-2 border-black/10 text-left text-[11px] uppercase tracking-wide text-ink/50">
              <th className="px-4 py-2.5">Audience</th>
              <th className="px-4 py-2.5">Filters</th>
              <th className="px-4 py-2.5 text-right">Can be messaged</th>
              <th className="px-4 py-2.5"></th>
            </tr>
          </thead>
          <tbody>
            {everyone && (
              <tr className="border-b border-black/5">
                <td className="px-4 py-3 font-medium text-ink">Everyone</td>
                <td className="px-4 py-3 text-[12.5px] text-ink/55">All customers</td>
                <td className="px-4 py-3 text-right font-semibold text-ink">{everyone.reachable.length.toLocaleString("en-IN")}</td>
                <td className="px-4 py-3 text-right text-[12px] text-ink/40">built in</td>
              </tr>
            )}
            {segments.map((s, i) => (
              <tr key={s.id} className="border-b border-black/5 last:border-0 align-top">
                <td className="px-4 py-3">
                  <Link href={`/engage/audiences/${s.id}`} className="font-medium text-ink hover:underline">
                    {s.name}
                  </Link>
                  {s.description && <div className="text-[12px] text-ink/50">{s.description}</div>}
                </td>
                <td className="px-4 py-3 text-[12.5px] text-ink/65">
                  {s.filters.length ? (
                    <ul className="space-y-0.5">
                      {s.filters.map((f, j) => (
                        <li key={j}>
                          {j > 0 && <span className="mr-1 font-semibold text-accent">{s.match === "all" ? "and" : "or"}</span>}
                          {describeFilter(f, names)}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    "All customers"
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="font-semibold text-ink">{sizes[i] ? sizes[i].reachable.length.toLocaleString("en-IN") : "–"}</div>
                  {sizes[i] && <div className="text-[11.5px] text-ink/45">{sizes[i].matched.length.toLocaleString("en-IN")} match</div>}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-right text-[13px]">
                  <Link href={`/engage/campaigns/new?segment=${s.id}`} className="font-medium text-[#1f7a4d] hover:underline">
                    Campaign
                  </Link>
                  <span className="mx-1.5 text-ink/20">|</span>
                  <Link href={`/engage/audiences/${s.id}`} className="font-medium text-accent hover:underline">
                    Edit
                  </Link>
                  <span className="mx-1.5 text-ink/20">|</span>
                  <a href={`/engage/audiences/${s.id}/export`} className="font-medium text-accent hover:underline">
                    CSV
                  </a>
                  <form action={deleteSegmentAction} className="inline">
                    <input type="hidden" name="id" value={s.id} />
                    <span className="mx-1.5 text-ink/20">|</span>
                    <button type="submit" className="font-medium text-[#9c3326] hover:underline">
                      Delete
                    </button>
                  </form>
                </td>
              </tr>
            ))}
            {!segments.length && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-ink/45">
                  No saved audiences yet. Ideas: “No order in 60 days”, “Birthday this week”, “Spent over ₹5,000”, “Used dry cleaning but never shoe cleaning”.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
