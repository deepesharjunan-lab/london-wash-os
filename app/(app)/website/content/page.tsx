import Link from "next/link";
import { getSiteSettingsFresh } from "@/lib/site/settings";
import { FIELD_GROUPS, fieldDefaults, fieldLabel } from "@/lib/site/defs";
import { HOME_TEMPLATE, SITE_ICONS } from "@/lib/site/template";
import { restoreAction, saveFieldsAction } from "../actions";
import { SaveForm, box, label } from "../ui";
import { ServicesEditor } from "./services";

// WEBSITE → Content: every text on the home page, and the services & prices grid.

export const dynamic = "force-dynamic";

function Undo({ k }: { k: string }) {
  return (
    <form action={restoreAction}>
      <input type="hidden" name="key" value={k} />
      <button type="submit" className="text-[12px] text-ink/45 hover:text-ink hover:underline" title="Put back the version from before the last save">
        ↶ Undo last change
      </button>
    </form>
  );
}

export default async function WebsiteContentPage() {
  const st = await getSiteSettingsFresh();
  const fields = fieldDefaults(HOME_TEMPLATE);
  const groups = FIELD_GROUPS.map((g) => ({ ...g, fields: fields.filter((f) => f.group === g.key) })).filter((g) => g.fields.length);
  const pickupOff = !st.flags.pickup;

  return (
    <div>
      <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-accent">
        <Link href="/website" className="hover:underline">
          Website
        </Link>
      </div>
      <h1 className="mb-2 font-archivo text-2xl font-extrabold text-ink">Texts &amp; prices</h1>
      <p className="mb-6 max-w-3xl text-sm text-ink/60">
        Leave a box empty to use the original text (shown in grey). Put a word between stars, like *art.*, to show it in the accent style. Texts marked “pickup on” only appear
        while Pickup &amp; delivery is switched on{pickupOff ? " (it is off now)" : ""}.
      </p>

      <section className="mb-8 border-2 border-black/10 bg-white p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-archivo text-lg font-bold text-ink">Services &amp; prices</h2>
          <Undo k="services" />
        </div>
        <ServicesEditor initial={st.services} icons={Object.keys(SITE_ICONS)} iconSvgs={SITE_ICONS} />
      </section>

      <section className="border-2 border-black/10 bg-white p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-archivo text-lg font-bold text-ink">Texts</h2>
          <Undo k="fields" />
        </div>
        <SaveForm action={saveFieldsAction} saveText="Save texts" sticky>
          <div className="space-y-7">
            {groups.map((g) => (
              <fieldset key={g.key}>
                <legend className="mb-2 text-[15px] font-bold text-ink">
                  {g.label}
                  {g.key === "book" && pickupOff && <span className="ml-2 text-[12px] font-normal text-ink/45">hidden while pickup is off</span>}
                  {st.sections[g.key] === false && <span className="ml-2 text-[12px] font-normal text-[#9c3326]">section switched off</span>}
                </legend>
                <div className="grid gap-3 sm:grid-cols-2">
                  {g.fields.map((f) => {
                    const long = f.def.length > 70;
                    const muted = (pickupOff && /pickup|^book\./.test(f.key)) || (!pickupOff && /store/.test(f.key));
                    return (
                      <div key={f.key} className={(long ? "sm:col-span-2 " : "") + (muted ? "opacity-60" : "")}>
                        <label className={label}>{fieldLabel(f.key)}</label>
                        {long ? (
                          <textarea name={`f:${f.key}`} defaultValue={st.fields[f.key] ?? ""} placeholder={f.def} rows={3} className={box} />
                        ) : (
                          <input name={`f:${f.key}`} defaultValue={st.fields[f.key] ?? ""} placeholder={f.def} className={box} />
                        )}
                      </div>
                    );
                  })}
                </div>
              </fieldset>
            ))}
          </div>
        </SaveForm>
      </section>
    </div>
  );
}
