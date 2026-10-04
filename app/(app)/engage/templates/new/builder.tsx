"use client";

import Link from "next/link";
import { useMemo, useRef, useState, useTransition } from "react";
import { useFormState } from "react-dom";
import { createTemplateAction, type CreateState, type TemplateDraft } from "../actions";
import { ENGAGE_VARIABLES, TEMPLATE_LANGUAGES, slugTemplateName, variableByKey } from "@/lib/engage/variables";

const STOP_FOOTER = "Reply STOP to unsubscribe";
type Btn = TemplateDraft["buttons"][number];

const input = "w-full border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-accent";
const label = "mb-1 block text-[12px] font-semibold uppercase tracking-wide text-ink/55";

export function TemplateBuilder() {
  const [state, action] = useFormState<CreateState, FormData>(createTemplateAction, {});
  const [pending, start] = useTransition();
  const [name, setName] = useState("");
  const [category, setCategory] = useState<"MARKETING" | "UTILITY">("MARKETING");
  const [language, setLanguage] = useState("en");
  const [headerType, setHeaderType] = useState<"NONE" | "TEXT" | "IMAGE">("NONE");
  const [headerText, setHeaderText] = useState("");
  const [image, setImage] = useState<File | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [body, setBody] = useState("Hi {{first_name}}, ");
  const [footer, setFooter] = useState(STOP_FOOTER);
  const [buttons, setButtons] = useState<Btn[]>([]);
  const [examples, setExamples] = useState<Record<string, string>>({});
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  const used = useMemo(() => {
    const keys: string[] = [];
    for (const m of body.matchAll(/\{\{\s*([a-z_]+)\s*\}\}/g)) if (!keys.includes(m[1])) keys.push(m[1]);
    for (const b of buttons) if (b.type === "URL" && b.urlVariable && !keys.includes(b.urlVariable)) keys.push(b.urlVariable);
    return keys;
  }, [body, buttons]);
  const sample = (k: string) => examples[k] || variableByKey(k)?.example || k;

  function insertField(key: string) {
    const el = bodyRef.current;
    const token = `{{${key}}}`;
    if (!el) return setBody((b) => b + token);
    const s = el.selectionStart ?? body.length;
    const e = el.selectionEnd ?? body.length;
    const next = body.slice(0, s) + token + body.slice(e);
    setBody(next);
    requestAnimationFrame(() => {
      el.focus();
      el.selectionStart = el.selectionEnd = s + token.length;
    });
  }

  function setCat(c: "MARKETING" | "UTILITY") {
    setCategory(c);
    if (c === "MARKETING" && !footer) setFooter(STOP_FOOTER);
    if (c === "UTILITY" && footer === STOP_FOOTER) setFooter("The London Wash · the art of laundry.");
  }

  function submit() {
    const draft: TemplateDraft = { name, category, language, headerType, headerText, body, footer, buttons, examples };
    const fd = new FormData();
    fd.set("draft", JSON.stringify(draft));
    if (headerType === "IMAGE" && image) fd.set("image", image);
    start(() => action(fd));
  }

  const preview = body.split(/(\{\{\s*[a-z_]+\s*\}\})/g).map((part, i) => {
    const m = part.match(/^\{\{\s*([a-z_]+)\s*\}\}$/);
    return m ? (
      <mark key={i} className="rounded bg-[#fdf0dc] px-0.5 text-[#8a5a12]">
        {sample(m[1])}
      </mark>
    ) : (
      <span key={i}>{part}</span>
    );
  });

  if (state.results && state.name) {
    return (
      <div className="max-w-xl border-2 border-black/10 bg-white p-6">
        <h2 className="mb-2 text-lg font-bold text-ink">Template submitted to WhatsApp</h2>
        <p className="mb-3 text-sm text-ink/70">
          <b>{state.name}</b> is now waiting for Meta's approval. This usually takes a few minutes, sometimes up to a day. The status updates on the Templates page.
        </p>
        <ul className="mb-4 space-y-1 text-[13px]">
          {state.results.map((r) => (
            <li key={r.account} className={r.ok ? "text-[#2c6a4e]" : "text-[#9c3326]"}>
              {r.ok ? "✓" : "✕"} {r.account}: {r.ok ? `submitted (${r.message.toLowerCase()})` : r.message}
            </li>
          ))}
        </ul>
        <Link href="/engage/templates" className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white">
          Back to templates
        </Link>
      </div>
    );
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
      <div className="space-y-5 border-2 border-black/10 bg-white p-5">
        <div className="grid gap-4 sm:grid-cols-[1fr_auto_auto]">
          <div>
            <label className={label}>Template name</label>
            <input className={input} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Diwali offer 2026" maxLength={60} />
            {name && <p className="mt-1 text-[11.5px] text-ink/50">Saved as {slugTemplateName(name) || "…"}</p>}
          </div>
          <div>
            <label className={label}>Type</label>
            <div className="flex overflow-hidden rounded-md border border-black/10">
              {(["MARKETING", "UTILITY"] as const).map((c) => (
                <button key={c} type="button" onClick={() => setCat(c)} className={`px-3 py-2 text-[13px] font-medium ${category === c ? "bg-navy text-white" : "bg-white text-ink/70"}`}>
                  {c === "MARKETING" ? "Marketing" : "Utility"}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className={label}>Language</label>
            <select className={input} value={language} onChange={(e) => setLanguage(e.target.value)}>
              {TEMPLATE_LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <p className="-mt-2 text-[12px] text-ink/50">
          {category === "MARKETING"
            ? "Marketing: offers, festivals, win-back, new services. Meta charges more per message, and customers can opt out."
            : "Utility: updates about an order or account the customer already has (order ready, pickup booked, invoice). Cheaper; no promotions allowed."}
        </p>

        <div>
          <label className={label}>Header (optional)</label>
          <div className="mb-2 flex gap-1.5">
            {(["NONE", "TEXT", "IMAGE"] as const).map((h) => (
              <button
                key={h}
                type="button"
                onClick={() => setHeaderType(h)}
                className={`rounded-full border px-3 py-1 text-[12.5px] ${headerType === h ? "border-navy bg-navy text-white" : "border-black/10 bg-white text-ink/70"}`}
              >
                {h === "NONE" ? "No header" : h === "TEXT" ? "Text" : "Image"}
              </button>
            ))}
          </div>
          {headerType === "TEXT" && <input className={input} value={headerText} onChange={(e) => setHeaderText(e.target.value)} maxLength={60} placeholder="e.g. Festive offer 🎉" />}
          {headerType === "IMAGE" && (
            <input
              type="file"
              accept="image/jpeg,image/png"
              className="text-sm"
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null;
                setImage(f);
                setImageUrl(f ? URL.createObjectURL(f) : null);
              }}
            />
          )}
        </div>

        <div>
          <div className="mb-1 flex items-end justify-between gap-2">
            <label className={label + " mb-0"}>Message</label>
            <select
              className="border border-black/10 bg-white px-2 py-1 text-[12.5px]"
              value=""
              onChange={(e) => {
                if (e.target.value) insertField(e.target.value);
              }}
            >
              <option value="">+ Insert field…</option>
              {ENGAGE_VARIABLES.map((v) => (
                <option key={v.key} value={v.key}>
                  {v.label}
                </option>
              ))}
            </select>
          </div>
          <textarea ref={bodyRef} className={input + " min-h-[140px]"} value={body} onChange={(e) => setBody(e.target.value)} maxLength={1024} />
          <p className="mt-1 text-[11.5px] text-ink/50">
            *bold*, _italic_ and emoji work. Fields like {"{{first_name}}"} are filled in for each customer. {body.length}/1024
          </p>
        </div>

        {used.length > 0 && (
          <div>
            <label className={label}>Sample values (shown to Meta for approval)</label>
            <div className="grid gap-2 sm:grid-cols-2">
              {used.map((k) => (
                <div key={k} className="flex items-center gap-2">
                  <span className="w-40 shrink-0 truncate text-[12.5px] text-ink/70">{variableByKey(k)?.label ?? k}</span>
                  <input className={input} value={examples[k] ?? ""} placeholder={variableByKey(k)?.example} onChange={(e) => setExamples({ ...examples, [k]: e.target.value })} />
                </div>
              ))}
            </div>
          </div>
        )}

        <div>
          <label className={label}>Footer (optional)</label>
          <input className={input} value={footer} onChange={(e) => setFooter(e.target.value)} maxLength={60} />
          {category === "MARKETING" && !/stop/i.test(footer) && <p className="mt-1 text-[11.5px] text-[#8a5a12]">Tip: keep "Reply STOP to unsubscribe" on marketing messages.</p>}
        </div>

        <div>
          <label className={label}>Buttons (optional, up to 3)</label>
          <div className="space-y-2">
            {buttons.map((b, i) => (
              <div key={i} className="grid gap-2 rounded-md bg-[#fbf7ef] p-2 sm:grid-cols-[130px_1fr_1.4fr_auto]">
                <select
                  className={input}
                  value={b.type}
                  onChange={(e) => setButtons(buttons.map((x, j) => (j === i ? { type: e.target.value as Btn["type"], text: x.text } : x)))}
                >
                  <option value="QUICK_REPLY">Quick reply</option>
                  <option value="URL">Open website</option>
                  <option value="PHONE_NUMBER">Call us</option>
                </select>
                <input className={input} value={b.text} maxLength={25} placeholder="Button label" onChange={(e) => setButtons(buttons.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))} />
                {b.type === "URL" ? (
                  <div className="flex gap-1">
                    <input className={input} value={b.url ?? ""} placeholder="https://www.thelondonwash.com" onChange={(e) => setButtons(buttons.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)))} />
                    <select
                      className="border border-black/10 bg-white px-1 text-[12px]"
                      value={b.urlVariable ?? ""}
                      title="Add a field to the end of the link"
                      onChange={(e) => setButtons(buttons.map((x, j) => (j === i ? { ...x, urlVariable: e.target.value || undefined } : x)))}
                    >
                      <option value="">fixed link</option>
                      {ENGAGE_VARIABLES.map((v) => (
                        <option key={v.key} value={v.key}>
                          + {v.label}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : b.type === "PHONE_NUMBER" ? (
                  <input className={input} value={b.phone ?? ""} placeholder="+91 85900 00868" onChange={(e) => setButtons(buttons.map((x, j) => (j === i ? { ...x, phone: e.target.value } : x)))} />
                ) : (
                  <span className="self-center text-[12px] text-ink/45">The customer's tap arrives in the WhatsApp Inbox.</span>
                )}
                <button type="button" onClick={() => setButtons(buttons.filter((_, j) => j !== i))} className="px-2 text-ink/40 hover:text-ink" aria-label="Remove button">
                  ×
                </button>
              </div>
            ))}
          </div>
          {buttons.length < 3 && (
            <button type="button" onClick={() => setButtons([...buttons, { type: "QUICK_REPLY", text: "" }])} className="mt-2 text-[13px] font-medium text-accent hover:underline">
              + Add button
            </button>
          )}
        </div>

        {state.error && <p className="rounded-md bg-[#f6e4df] px-3 py-2 text-[13px] text-[#9c3326]">{state.error}</p>}
        <div className="flex items-center gap-3">
          <button type="button" onClick={submit} disabled={pending} className="rounded-md bg-[#1f7a4d] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#19663f] disabled:opacity-50">
            {pending ? "Submitting…" : "Submit for approval"}
          </button>
          <Link href="/engage/templates" className="text-sm text-ink/60 hover:underline">
            Cancel
          </Link>
        </div>
      </div>

      <aside className="self-start xl:sticky xl:top-20">
        <div className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-ink/55">Preview</div>
        <div className="rounded-xl bg-[#e5ddd5] p-4">
          <div className="max-w-[300px] overflow-hidden rounded-lg bg-white text-[13.5px] shadow-sm">
            {headerType === "IMAGE" &&
              (imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={imageUrl} alt="" className="max-h-48 w-full object-cover" />
              ) : (
                <div className="grid h-32 place-items-center bg-black/5 text-[12px] text-ink/40">Header image</div>
              ))}
            <div className="px-3 pb-1.5 pt-2">
              {headerType === "TEXT" && headerText && <div className="mb-1 font-bold text-ink">{headerText}</div>}
              <div className="whitespace-pre-wrap break-words text-ink">{preview}</div>
              {footer && <div className="mt-1.5 text-[12px] text-ink/45">{footer}</div>}
              <div className="mt-1 text-right text-[10.5px] text-ink/40">10:30</div>
            </div>
            {buttons.map((b, i) => (
              <div key={i} className="border-t border-black/5 py-2 text-center text-[13.5px] font-medium text-[#1a8cd8]">
                {b.type === "URL" ? "↗ " : b.type === "PHONE_NUMBER" ? "✆ " : "↩ "}
                {b.text || "Button"}
              </div>
            ))}
          </div>
        </div>
        <p className="mt-2 text-[12px] text-ink/50">Highlighted words are fields; each customer sees their own details.</p>
      </aside>
    </div>
  );
}
