import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { listTemplates } from "@/lib/whatsapp/meta-templates";
import { AUTO_FIELDS } from "@/lib/engage/campaigns";
import { CampaignForm, type TemplateOption } from "./form";

export const dynamic = "force-dynamic";

type Meta = { name: string; variables: { pos: number; key: string; example: string }[]; header_image_url: string | null; url_button_variable: string | null };

export default async function NewCampaignPage({ searchParams }: { searchParams: { segment?: string } }) {
  const db = createAdminClient();
  const [{ rows, accounts }, { data: metas }, { data: segs }] = await Promise.all([
    listTemplates(),
    db.from("whatsapp_template_meta").select("name, variables, header_image_url, url_button_variable"),
    db.from("engage_segment").select("id, name").order("name"),
  ]);
  const sending = accounts.find((a) => a.sending);
  const metaByName = new Map(((metas ?? []) as Meta[]).map((m) => [m.name, m]));

  // Approved on the sending account, and either built in the console (fields known) or without fields.
  const templates: TemplateOption[] = rows
    .filter((t) => sending && t.status[sending.id]?.status === "APPROVED" && t.category !== "AUTHENTICATION")
    .filter((t) => !/^(hello_world|jaspers_market_)/.test(t.name))
    .map((t) => {
      const comp = (type: string) => t.components.find((c: any) => c.type === type);
      const body: string = comp("BODY")?.text ?? "";
      const meta = metaByName.get(t.name);
      const hasVars = /\{\{\d+\}\}/.test(body) || (comp("BUTTONS")?.buttons ?? []).some((b: any) => /\{\{1\}\}/.test(b.url ?? ""));
      if (hasVars && !meta) return null;
      const keys = [...new Set([...(meta?.variables.map((v) => v.key) ?? []), meta?.url_button_variable].filter(Boolean) as string[])];
      return {
        key: `${t.name}|${t.language}`,
        name: t.name,
        language: t.language,
        category: t.category,
        headerFormat: comp("HEADER")?.format ?? null,
        headerText: comp("HEADER")?.text ?? null,
        headerImage: meta?.header_image_url ?? null,
        body,
        footer: comp("FOOTER")?.text ?? null,
        buttons: (comp("BUTTONS")?.buttons ?? []).map((b: any) => ({ type: b.type, text: b.text })),
        vars: meta?.variables ?? [],
        fixed: keys.filter((k) => !AUTO_FIELDS.has(k)),
      } satisfies TemplateOption;
    })
    .filter((x): x is TemplateOption => !!x);

  return (
    <div>
      <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-accent">
        <Link href="/engage/campaigns" className="hover:underline">
          Engage · Campaigns
        </Link>
      </div>
      <h1 className="mb-2 font-archivo text-2xl font-extrabold text-ink">New campaign</h1>
      <p className="mb-5 max-w-3xl text-sm text-ink/60">
        Sends an approved WhatsApp template to an audience. Sending from: <b>{sending?.label ?? "—"}</b>
        {sending?.label === "Test account" ? " (Meta's test number only delivers to phone numbers registered as test recipients)" : ""}.
      </p>
      <CampaignForm templates={templates} segments={(segs ?? []) as { id: string; name: string }[]} defaultSegment={searchParams.segment} />
    </div>
  );
}
