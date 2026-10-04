import Link from "next/link";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { loadFilterOptions } from "@/lib/engage/segments-server";
import type { Filter } from "@/lib/engage/segments";
import { AudienceBuilder } from "../builder";

export const dynamic = "force-dynamic";

export default async function EditAudiencePage({ params }: { params: { id: string } }) {
  const { data: auth } = await createClient().auth.getUser();
  if (!auth?.user) return <p className="text-sm text-ink/60">Sign in to see audiences.</p>;
  const [{ data }, options] = await Promise.all([
    createAdminClient().from("engage_segment").select("id, name, description, match, filters").eq("id", params.id).maybeSingle(),
    loadFilterOptions(),
  ]);
  if (!data) notFound();
  const s = data as { id: string; name: string; description: string | null; match: "all" | "any"; filters: Filter[] };
  return (
    <div>
      <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-accent">
        <Link href="/engage/audiences" className="hover:underline">
          Engage · Audiences
        </Link>
      </div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-archivo text-2xl font-extrabold text-ink">{s.name}</h1>
        <a href={`/engage/audiences/${s.id}/export`} className="rounded-md border border-black/10 bg-white px-3 py-1.5 text-[13px] font-medium text-ink hover:border-navy/40">
          Download CSV
        </a>
      </div>
      <AudienceBuilder initial={s} options={options} />
    </div>
  );
}
