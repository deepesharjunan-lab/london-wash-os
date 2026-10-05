import Link from "next/link";
import { getSiteSettingsFresh } from "@/lib/site/settings";
import { ToggleButton } from "@/lib/ui/Toggle";
import { createPageAction, restoreAction, togglePageAction } from "../actions";

// WEBSITE → Service pages: one page per service, each aimed at one Google search.

export const dynamic = "force-dynamic";

export default async function ServicePagesPage() {
  const st = await getSiteSettingsFresh();
  const site = st.seo.canonical.replace(/\/+$/, "");

  return (
    <div>
      <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-accent">
        <Link href="/website" className="hover:underline">
          Website
        </Link>
      </div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-archivo text-2xl font-extrabold text-ink">Service pages</h1>
        <form action={restoreAction}>
          <input type="hidden" name="key" value="pages" />
          <button type="submit" className="text-[12px] text-ink/45 hover:text-ink hover:underline">
            ↶ Undo last change
          </button>
        </form>
      </div>
      <p className="mb-5 max-w-3xl text-sm text-ink/60">
        Each page is about one service and aims at one Google search, like “dry cleaning Pathanamthitta”. Live pages are linked from the services on the home page and listed
        in the sitemap Google reads.
      </p>

      <section className="mb-6 overflow-x-auto border-2 border-black/10 bg-white">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b-2 border-black/10 text-left text-[11px] uppercase tracking-wide text-ink/50">
              <th className="px-4 py-2.5">Page</th>
              <th className="px-4 py-2.5">Google title</th>
              <th className="px-4 py-2.5">Live</th>
              <th className="px-4 py-2.5"></th>
            </tr>
          </thead>
          <tbody>
            {st.pages.map((p) => (
              <tr key={p.slug} className="border-b border-black/5 last:border-0 align-top">
                <td className="px-4 py-3">
                  <Link href={`/website/pages/${p.slug}`} className="font-medium text-ink hover:underline">
                    {p.nav_label}
                  </Link>
                  <div className="text-[12px] text-ink/45">/services/{p.slug}</div>
                </td>
                <td className="px-4 py-3 text-[13px] text-ink/70">{p.seo_title || p.h1}</td>
                <td className="px-4 py-3">
                  <form action={togglePageAction}>
                    <input type="hidden" name="slug" value={p.slug} />
                    <input type="hidden" name="on" value={p.published ? "0" : "1"} />
                    <ToggleButton on={p.published} label={p.nav_label} small />
                  </form>
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-right text-[13px]">
                  <Link href={`/website/pages/${p.slug}`} className="font-medium text-accent hover:underline">
                    Edit
                  </Link>
                  <span className="mx-1.5 text-ink/20">|</span>
                  <a
                    href={p.published ? `${site}/services/${p.slug}` : `/api/public/site/page?slug=${p.slug}&fresh=1&preview=1`}
                    target="_blank"
                    rel="noopener"
                    className="font-medium text-accent hover:underline"
                  >
                    {p.published ? "View ↗" : "Preview ↗"}
                  </a>
                </td>
              </tr>
            ))}
            {!st.pages.length && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-ink/45">
                  No service pages yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <form action={createPageAction} className="flex max-w-xl flex-wrap items-center gap-2 border-2 border-black/10 bg-white p-4">
        <input name="title" required maxLength={80} placeholder="New page, e.g. Curtain cleaning" className="min-w-[240px] flex-1 border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-accent" />
        <button type="submit" className="rounded-md bg-[#1f7a4d] px-4 py-2 text-sm font-semibold text-white hover:bg-[#19663f]">
          + Add page
        </button>
        <p className="w-full text-[12px] text-ink/50">New pages start as drafts: fill them in, then switch them live.</p>
      </form>
    </div>
  );
}
