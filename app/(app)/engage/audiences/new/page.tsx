import Link from "next/link";
import { loadFilterOptions } from "@/lib/engage/segments-server";
import { AudienceBuilder } from "../builder";

export const dynamic = "force-dynamic";

export default async function NewAudiencePage() {
  const options = await loadFilterOptions();
  return (
    <div>
      <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-accent">
        <Link href="/engage/audiences" className="hover:underline">
          Engage · Audiences
        </Link>
      </div>
      <h1 className="mb-5 font-archivo text-2xl font-extrabold text-ink">New audience</h1>
      <AudienceBuilder options={options} />
    </div>
  );
}
