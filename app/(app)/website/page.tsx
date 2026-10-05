import Link from "next/link";
import { getSiteSettingsFresh } from "@/lib/site/settings";
import { BUSINESS_FIELDS, FLAG_INFO, SECTIONS } from "@/lib/site/defs";
import { ToggleButton } from "@/lib/ui/Toggle";
import { restoreAction, saveBusinessAction, savePickupAction, toggleFlagAction, toggleSectionAction } from "./actions";
import { SaveForm, box, label } from "./ui";

// WEBSITE → Overview: feature switches, sections on/off, business details,
// pickup booking settings, and a live preview of www.thelondonwash.com.

export const dynamic = "force-dynamic";

const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" }) : "never";
const fmtWindows = (w: { start: string; end: string }[]) => w.map((x) => `${x.start.replace(/:00$/, "")}-${x.end.replace(/:00$/, "")}`).join(", ");

function Undo({ k }: { k: string }) {
  return (
    <form action={restoreAction} className="inline">
      <input type="hidden" name="key" value={k} />
      <button type="submit" className="text-[12px] text-ink/45 hover:text-ink hover:underline" title="Put back the version from before the last save">
        ↶ Undo last change
      </button>
    </form>
  );
}

export default async function WebsitePage() {
  const st = await getSiteSettingsFresh();

  return (
    <div>
      <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-accent">Website</div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-archivo text-2xl font-extrabold text-ink">Website overview</h1>
        <div className="flex gap-2">
          <Link href="/website/content" className="rounded-md border border-black/10 bg-white px-4 py-2 text-sm font-medium text-ink hover:border-navy/40">
            Edit texts &amp; prices
          </Link>
          <a href="https://www.thelondonwash.com/" target="_blank" rel="noopener" className="rounded-md bg-navy px-4 py-2 text-sm font-semibold text-white">
            Open the website ↗
          </a>
        </div>
      </div>
      <p className="mb-6 max-w-3xl text-sm text-ink/60">
        Everything on www.thelondonwash.com is managed here. Changes go live within a few seconds. Last change: {when(st.updatedAt)}.
      </p>

      <div className="grid gap-6 xl:grid-cols-[1fr_420px]">
        <div className="space-y-6">
          <section className="border-2 border-black/10 bg-white p-5">
            <h2 className="mb-3 font-archivo text-lg font-bold text-ink">Features</h2>
            {FLAG_INFO.map((f) => (
              <div key={f.key} className="flex items-start justify-between gap-4">
                <div>
                  <div className="font-semibold text-ink">{f.label}</div>
                  <p className="max-w-xl text-[13px] text-ink/60">{f.help}</p>
                </div>
                <form action={toggleFlagAction}>
                  <input type="hidden" name="key" value={f.key} />
                  <input type="hidden" name="on" value={st.flags[f.key] ? "0" : "1"} />
                  <ToggleButton on={st.flags[f.key]} label={f.label} />
                </form>
              </div>
            ))}
          </section>

          <section className="border-2 border-black/10 bg-white p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-archivo text-lg font-bold text-ink">Sections</h2>
              <Undo k="sections" />
            </div>
            <ul className="divide-y divide-black/5">
              {SECTIONS.map((s) => {
                const on = st.sections[s.key] !== false;
                const hiddenByFeature = s.pickupOnly && !st.flags.pickup;
                return (
                  <li key={s.key} className="flex items-center justify-between gap-4 py-2.5">
                    <div>
                      <div className="text-[14px] font-medium text-ink">{s.label}</div>
                      {(s.help || hiddenByFeature) && (
                        <div className="text-[12px] text-ink/50">{hiddenByFeature ? "Hidden while Pickup & delivery is off. " : ""}{s.help}</div>
                      )}
                    </div>
                    <form action={toggleSectionAction}>
                      <input type="hidden" name="key" value={s.key} />
                      <input type="hidden" name="on" value={on ? "0" : "1"} />
                      <ToggleButton on={on} label={s.label} small />
                    </form>
                  </li>
                );
              })}
            </ul>
          </section>

          <section className="border-2 border-black/10 bg-white p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-archivo text-lg font-bold text-ink">Business details</h2>
              <Undo k="business" />
            </div>
            <p className="mb-3 text-[13px] text-ink/55">Used everywhere on the website (contact section, footer, WhatsApp buttons) and in the details Google reads.</p>
            <SaveForm action={saveBusinessAction} saveText="Save business details">
              <div className="grid gap-3 sm:grid-cols-2">
                {BUSINESS_FIELDS.map((f) => (
                  <div key={f.key} className={f.multiline ? "sm:col-span-2" : ""}>
                    <label className={label}>{f.label}</label>
                    {f.multiline ? (
                      <textarea name={f.key} defaultValue={st.business[f.key]} rows={3} className={box} />
                    ) : (
                      <input name={f.key} defaultValue={st.business[f.key]} className={box} />
                    )}
                    {f.help && <p className="mt-0.5 text-[11.5px] text-ink/45">{f.help}</p>}
                  </div>
                ))}
              </div>
            </SaveForm>
          </section>

          <section className="border-2 border-black/10 bg-white p-5">
            <div className="mb-1 flex items-center justify-between">
              <h2 className="font-archivo text-lg font-bold text-ink">Pickup booking settings</h2>
              <Undo k="pickup" />
            </div>
            <p className="mb-3 text-[13px] text-ink/55">
              Used by WhatsApp chat booking and the Club app while <b>Pickup &amp; delivery</b> is {st.flags.pickup ? "on" : <b className="text-[#9c3326]">off</b>}.
            </p>
            <SaveForm action={savePickupAction} saveText="Save pickup settings">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className={label}>Pickup area (km from the store)</label>
                  <input name="radius_km" type="number" min={1} max={100} defaultValue={st.pickup.radius_km} className={box} />
                </div>
                <div>
                  <label className={label}>Pickups per time window</label>
                  <input name="capacity" type="number" min={1} max={50} defaultValue={st.pickup.capacity} className={box} />
                </div>
                <div>
                  <label className={label}>Days customers can book ahead</label>
                  <input name="days_ahead" type="number" min={1} max={14} defaultValue={st.pickup.days_ahead} className={box} />
                </div>
                <div>
                  <label className={label}>Earliest booking (minutes from now)</label>
                  <input name="lead_minutes" type="number" min={0} max={1440} defaultValue={st.pickup.lead_minutes} className={box} />
                </div>
                <div className="sm:col-span-2">
                  <label className={label}>Time windows, Monday – Saturday</label>
                  <input name="weekday_windows" defaultValue={fmtWindows(st.pickup.weekday_windows)} className={box} />
                </div>
                <div className="sm:col-span-2">
                  <label className={label}>Time windows, Sunday (leave empty for no Sunday pickups)</label>
                  <input name="sunday_windows" defaultValue={fmtWindows(st.pickup.sunday_windows)} className={box} />
                  <p className="mt-0.5 text-[11.5px] text-ink/45">24-hour clock, e.g. 9-11, 11-13, 14-16.</p>
                </div>
              </div>
            </SaveForm>
          </section>
        </div>

        <aside className="self-start xl:sticky xl:top-20">
          <div className="mb-2 flex items-center justify-between text-[12px] font-semibold uppercase tracking-wide text-ink/55">
            <span>Live preview</span>
            <a href="/api/public/site/home?fresh=1" target="_blank" rel="noopener" className="normal-case text-accent hover:underline">
              open full size ↗
            </a>
          </div>
          <div className="h-[640px] overflow-hidden border-2 border-black/10 bg-white">
            <iframe src="/api/public/site/home?fresh=1" title="Website preview" className="h-[1280px] w-[200%] origin-top-left scale-50 border-0" />
          </div>
        </aside>
      </div>
    </div>
  );
}
