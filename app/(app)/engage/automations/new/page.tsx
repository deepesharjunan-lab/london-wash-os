import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { automationTemplates } from "@/lib/engage/automations";
import { recipeByKey, triggerByKey } from "@/lib/engage/automation-defs";
import { AutomationForm, type AutomationInitial } from "../form";

export const dynamic = "force-dynamic";

export default async function NewAutomationPage({ searchParams }: { searchParams: { recipe?: string } }) {
  const recipe = recipeByKey(searchParams.recipe) ?? null;
  const [{ templates, sendingLabel }, { data: segs }] = await Promise.all([automationTemplates(), createAdminClient().from("engage_segment").select("id, name").order("name")]);
  const tpl = recipe ? templates.find((t) => t.name === recipe.template) : undefined;
  const recipeTemplate = recipe ? (tpl ? (tpl.approved ? "approved" : "pending") : "missing") : null;
  const trigger = recipe?.trigger ?? "order_placed";
  const initial: AutomationInitial = {
    name: recipe?.title ?? "",
    trigger,
    delay_minutes: recipe?.delay_minutes ?? 0,
    trigger_days: recipe?.trigger_days ?? triggerByKey(trigger)?.defaultDays ?? 0,
    condition: recipe?.condition ?? "none",
    template: recipe?.template ?? "",
    field_values: {},
    segment_id: null,
    respect_quiet: recipe?.respect_quiet ?? true,
    cooldown_days: recipe?.cooldown_days ?? 0,
    active: recipeTemplate === "approved",
  };

  return (
    <div>
      <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-accent">
        <Link href="/engage/automations" className="hover:underline">
          Engage · Automations
        </Link>
      </div>
      <h1 className="mb-2 font-archivo text-2xl font-extrabold text-ink">{recipe ? recipe.title : "New automation"}</h1>
      <p className="mb-5 max-w-3xl text-sm text-ink/60">
        {recipe ? recipe.blurb + " " : ""}Sends from: <b>{sendingLabel ?? "—"}</b>
        {sendingLabel === "Test account" ? " (Meta's test number only delivers to phone numbers registered as test recipients)" : ""}.
      </p>
      <AutomationForm initial={initial} templates={templates} segments={(segs ?? []) as { id: string; name: string }[]} recipe={recipe} recipeTemplate={recipeTemplate} />
    </div>
  );
}
