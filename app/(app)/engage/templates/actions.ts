"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { consoleUserId } from "@/lib/auth/console-user";
import { createTemplate, deleteTemplate, uploadHeaderImage } from "@/lib/whatsapp/meta-templates";
import { TEMPLATE_DEFS } from "@/lib/whatsapp/templates";
import { ENGAGE_VARIABLES, slugTemplateName, toPositional, variableByKey } from "@/lib/engage/variables";

// ENGAGE → Templates: build a WhatsApp template in the console and submit it
// to Meta for approval on both WhatsApp accounts.

const SYSTEM = new Set<string>(TEMPLATE_DEFS.map((t) => t.name));
const VAR_KEYS = new Set(ENGAGE_VARIABLES.map((v) => v.key));

export type TemplateDraft = {
  name: string;
  category: "MARKETING" | "UTILITY";
  language: string;
  headerType: "NONE" | "TEXT" | "IMAGE";
  headerText: string;
  body: string; // with named fields like {{first_name}}
  footer: string;
  buttons: { type: "QUICK_REPLY" | "URL" | "PHONE_NUMBER"; text: string; url?: string; urlVariable?: string; phone?: string }[];
  examples: Record<string, string>; // sample value per field, for Meta's review
};

export type CreateState = { error?: string; results?: { account: string; ok: boolean; message: string }[]; name?: string };

export async function createTemplateAction(_prev: CreateState, form: FormData): Promise<CreateState> {
  const userId = await consoleUserId();
  if (!userId) return { error: "Your session has ended. Sign in again." };

  let d: TemplateDraft;
  try {
    d = JSON.parse(String(form.get("draft") ?? ""));
  } catch {
    return { error: "Something went wrong reading the form. Please try again." };
  }

  const name = slugTemplateName(d.name);
  if (!name || name.length < 3) return { error: "Give the template a name (letters, numbers and underscores)." };
  if (SYSTEM.has(name)) return { error: "That name is used by a system template. Choose another." };
  if (!["MARKETING", "UTILITY"].includes(d.category)) return { error: "Choose Marketing or Utility." };

  const body = (d.body ?? "").trim();
  if (!body) return { error: "Write the message text." };
  if (body.length > 1024) return { error: "The message is too long (1,024 characters max)." };
  if (/^\s*\{\{/.test(body) || /\}\}\s*[.!?]?\s*$/.test(body)) return { error: "WhatsApp doesn't allow a {{field}} at the very start or end of the message. Add a few words before or after it." };
  if (/\}\}\s*\{\{/.test(body)) return { error: "Put at least one word between two {{fields}}." };

  const { text: bodyText, keys } = toPositional(body);
  const unknown = keys.filter((k) => !VAR_KEYS.has(k));
  if (unknown.length) return { error: `Unknown field: {{${unknown[0]}}}. Use the "Insert field" menu.` };
  const example = (k: string) => (d.examples?.[k] || variableByKey(k)?.example || "sample").slice(0, 60);

  const components: any[] = [];
  let headerImageUrl: string | null = null;
  if (d.headerType === "TEXT") {
    const h = (d.headerText ?? "").trim();
    if (!h) return { error: "Write the header text, or choose No header." };
    if (h.length > 60) return { error: "The header is too long (60 characters max)." };
    if (/\{\{/.test(h)) return { error: "Fields aren't supported in the header yet. Put them in the message instead." };
    components.push({ type: "HEADER", format: "TEXT", text: h });
  } else if (d.headerType === "IMAGE") {
    const img = form.get("image");
    if (!(img instanceof File) || !img.size) return { error: "Choose a header image (JPG or PNG), or choose No header." };
    const up = await uploadHeaderImage(img);
    if (!up.ok) return { error: up.error };
    headerImageUrl = up.url;
    components.push({ type: "HEADER", format: "IMAGE", example: { header_handle: [up.handle] } });
  }

  components.push(keys.length ? { type: "BODY", text: bodyText, example: { body_text: [keys.map(example)] } } : { type: "BODY", text: bodyText });

  const footer = (d.footer ?? "").trim();
  if (footer) {
    if (footer.length > 60) return { error: "The footer is too long (60 characters max)." };
    components.push({ type: "FOOTER", text: footer });
  }

  const buttons: any[] = [];
  let urlButtonVariable: string | null = null;
  for (const b of (d.buttons ?? []).slice(0, 3)) {
    const text = (b.text ?? "").trim();
    if (!text) return { error: "Every button needs a label." };
    if (text.length > 25) return { error: `The button "${text}" is too long (25 characters max).` };
    if (b.type === "QUICK_REPLY") buttons.push({ type: "QUICK_REPLY", text });
    else if (b.type === "PHONE_NUMBER") {
      const phone = (b.phone ?? "").replace(/[^\d+]/g, "");
      if (phone.replace(/\D/g, "").length < 10) return { error: `Add a phone number for the "${text}" button.` };
      buttons.push({ type: "PHONE_NUMBER", text, phone_number: phone.startsWith("+") ? phone : `+${phone}` });
    } else {
      const url = (b.url ?? "").trim();
      if (!/^https:\/\/[^\s]+$/.test(url)) return { error: `Add a full web address starting with https:// for the "${text}" button.` };
      if (b.urlVariable) {
        if (!VAR_KEYS.has(b.urlVariable)) return { error: "Unknown field for the button link." };
        urlButtonVariable = b.urlVariable;
        const base = url.replace(/\{\{.*\}\}$/, "").replace(/\/?$/, "/");
        buttons.push({ type: "URL", text, url: `${base}{{1}}`, example: [`${base}${example(b.urlVariable)}`] });
      } else buttons.push({ type: "URL", text, url });
    }
  }
  if (buttons.length) components.push({ type: "BUTTONS", buttons });

  const results = await createTemplate({ name, category: d.category, language: d.language || "en", components });
  if (!results.some((r) => r.ok)) return { error: `Meta didn't accept the template: ${results.map((r) => `${r.account}: ${r.message}`).join(" · ")}`, results };

  await createAdminClient()
    .from("whatsapp_template_meta")
    .upsert(
      {
        name,
        category: d.category,
        language: d.language || "en",
        variables: keys.map((key, i) => ({ pos: i + 1, key, example: example(key) })),
        header_type: d.headerType === "NONE" ? null : d.headerType,
        header_image_url: headerImageUrl,
        url_button_variable: urlButtonVariable,
        created_by_user_id: userId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "name" }
    );
  revalidatePath("/engage/templates");
  return { results, name };
}

export async function deleteTemplateAction(form: FormData) {
  if (!(await consoleUserId())) return;
  const name = String(form.get("name") ?? "");
  if (!name || SYSTEM.has(name)) return;
  await deleteTemplate(name);
  await createAdminClient().from("whatsapp_template_meta").delete().eq("name", name);
  revalidatePath("/engage/templates");
  redirect("/engage/templates?deleted=" + encodeURIComponent(name));
}
