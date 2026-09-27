"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// Form helpers. Rupee inputs are converted to paise (minor units).
const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const int = (f: FormData, k: string, d = 0) => {
  const n = Number(str(f, k));
  return Number.isFinite(n) && str(f, k) !== "" ? Math.round(n) : d;
};
const dec = (f: FormData, k: string, d = 1) => {
  const n = Number(str(f, k));
  return Number.isFinite(n) && str(f, k) !== "" ? Math.round(n * 100) / 100 : d;
};
const rupees = (f: FormData, k: string, d = 0) => {
  const s = str(f, k);
  const n = Number(s);
  return s !== "" && Number.isFinite(n) ? Math.round(n * 100) : d;
};
const rupeesOrNull = (f: FormData, k: string) => (str(f, k) === "" ? null : rupees(f, k));
const bool = (f: FormData, k: string) => f.get(k) === "on" || f.get(k) === "true";

function done(path: string, msg: string): never {
  revalidatePath(path);
  revalidatePath("/club");
  redirect(`${path}?saved=${encodeURIComponent(msg)}`);
}
function fail(path: string, msg: string): never {
  redirect(`${path}?error=${encodeURIComponent(msg)}`);
}

/* ---------------- Rules ---------------- */
export async function saveRules(f: FormData) {
  const id = str(f, "id");
  const mode = str(f, "qualification_mode");
  const supabase = createClient();
  const { error } = await supabase
    .from("loyalty_program_config")
    .update({
      qualification_mode: ["spend", "orders", "combo"].includes(mode) ? mode : "spend",
      qualification_period_months: Math.max(1, int(f, "qualification_period_months", 12)),
      renewal_period_months: Math.max(1, int(f, "renewal_period_months", 12)),
      downgrade_grace_days: Math.max(0, int(f, "downgrade_grace_days", 30)),
      family_orders_count: bool(f, "family_orders_count"),
      spend_per_point_minor: Math.max(100, rupees(f, "spend_per_point", 10000)),
      point_value_minor: Math.max(0, rupees(f, "point_value", 12)),
      points_expiry_months: Math.max(1, int(f, "points_expiry_months", 12)),
      max_redeem_pct: Math.min(100, Math.max(1, int(f, "max_redeem_pct", 50))),
      redeem_step_points: Math.max(1, int(f, "redeem_step_points", 100)),
      points_available_on: str(f, "points_available_on") === "paid" ? "paid" : "delivered",
      bonus_welcome_points: Math.max(0, int(f, "bonus_welcome_points")),
      bonus_review_points: Math.max(0, int(f, "bonus_review_points")),
      review_window_days: Math.max(1, int(f, "review_window_days", 30)),
      bonus_app_order_points: Math.max(0, int(f, "bonus_app_order_points")),
      bonus_pickup_points: Math.max(0, int(f, "bonus_pickup_points")),
      bonus_festival_points: Math.max(0, int(f, "bonus_festival_points")),
      referral_give_minor: Math.max(0, rupees(f, "referral_give")),
      referral_get_minor: Math.max(0, rupees(f, "referral_get")),
      referral_min_first_order_minor: Math.max(0, rupees(f, "referral_min_first_order")),
      referral_validity_days: Math.max(1, int(f, "referral_validity_days", 30)),
      referral_block_same_household: bool(f, "referral_block_same_household"),
      referral_block_same_device: bool(f, "referral_block_same_device"),
      birthday_perk: str(f, "birthday_perk") || "Free pickup & delivery",
      delivery_fee_minor: Math.max(0, rupees(f, "delivery_fee")),
      free_delivery_above_minor: Math.max(0, rupees(f, "free_delivery_above")),
    })
    .eq("id", id);
  if (error) {
    console.error(error);
    fail("/club/rules", "Couldn't save the rules. Nothing was changed.");
  }
  done("/club/rules", "Rules saved. They apply to every member from now.");
}

/* ---------------- Tiers ---------------- */
export async function saveTiers(f: FormData) {
  const ids = f.getAll("tier_id").map(String);
  const supabase = createClient();
  const rows = ids.map((id) => ({
    id,
    name: str(f, `name_${id}`),
    min_spend_minor: Math.max(0, rupees(f, `min_spend_${id}`)),
    min_orders: Math.max(0, int(f, `min_orders_${id}`)),
    points_multiplier: Math.max(0.1, dec(f, `mult_${id}`, 1)),
    birthday_points: Math.max(0, int(f, `bday_${id}`)),
    free_delivery_above_minor: rupeesOrNull(f, `free_${id}`),
    priority_processing: bool(f, `prio_${id}`),
    turnaround_hours: str(f, `tat_${id}`) === "" ? null : Math.max(1, int(f, `tat_${id}`)),
    perk_description: str(f, `perk_${id}`) || null,
  }));
  if (rows.some((r) => !r.name)) fail("/club/tiers", "Every tier needs a name.");
  for (let i = 1; i < rows.length; i++) {
    if (rows[i].min_spend_minor <= rows[i - 1].min_spend_minor && rows[i].min_orders <= rows[i - 1].min_orders) {
      fail("/club/tiers", `${rows[i].name} must need more spend or more orders than ${rows[i - 1].name}.`);
    }
  }
  for (const r of rows) {
    const { id, ...rest } = r;
    const { error } = await supabase.from("loyalty_tier").update(rest).eq("id", id);
    if (error) {
      console.error(error);
      fail("/club/tiers", `Couldn't save ${r.name}. Earlier tiers in the list may have saved.`);
    }
  }
  done("/club/tiers", "Tiers saved. Member tiers are recalculated with the new levels.");
}

export async function saveBenefitMatrix(f: FormData) {
  const supabase = createClient();
  const cells = f.getAll("cell").map(String); // "<benefitId>|<tierId>"
  for (const cell of cells) {
    const [benefit_id, loyalty_tier_id] = cell.split("|");
    const kind = str(f, `v_${cell}`);
    const label = str(f, `l_${cell}`);
    const { error } = await supabase.from("loyalty_benefit_value").upsert(
      { benefit_id, loyalty_tier_id, included: kind !== "no", label: kind === "custom" && label ? label : null },
      { onConflict: "benefit_id,loyalty_tier_id" }
    );
    if (error) {
      console.error(error);
      fail("/club/tiers", "Couldn't save the benefit table. Some cells may not have saved.");
    }
  }
  done("/club/tiers", "Benefit table saved.");
}

export async function addBenefit(f: FormData) {
  const name = str(f, "name");
  if (!name) fail("/club/tiers", "Give the new benefit a name.");
  const supabase = createClient();
  const { data: last } = await supabase.from("loyalty_benefit").select("sort_order").order("sort_order", { ascending: false }).limit(1).maybeSingle();
  const { error } = await supabase.from("loyalty_benefit").insert({ name, note: str(f, "note") || null, sort_order: ((last as { sort_order: number } | null)?.sort_order ?? 0) + 1 });
  if (error) {
    console.error(error);
    fail("/club/tiers", "Couldn't add the benefit.");
  }
  done("/club/tiers", `Added “${name}”. Choose which tiers include it below.`);
}

export async function removeBenefit(f: FormData) {
  const id = str(f, "id");
  const supabase = createClient();
  const { error } = await supabase.from("loyalty_benefit").update({ deleted_at: new Date().toISOString() }).eq("id", id);
  if (error) {
    console.error(error);
    fail("/club/tiers", "Couldn't remove the benefit.");
  }
  done("/club/tiers", "Benefit removed from the comparison table.");
}

/* ---------------- Rewards ---------------- */
function rewardFields(f: FormData) {
  return {
    name: str(f, "name"),
    description: str(f, "description") || null,
    category: ["savings", "service", "privilege", "keepsake"].includes(str(f, "category")) ? str(f, "category") : "service",
    points_cost: Math.max(1, int(f, "points_cost", 100)),
    value_minor: Math.max(0, rupees(f, "value")),
    min_tier_id: str(f, "min_tier_id") || null,
    service_ids: f.getAll("service_ids").map(String).filter(Boolean),
    min_order_minor: Math.max(0, rupees(f, "min_order")),
    validity_days: Math.max(1, int(f, "validity_days", 30)),
    usage_limit_per_member: Math.max(0, int(f, "usage_limit_per_member")),
    stock: str(f, "stock") === "" ? null : Math.max(0, int(f, "stock")),
    starts_on: str(f, "starts_on") || null,
    ends_on: str(f, "ends_on") || null,
    icon: str(f, "icon") || "gift",
    card_style: str(f, "card_style") || "a",
    sort_order: int(f, "sort_order"),
    is_active: bool(f, "is_active"),
    is_draft: bool(f, "is_draft"),
  };
}
export async function saveReward(f: FormData) {
  const id = str(f, "id");
  const row = rewardFields(f);
  if (!row.name) fail("/club/rewards", "A reward needs a name.");
  if (row.starts_on && row.ends_on && row.ends_on < row.starts_on) fail("/club/rewards", "The end date must be after the start date.");
  const supabase = createClient();
  const { error } = id
    ? await supabase.from("reward").update(row).eq("id", id)
    : await supabase.from("reward").insert({ ...row, branch_id: null });
  if (error) {
    console.error(error);
    fail("/club/rewards", `Couldn't save “${row.name}”.`);
  }
  done("/club/rewards", `Saved “${row.name}”.`);
}

export async function toggleReward(f: FormData) {
  const supabase = createClient();
  const { error } = await supabase.from("reward").update({ is_active: str(f, "next") === "true" }).eq("id", str(f, "id"));
  if (error) console.error(error);
  done("/club/rewards", str(f, "next") === "true" ? "Reward is now active." : "Reward paused. Members can't redeem it.");
}

/* ---------------- Campaigns ---------------- */
const OCCASIONS: Record<string, { name: string; type: "multiplier" | "bonus"; mult: number; bonus: number; message: string }> = {
  Onam: { name: "Onam Double Points", type: "multiplier", mult: 2, bonus: 0, message: "Double points on every order through Onam." },
  Vishu: { name: "Vishu Bonus Points", type: "bonus", mult: 1, bonus: 100, message: "100 bonus points on every order through Vishu." },
  Eid: { name: "Eid Festive Care", type: "multiplier", mult: 1.5, bonus: 0, message: "1.5× points on dry cleaning and pressing for Eid." },
  Christmas: { name: "Christmas Bonus Points", type: "bonus", mult: 1, bonus: 150, message: "150 bonus points on every order this Christmas." },
  "Wedding season": { name: "Wedding Season Privileges", type: "multiplier", mult: 1.5, bonus: 0, message: "1.5× points on wedding wear and saree care." },
  "School reopening": { name: "Back to School Rewards", type: "bonus", mult: 1, bonus: 75, message: "75 bonus points on uniform washing and ironing." },
  Monsoon: { name: "Monsoon Care Week", type: "multiplier", mult: 1.5, bonus: 0, message: "1.5× points on wash & fold, shoe and curtain cleaning." },
  Other: { name: "New campaign", type: "bonus", mult: 1, bonus: 50, message: "50 bonus points on every order." },
};
export async function createCampaign(f: FormData) {
  const occ = str(f, "occasion") || "Other";
  const t = OCCASIONS[occ] ?? OCCASIONS.Other;
  const start = new Date();
  start.setDate(start.getDate() + 14);
  const end = new Date(start);
  end.setDate(end.getDate() + 10);
  const supabase = createClient();
  const { error } = await supabase.from("loyalty_campaign").insert({
    name: t.name,
    occasion: occ,
    campaign_type: t.type,
    multiplier: t.mult,
    bonus_points: t.bonus,
    starts_on: start.toISOString().slice(0, 10),
    ends_on: end.toISOString().slice(0, 10),
    is_enabled: false,
    message: t.message,
  });
  if (error) {
    console.error(error);
    fail("/club/campaigns", "Couldn't create the campaign.");
  }
  done("/club/campaigns", `Created “${t.name}” as a draft. Set its dates and switch it on when ready.`);
}

export async function saveCampaign(f: FormData) {
  const id = str(f, "id");
  const type = str(f, "campaign_type") === "bonus" ? "bonus" : "multiplier";
  const starts_on = str(f, "starts_on");
  const ends_on = str(f, "ends_on");
  if (!starts_on || !ends_on || ends_on < starts_on) fail("/club/campaigns", "Check the dates: the end must be on or after the start.");
  const supabase = createClient();
  const { error } = await supabase
    .from("loyalty_campaign")
    .update({
      name: str(f, "name") || "Campaign",
      occasion: str(f, "occasion") || null,
      campaign_type: type,
      multiplier: type === "multiplier" ? Math.max(1, dec(f, "multiplier", 1)) : 1,
      bonus_points: type === "bonus" ? Math.max(0, int(f, "bonus_points")) : 0,
      min_order_minor: Math.max(0, rupees(f, "min_order")),
      service_ids: f.getAll("service_ids").map(String).filter(Boolean),
      min_tier_id: str(f, "min_tier_id") || null,
      starts_on,
      ends_on,
      is_enabled: bool(f, "is_enabled"),
      message: str(f, "message") || null,
      perk: str(f, "perk") || null,
    })
    .eq("id", id);
  if (error) {
    console.error(error);
    fail("/club/campaigns", "Couldn't save the campaign.");
  }
  done("/club/campaigns", "Campaign saved.");
}

export async function toggleCampaign(f: FormData) {
  const supabase = createClient();
  const { error } = await supabase.from("loyalty_campaign").update({ is_enabled: str(f, "next") === "true" }).eq("id", str(f, "id"));
  if (error) console.error(error);
  done("/club/campaigns", str(f, "next") === "true" ? "Campaign switched on." : "Campaign switched off.");
}

export async function removeCampaign(f: FormData) {
  const supabase = createClient();
  const { error } = await supabase.from("loyalty_campaign").update({ deleted_at: new Date().toISOString(), is_enabled: false }).eq("id", str(f, "id"));
  if (error) console.error(error);
  done("/club/campaigns", "Campaign removed.");
}

/* ---------------- Automations ---------------- */
export async function saveAutomation(f: FormData) {
  const channels = ["push", "whatsapp", "sms", "email"].filter((c) => bool(f, `ch_${c}`));
  const template = str(f, "message_template");
  if (!template) fail("/club/automations", "The message can't be empty.");
  const supabase = createClient();
  const { error } = await supabase
    .from("crm_automation")
    .update({ send_delay: str(f, "send_delay") || null, channels, message_template: template, is_enabled: bool(f, "is_enabled") })
    .eq("id", str(f, "id"));
  if (error) {
    console.error(error);
    fail("/club/automations", "Couldn't save the automation.");
  }
  done("/club/automations", "Automation saved.");
}
