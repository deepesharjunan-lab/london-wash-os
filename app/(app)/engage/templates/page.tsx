import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { listTemplates, type TemplateRow } from "@/lib/whatsapp/meta-templates";
import { TEMPLATE_DEFS } from "@/lib/whatsapp/templates";
import { variableByKey } from "@/lib/engage/variables";
import { deleteTemplateAction } from "./actions";
import { RefreshStatus } from "./refresh";

// ENGAGE → Templates: every WhatsApp template on our accounts with its
// approval status, a preview, and delete. Statuses come live from Meta.

export const dynamic = "force-dynamic";

const SYSTEM = new Set<string>(TEMPLATE_DEFS.map((t) => t.name));
const STATUS: Record<string, { label: string; tone: string }> = {
  APPROVED: { label: "Approved", tone: "bg-[#e2eee7] text-[#2c6a4e]" },
  PENDING: { label: "In review", tone: "bg-[#fdf0dc] text-[#8a5a12]" },
  IN_APPEAL: { label: "In appeal", tone: "bg-[#fdf0dc] text-[#8a5a12]" },
  REJECTED: { label: "Rejected", tone: "bg-[#f6e4df] text-[#9c3326]" },
  PAUSED: { label: "Paused", tone: "bg-[#f6e4df] text-[#9c3326]" },
  DISABLED: { label: "Disabled", tone: "bg-[#f6e4df] text-[#9c3326]" },
};
const CATEGORY: Record<string, string> = { MARKETING: "Marketing", UTILITY: "Utility", AUTHENTICATION: "Login code" };

type Meta = { name: string; variables: { pos: number; key: string; example: string }[]; header_image_url: string | null };

function Preview({ t, meta }: { t: TemplateRow; meta: Meta | undefined }) {
  const comp = (type: string) => t.components.find((c: any) => c.type === type);
  const header = comp("HEADER");
  const body = comp("BODY");
  const footer = comp("FOOTER");
  const buttons = comp("BUTTONS")?.buttons ?? [];
  const fill = (text: string) =>
    text.split(/(\{\{\d+\}\})/g).map((part, i) => {
      const m = part.match(/^\{\{(\d+)\}\}$/);
      if (!m) return <span key={i}>{part}</span>;
      const v = meta?.variables.find((x) => x.pos === Number(m[1]));
      return (
        <mark key={i} className="rounded bg-[#fdf0dc] px-0.5 text-[#8a5a12]" title={v ? variableByKey(v.key)?.label : undefined}>
          {v ? v.example : part}
        </mark>
      );
    });
  const bodyText = body?.text ?? (t.category === "AUTHENTICATION" ? "123456 is your verification code. For your security, do not share this code." : "");
  return (
    <div className="rounded-xl bg-[#e5ddd5] p-3">
      <div className="max-w-[300px] overflow-hidden rounded-lg bg-white text-[13px] shadow-sm">
        {header?.format === "IMAGE" &&
          (meta?.header_image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={meta.header_image_url} alt="" className="max-h-40 w-full object-cover" />
          ) : (
            <div className="grid h-24 place-items-center bg-black/5 text-[12px] text-ink/40">Image</div>
          ))}
        <div className="px-3 pb-1.5 pt-2">
          {header?.format === "TEXT" && <div className="mb-1 font-bold">{header.text}</div>}
          <div className="whitespace-pre-wrap break-words">{fill(bodyText)}</div>
          {footer?.text && <div className="mt-1.5 text-[11.5px] text-ink/45">{footer.text}</div>}
        </div>
        {buttons.map((b: any, i: number) => (
          <div key={i} className="border-t border-black/5 py-1.5 text-center text-[13px] font-medium text-[#1a8cd8]">
            {b.type === "URL" ? "↗ " : b.type === "PHONE_NUMBER" ? "✆ " : "↩ "}
            {b.text}
          </div>
        ))}
      </div>
    </div>
  );
}

export default async function TemplatesPage({ searchParams }: { searchParams: { t?: string; deleted?: string } }) {
  const { data: auth } = await createClient().auth.getUser();
  if (!auth?.user) return <p className="text-sm text-ink/60">Sign in to see templates.</p>;

  const [{ rows: allRows, accounts, failed }, { data: metaRows }] = await Promise.all([
    listTemplates(),
    createAdminClient().from("whatsapp_template_meta").select("name, variables, header_image_url"),
  ]);
  // Meta adds sample templates (hello_world, jaspers_market_…) to the test account; hide them.
  const rows = allRows.filter((r) => !/^(hello_world|jaspers_market_)/.test(r.name));
  const metaByName = new Map(((metaRows ?? []) as Meta[]).map((m) => [m.name, m]));
  const selected = rows.find((r) => `${r.name}|${r.language}` === searchParams.t) ?? null;
  const sending = accounts.find((a) => a.sending);

  return (
    <div>
      <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-accent">Engage</div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-archivo text-2xl font-extrabold text-ink">WhatsApp Templates</h1>
        <div className="flex flex-wrap items-center gap-2">
          <RefreshStatus checkedAt={new Date().toISOString()} />
          <Link href="/engage/templates/new" className="rounded-md bg-[#1f7a4d] px-4 py-2 text-sm font-semibold text-white hover:bg-[#19663f]">
            + New template
          </Link>
        </div>
      </div>
      <p className="mb-5 max-w-3xl text-sm text-ink/60">
        Approved templates can be used in campaigns and automations. Each template is created on both WhatsApp accounts; the system currently sends from{" "}
        <b>{sending?.label ?? "—"}</b>.
      </p>

      {searchParams.deleted && <p className="mb-4 rounded-md bg-[#e2eee7] px-3 py-2 text-[13px] text-[#2c6a4e]">Deleted “{searchParams.deleted}”.</p>}
      {failed.length > 0 && (
        <p className="mb-4 rounded-md bg-[#fdf0dc] px-3 py-2 text-[13px] text-[#8a5a12]">Couldn't load templates from: {failed.join(", ")}. Check the WhatsApp settings in Vercel.</p>
      )}

      <div className={`grid gap-4 ${selected ? "xl:grid-cols-[1fr_360px]" : ""}`}>
        <section className="overflow-x-auto border-2 border-black/10 bg-white">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b-2 border-black/10 text-left text-[11px] uppercase tracking-wide text-ink/50">
                <th className="px-4 py-2.5">Template</th>
                <th className="px-4 py-2.5">Type</th>
                {accounts.map((a) => (
                  <th key={a.id} className="px-4 py-2.5">
                    {a.label}
                    {a.sending && <span className="ml-1 normal-case text-[#2c6a4e]">(sending)</span>}
                  </th>
                ))}
                <th className="px-4 py-2.5"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((t) => {
                const key = `${t.name}|${t.language}`;
                return (
                  <tr key={key} className={`border-b border-black/5 last:border-0 ${selected && key === `${selected.name}|${selected.language}` ? "bg-[#fbf7ef]" : ""}`}>
                    <td className="px-4 py-3">
                      <Link href={`/engage/templates?t=${encodeURIComponent(key)}`} className="font-medium text-ink hover:underline">
                        {t.name}
                      </Link>
                      <div className="text-[12px] text-ink/50">
                        {t.language}
                        {SYSTEM.has(t.name) ? " · system (order updates, login codes)" : ""}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-ink/75">{CATEGORY[t.category] ?? t.category}</td>
                    {accounts.map((a) => {
                      const s = t.status[a.id];
                      const st = s ? STATUS[s.status] ?? { label: s.status, tone: "bg-black/5 text-ink/60" } : null;
                      return (
                        <td key={a.id} className="px-4 py-3">
                          {st ? (
                            <span className={`inline-block rounded-full px-2.5 py-1 text-[12px] font-semibold ${st.tone}`} title={s?.reason}>
                              {st.label}
                            </span>
                          ) : (
                            <span className="text-[12px] text-ink/35">not created</span>
                          )}
                          {s?.reason && <div className="mt-1 max-w-[180px] text-[11.5px] text-[#9c3326]">{s.reason.replace(/_/g, " ").toLowerCase()}</div>}
                        </td>
                      );
                    })}
                    <td className="px-4 py-3 text-right">
                      <Link href={`/engage/templates?t=${encodeURIComponent(key)}`} className="text-[13px] font-medium text-accent hover:underline">
                        Preview →
                      </Link>
                    </td>
                  </tr>
                );
              })}
              {!rows.length && (
                <tr>
                  <td colSpan={3 + accounts.length} className="px-4 py-10 text-center text-ink/40">
                    No templates yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </section>

        {selected && (
          <aside className="self-start border-2 border-black/10 bg-white p-4">
            <div className="mb-3 flex items-start justify-between gap-2">
              <div>
                <h2 className="text-[16px] font-bold text-ink">{selected.name}</h2>
                <div className="text-[12.5px] text-ink/55">
                  {CATEGORY[selected.category] ?? selected.category} · {selected.language}
                </div>
              </div>
              <Link href="/engage/templates" aria-label="Close" className="text-[20px] leading-none text-ink/40 hover:text-ink">
                ×
              </Link>
            </div>
            <Preview t={selected} meta={metaByName.get(selected.name)} />
            {metaByName.get(selected.name)?.variables.length ? (
              <div className="mt-3 text-[12.5px] text-ink/65">
                <div className="mb-1 font-semibold text-ink/75">Fields</div>
                {metaByName.get(selected.name)!.variables.map((v) => (
                  <div key={v.pos}>
                    {"{{"}
                    {v.pos}
                    {"}}"} = {variableByKey(v.key)?.label ?? v.key}
                  </div>
                ))}
              </div>
            ) : null}
            {!SYSTEM.has(selected.name) && (
              <form action={deleteTemplateAction} className="mt-4 border-t border-black/5 pt-3">
                <input type="hidden" name="name" value={selected.name} />
                <button type="submit" className="text-[12.5px] font-medium text-[#9c3326] hover:underline">
                  Delete this template from WhatsApp
                </button>
              </form>
            )}
          </aside>
        )}
      </div>
    </div>
  );
}
