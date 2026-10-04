"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { consoleUserId } from "@/lib/auth/console-user";
import { runSegment } from "@/lib/engage/segments-server";
import type { Filter } from "@/lib/engage/segments";

// ENGAGE → Audiences: live preview while building, save, delete.

export type PreviewResult = {
  error?: string;
  total?: number;
  matched?: number;
  reachable?: number;
  optedOut?: number;
  noPhone?: number;
  sample?: { id: string; name: string; phone: string; orders: number; spent: number; lastOrder: string | null; tier: string | null }[];
};

const clean = (filters: unknown): Filter[] => (Array.isArray(filters) ? (filters as Filter[]).slice(0, 20) : []);

export async function previewSegmentAction(filters: Filter[], match: "all" | "any"): Promise<PreviewResult> {
  if (!(await consoleUserId())) return { error: "Your session has ended. Sign in again." };
  try {
    const r = await runSegment(clean(filters), match === "any" ? "any" : "all");
    const sample = [...r.matched]
      .sort((a, b) => Number(b.total_spent_minor) - Number(a.total_spent_minor))
      .slice(0, 12)
      .map((p) => ({
        id: p.id,
        name: p.full_name,
        phone: p.phone,
        orders: p.order_count,
        spent: Math.round(Number(p.total_spent_minor) / 100),
        lastOrder: p.last_order_at,
        tier: p.tier_name,
      }));
    return { total: r.total, matched: r.matched.length, reachable: r.reachable.length, optedOut: r.optedOut, noPhone: r.noPhone, sample };
  } catch (e: any) {
    return { error: `Couldn't count customers: ${e?.message ?? "unknown error"}` };
  }
}

export type SaveState = { error?: string };

export async function saveSegmentAction(_prev: SaveState, form: FormData): Promise<SaveState> {
  const userId = await consoleUserId();
  if (!userId) return { error: "Your session has ended. Sign in again." };
  const id = String(form.get("id") ?? "");
  const name = String(form.get("name") ?? "").trim().slice(0, 80);
  const description = String(form.get("description") ?? "").trim().slice(0, 300) || null;
  const match = form.get("match") === "any" ? "any" : "all";
  let filters: Filter[] = [];
  try {
    filters = clean(JSON.parse(String(form.get("filters") ?? "[]")));
  } catch {
    return { error: "Couldn't read the filters. Please try again." };
  }
  if (!name) return { error: "Give the audience a name." };

  const r = await runSegment(filters, match);
  const row = { name, description, match, filters, last_count: r.reachable.length, last_counted_at: new Date().toISOString(), updated_at: new Date().toISOString() };
  const db = createAdminClient();
  const { error } = id
    ? await db.from("engage_segment").update(row).eq("id", id)
    : await db.from("engage_segment").insert({ ...row, created_by_user_id: userId });
  if (error) return { error: `Couldn't save: ${error.message}` };
  revalidatePath("/engage/audiences");
  redirect("/engage/audiences?saved=" + encodeURIComponent(name));
}

export async function deleteSegmentAction(form: FormData) {
  if (!(await consoleUserId())) return;
  const id = String(form.get("id") ?? "");
  if (id) await createAdminClient().from("engage_segment").delete().eq("id", id);
  revalidatePath("/engage/audiences");
  redirect("/engage/audiences");
}
