import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { runSegment } from "@/lib/engage/segments-server";
import type { Filter } from "@/lib/engage/segments";

// Downloads an audience as a CSV (signed-in console users only).

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const cell = (v: unknown) => {
  const s = v == null ? "" : String(v);
  // Quote everything; neutralise spreadsheet formulas.
  return `"${(/^[=+\-@]/.test(s) ? `'${s}` : s).replace(/"/g, '""')}"`;
};

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const { data: auth } = await createClient().auth.getUser();
  if (!auth?.user) return new Response("Sign in first", { status: 401 });
  const { data } = await createAdminClient().from("engage_segment").select("name, match, filters").eq("id", params.id).maybeSingle();
  if (!data) return new Response("Not found", { status: 404 });
  const seg = data as { name: string; match: "all" | "any"; filters: Filter[] };
  const r = await runSegment(seg.filters, seg.match);
  const reachable = new Set(r.reachable.map((p) => p.id));
  const head = ["Name", "Phone", "City", "PIN", "Orders", "Total spent (₹)", "Last order", "Club tier", "Points", "Birthday", "Can be messaged", "Opted out"];
  const lines = [head.map(cell).join(",")];
  for (const p of r.matched) {
    lines.push(
      [
        p.full_name,
        p.phone,
        p.city,
        p.pincode,
        p.order_count,
        Math.round(Number(p.total_spent_minor) / 100),
        p.last_order_at ? p.last_order_at.slice(0, 10) : "",
        p.tier_name,
        Math.floor(Number(p.points) || 0),
        p.birth_date ? p.birth_date.slice(5) : "",
        reachable.has(p.id) ? "yes" : "no",
        p.marketing_opt_out ? "yes" : "no",
      ]
        .map(cell)
        .join(",")
    );
  }
  const file = seg.name.replace(/[^\w -]/g, "").trim().replace(/\s+/g, "-") || "audience";
  return new Response("﻿" + lines.join("\r\n"), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${file}.csv"`, "Cache-Control": "no-store" },
  });
}
