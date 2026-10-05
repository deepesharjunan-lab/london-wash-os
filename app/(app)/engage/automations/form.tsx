"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { createRecipeTemplateAction, saveAutomationAction, testAutomationAction, type AutomationState } from "./actions";
import { CONDITIONS, CONTEXT_FIELDS, TRIGGERS, triggerByKey, type Recipe } from "@/lib/engage/automation-defs";
import { variableByKey } from "@/lib/engage/variables";
import type { AutoTemplateOption } from "@/lib/engage/automations";
import { ToggleInput } from "@/lib/ui/Toggle";

export type AutomationInitial = {
  id?: string;
  name: string;
  trigger: string;
  delay_minutes: number;
  trigger_days: number;
  condition: string;
  template: string; // name|language, or just a name for recipes
  field_values: Record<string, string>;
  segment_id: string | null;
  respect_quiet: boolean;
  cooldown_days: number;
  active: boolean;
};

const box = "w-full border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-accent";
const label = "mb-1 block text-[12px] font-semibold uppercase tracking-wide text-ink/55";

function Submit({ children, formAction, tone = "green" }: { children: React.ReactNode; formAction: (f: FormData) => void; tone?: "green" | "plain" }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      formAction={formAction}
      disabled={pending}
      className={
        tone === "green"
          ? "rounded-md bg-[#1f7a4d] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#19663f] disabled:opacity-50"
          : "rounded-md border border-black/10 bg-white px-4 py-2 text-sm font-medium text-ink hover:border-navy/40 disabled:opacity-50"
      }
    >
      {pending ? "Working…" : children}
    </button>
  );
}

function splitDelay(minutes: number): [number, number] {
  if (minutes && minutes % 1440 === 0) return [minutes / 1440, 1440];
  if (minutes && minutes % 60 === 0) return [minutes / 60, 60];
  return [minutes, 1];
}

export function AutomationForm({
  initial,
  templates,
  segments,
  recipe,
  recipeTemplate,
}: {
  initial: AutomationInitial;
  templates: AutoTemplateOption[];
  segments: { id: string; name: string }[];
  recipe?: Recipe | null;
  recipeTemplate?: "missing" | "pending" | "approved" | null;
}) {
  const [saveState, saveAction] = useFormState<AutomationState, FormData>(saveAutomationAction, {});
  const [testState, testAction] = useFormState<AutomationState, FormData>(testAutomationAction, {});
  const [trigger, setTrigger] = useState(initial.trigger);
  const [tplKey, setTplKey] = useState(() => templates.find((t) => t.key === initial.template || t.name === initial.template)?.key ?? "");
  const [fixed, setFixed] = useState<Record<string, string>>(initial.field_values ?? {});
  const [d0, u0] = splitDelay(initial.delay_minutes);
  const [creating, startCreate] = useTransition();
  const [created, setCreated] = useState<{ ok: boolean; message: string } | null>(null);
  const t = triggerByKey(trigger)!;
  const tpl = useMemo(() => templates.find((x) => x.key === tplKey) ?? null, [templates, tplKey]);
  const unfillable = tpl ? [...new Set(tpl.vars.map((v) => v.key))].filter((k) => CONTEXT_FIELDS.has(k) && !t.fields.includes(k)) : [];

  const preview = useMemo(() => {
    if (!tpl) return "";
    return tpl.body.replace(/\{\{(\d+)\}\}/g, (_m, n) => {
      const v = tpl.vars.find((x) => x.pos === Number(n));
      if (!v) return `{{${n}}}`;
      return tpl.fixed.includes(v.key) ? fixed[v.key] || `[${variableByKey(v.key)?.label ?? v.key}]` : v.example || variableByKey(v.key)?.example || v.key;
    });
  }, [tpl, fixed]);

  return (
    <form className="grid gap-6 xl:grid-cols-[1fr_360px]">
      {initial.id && <input type="hidden" name="id" value={initial.id} />}
      <div className="space-y-5 border-2 border-black/10 bg-white p-5">
        {recipe?.newTemplate && recipeTemplate !== "approved" && (
          <div className="rounded-md bg-[#fbf7ef] p-3 text-[13px] text-ink/75">
            {recipeTemplate === "pending" ? (
              <>
                The template <b>{recipe.newTemplate.name}</b> is waiting for WhatsApp's approval (usually a few minutes). Reload this page to pick it; you can save now and switch the
                automation on later.
              </>
            ) : created?.ok ? (
              <span className="text-[#2c6a4e]">{created.message}</span>
            ) : (
              <>
                This recipe needs a new WhatsApp template, <b>{recipe.newTemplate.name}</b> ({recipe.newTemplate.category === "MARKETING" ? "marketing" : "utility"}):
                <div className="my-2 whitespace-pre-wrap rounded bg-white p-2 text-[12.5px] text-ink/70">{recipe.newTemplate.body}</div>
                <button
                  type="button"
                  disabled={creating}
                  onClick={() => startCreate(async () => setCreated(await createRecipeTemplateAction(recipe.key)))}
                  className="rounded-md bg-navy px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-50"
                >
                  {creating ? "Sending to WhatsApp…" : "Create this template for me"}
                </button>
                <span className="ml-2 text-[12px] text-ink/50">
                  or{" "}
                  <Link href="/engage/templates/new" className="text-accent hover:underline">
                    write your own
                  </Link>
                </span>
                {created && !created.ok && <p className="mt-2 text-[12.5px] text-[#9c3326]">{created.message}</p>}
              </>
            )}
          </div>
        )}

        <div>
          <label className={label}>Name</label>
          <input name="name" className={box} maxLength={100} defaultValue={initial.name} placeholder="e.g. Invoice after order" />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={label}>When</label>
            <select name="trigger" className={box} value={trigger} onChange={(e) => setTrigger(e.target.value)}>
              <optgroup label="When something happens">
                {TRIGGERS.filter((x) => x.kind === "event").map((x) => (
                  <option key={x.key} value={x.key}>
                    {x.label}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Daily check">
                {TRIGGERS.filter((x) => x.kind === "daily").map((x) => (
                  <option key={x.key} value={x.key}>
                    {x.label}
                  </option>
                ))}
              </optgroup>
            </select>
            <p className="mt-1 text-[12px] text-ink/50">{t.help}</p>
          </div>
          <div>
            {t.kind === "event" ? (
              <>
                <label className={label}>Wait</label>
                <div className="flex gap-2">
                  <input type="number" name="delay_value" min={0} defaultValue={d0} className={box + " max-w-[110px]"} />
                  <select name="delay_unit" defaultValue={String(u0)} className={box}>
                    <option value="1">minutes</option>
                    <option value="60">hours</option>
                    <option value="1440">days</option>
                  </select>
                </div>
                <p className="mt-1 text-[12px] text-ink/50">0 = straight away (within a minute).</p>
              </>
            ) : (
              <>
                <label className={label}>Days</label>
                <input type="number" name="trigger_days" min={0} max={365} key={trigger} defaultValue={initial.trigger === trigger ? initial.trigger_days : t.defaultDays} className={box + " max-w-[110px]"} />
                <p className="mt-1 text-[12px] text-ink/50">{t.daysLabel}</p>
              </>
            )}
          </div>
        </div>

        <div>
          <label className={label}>Check before sending</label>
          <select name="condition" className={box} defaultValue={initial.condition}>
            {CONDITIONS.filter((c) => !c.orderOnly || t.order).map((c) => (
              <option key={c.key} value={c.key}>
                {c.label}
              </option>
            ))}
          </select>
          <p className="mt-1 text-[12px] text-ink/50">Checked at send time. Messages about a cancelled order are never sent.</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={label}>Template</label>
            <select name="template" className={box} value={tplKey} onChange={(e) => setTplKey(e.target.value)}>
              <option value="">Choose…</option>
              {templates.map((x) => (
                <option key={x.key} value={x.key}>
                  {x.name} ({x.category === "MARKETING" ? "marketing" : "utility"}){x.approved ? "" : " · waiting for approval"}
                </option>
              ))}
            </select>
            {unfillable.length > 0 && (
              <p className="mt-1 text-[12px] text-[#9c3326]">
                Uses {unfillable.map((k) => variableByKey(k)?.label ?? k).join(", ")}, which “{t.label}” can't fill.
              </p>
            )}
          </div>
          <div>
            <label className={label}>Only for (optional)</label>
            <select name="segment_id" className={box} defaultValue={initial.segment_id ?? ""}>
              <option value="">All customers</option>
              {segments.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {tpl && tpl.fixed.length > 0 && (
          <div>
            <label className={label}>Same for everyone</label>
            <div className="grid gap-2 sm:grid-cols-2">
              {tpl.fixed.map((k) => (
                <div key={k}>
                  <div className="mb-0.5 text-[12.5px] text-ink/70">{variableByKey(k)?.label ?? k}</div>
                  <input name={`field_${k}`} className={box} maxLength={200} placeholder={variableByKey(k)?.example} value={fixed[k] ?? ""} onChange={(e) => setFixed({ ...fixed, [k]: e.target.value })} />
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="grid gap-3 text-[13.5px] text-ink/75 sm:grid-cols-2">
          <ToggleInput name="respect_quiet" defaultChecked={initial.respect_quiet} label="Quiet hours" hint="Hold messages due between 9 pm and 9 am until 9 am" />
          <div className="flex items-center gap-2">
            Don't repeat for the same customer within
            <input type="number" name="cooldown_days" min={0} max={365} defaultValue={initial.cooldown_days} className="w-16 border border-black/10 bg-white px-2 py-1.5 text-sm" /> days
          </div>
        </div>
        {tpl?.category === "MARKETING" && (
          <p className="-mt-2 text-[12px] text-ink/50">Marketing message: customers who replied STOP are skipped, and nobody gets more than one marketing message a day.</p>
        )}

        <ToggleInput name="active" defaultChecked={initial.active} label={<b className="font-semibold">Switched on</b>} />

        <div className="rounded-md bg-[#fbf7ef] p-3">
          <label className={label}>Send a test now</label>
          <div className="flex flex-wrap gap-2">
            <input name="test_phone" className={box + " max-w-[220px]"} placeholder="Your WhatsApp number" />
            <Submit formAction={testAction} tone="plain">
              Send test
            </Submit>
          </div>
          <p className="mt-1 text-[12px] text-ink/50">Uses that customer's latest order for order details and the invoice link, when the number belongs to a customer.</p>
          {testState.testResult && <p className="mt-2 text-[12.5px] text-[#2c6a4e]">{testState.testResult}</p>}
          {testState.error && <p className="mt-2 text-[12.5px] text-[#9c3326]">{testState.error}</p>}
        </div>

        {saveState.error && <p className="rounded-md bg-[#f6e4df] px-3 py-2 text-[13px] text-[#9c3326]">{saveState.error}</p>}
        <div className="flex items-center gap-3">
          <Submit formAction={saveAction}>{initial.id ? "Save changes" : "Save automation"}</Submit>
          <Link href="/engage/automations" className="text-sm text-ink/60 hover:underline">
            Cancel
          </Link>
        </div>
      </div>

      <aside className="self-start xl:sticky xl:top-20">
        <div className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-ink/55">Preview</div>
        {tpl ? (
          <div className="rounded-xl bg-[#e5ddd5] p-4">
            <div className="max-w-[300px] overflow-hidden rounded-lg bg-white text-[13.5px] shadow-sm">
              {tpl.headerFormat === "IMAGE" &&
                (tpl.headerImage ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={tpl.headerImage} alt="" className="max-h-44 w-full object-cover" />
                ) : (
                  <div className="grid h-28 place-items-center bg-black/5 text-[12px] text-ink/40">Image</div>
                ))}
              <div className="px-3 pb-1.5 pt-2">
                {tpl.headerFormat === "TEXT" && tpl.headerText && <div className="mb-1 font-bold">{tpl.headerText}</div>}
                <div className="whitespace-pre-wrap break-words">{preview}</div>
                {tpl.footer && <div className="mt-1.5 text-[12px] text-ink/45">{tpl.footer}</div>}
              </div>
              {tpl.buttons.map((b, i) => (
                <div key={i} className="border-t border-black/5 py-2 text-center text-[13.5px] font-medium text-[#1a8cd8]">
                  {b.text}
                </div>
              ))}
            </div>
          </div>
        ) : (
          <p className="text-[13px] text-ink/50">Choose a template to see the message.</p>
        )}
        <p className="mt-2 text-[12px] text-ink/50">Customer and order details are filled in when each message is sent.</p>
      </aside>
    </form>
  );
}
