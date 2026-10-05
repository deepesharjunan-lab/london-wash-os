import Link from "next/link";
import { notFound } from "next/navigation";
import { getSiteSettingsFresh } from "@/lib/site/settings";
import { deletePageAction } from "../../actions";
import { PageEditor } from "./editor";

// WEBSITE → Service pages → one page.

export const dynamic = "force-dynamic";

export default async function EditServicePage({ params, searchParams }: { params: { slug: string }; searchParams: { saved?: string } }) {
  const st = await getSiteSettingsFresh();
  const page = st.pages.find((p) => p.slug === params.slug);
  if (!page) notFound();
  const site = st.seo.canonical.replace(/\/+$/, "");

  return (
    <div>
      <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-accent">
        <Link href="/website/pages" className="hover:underline">
          Website · Service pages
        </Link>
      </div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-archivo text-2xl font-extrabold text-ink">{page.nav_label}</h1>
        <div className="flex items-center gap-3">
          <a
            href={page.published ? `${site}/services/${page.slug}` : `/api/public/site/page?slug=${page.slug}&fresh=1&preview=1`}
            target="_blank"
            rel="noopener"
            className="rounded-md border border-black/10 bg-white px-4 py-2 text-sm font-medium text-ink hover:border-navy/40"
          >
            {page.published ? "View live page ↗" : "Preview draft ↗"}
          </a>
          <form action={deletePageAction}>
            <input type="hidden" name="slug" value={page.slug} />
            <button type="submit" className="rounded-md border border-black/10 bg-white px-3 py-2 text-[13px] font-medium text-[#9c3326] hover:border-[#9c3326]/40">
              Delete page
            </button>
          </form>
        </div>
      </div>
      {searchParams.saved && <p className="mb-4 rounded-md bg-[#e2eee7] px-3 py-2 text-[13px] text-[#2c6a4e]">Saved.</p>}
      <PageEditor key={page.slug} initial={page} services={st.services.map((s) => s.title)} site={site} />
    </div>
  );
}
