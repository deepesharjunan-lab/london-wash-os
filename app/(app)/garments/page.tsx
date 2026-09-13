import { createClient } from "@/lib/supabase/server";
import { createGarment, createGarmentCondition, createGarmentEvent } from "./actions";

const conditionTags = ["good", "stained", "damaged", "missing_button", "torn", "faded"];

export default async function GarmentsPage() {
  const supabase = createClient();

  const [{ data: garments }, { data: orderItems }, { data: conditions }, { data: events }, { data: users }] =
    await Promise.all([
      supabase.from("garment").select("*").order("created_at", { ascending: false }),
      supabase.from("order_item").select("id, order_id, notes"),
      supabase.from("garment_condition").select("*").order("created_at", { ascending: false }).limit(30),
      supabase.from("garment_event").select("*").order("created_at", { ascending: false }).limit(30),
      supabase.from("user").select("id, full_name"),
    ]);

  const orderItemLabel = new Map((orderItems || []).map((oi: any) => [oi.id, oi.notes || oi.id.slice(0, 8)]));
  const garmentLabel = new Map((garments || []).map((g: any) => [g.id, g.tag_code || g.id.slice(0, 8)]));
  const userName = new Map((users || []).map((u: any) => [u.id, u.full_name]));

  return (
    <div className="space-y-8">
      <div>
        <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-accent">Production</div>
        <h1 className="mb-6 font-archivo text-2xl font-extrabold text-ink">Garment Tracking</h1>
        <p className="mb-6 -mt-4 text-sm text-ink/60">Individual garments, condition notes, and processing events.</p>
      </div>

      <section className="border-2 border-black/10 bg-white p-5">
        <div className="mb-4 flex items-center justify-between border-b-2 border-black/10 pb-3">
          <h2 className="font-archivo text-[13.5px] font-bold text-ink">Garments</h2>
          <details className="relative">
            <summary className="cursor-pointer list-none rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white">
              + Add Garment
            </summary>
            <form
              action={createGarment}
              className="absolute right-0 z-10 mt-2 w-80 space-y-3 border-2 border-black/10 bg-white p-4"
            >
              <div>
                <label className="block text-xs font-medium text-ink/50">Order item</label>
                <select name="order_item_id" required className="mt-1 w-full border border-black/10 px-2 py-1.5 text-sm">
                  <option value="">Select order item</option>
                  {(orderItems || []).map((oi: any) => (
                    <option key={oi.id} value={oi.id}>
                      {oi.notes || oi.id.slice(0, 8)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-ink/50">Tag code (optional)</label>
                <input name="tag_code" placeholder="e.g. G-0001" className="mt-1 w-full border border-black/10 px-2 py-1.5 text-sm" />
              </div>
              <button type="submit" className="w-full rounded-md bg-slate-900 py-1.5 text-sm font-medium text-white">
                Save Garment
              </button>
            </form>
          </details>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b-2 border-black/10 text-left text-[11px] uppercase tracking-wide text-ink/50">
              <th className="py-2">Tag Code</th>
              <th className="py-2">Order Item</th>
              <th className="py-2">Created</th>
            </tr>
          </thead>
          <tbody>
            {(garments || []).map((g: any) => (
              <tr key={g.id} className="border-b border-black/5">
                <td className="py-2 font-medium">{g.tag_code || g.id.slice(0, 8)}</td>
                <td className="py-2 text-ink/70">{orderItemLabel.get(g.order_item_id) || "-"}</td>
                <td className="py-2 text-ink/50">{new Date(g.created_at).toLocaleDateString()}</td>
              </tr>
            ))}
            {(!garments || garments.length === 0) && (
              <tr>
                <td colSpan={3} className="py-4 text-center text-ink/30">
                  No garments registered yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <section className="border-2 border-black/10 bg-white p-5">
        <div className="mb-4 flex items-center justify-between border-b-2 border-black/10 pb-3">
          <h2 className="font-archivo text-[13.5px] font-bold text-ink">Condition Log</h2>
          <details className="relative">
            <summary className="cursor-pointer list-none rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white">
              + Log Condition
            </summary>
            <form
              action={createGarmentCondition}
              className="absolute right-0 z-10 mt-2 w-80 space-y-3 border-2 border-black/10 bg-white p-4"
            >
              <div>
                <label className="block text-xs font-medium text-ink/50">Garment</label>
                <select name="garment_id" required className="mt-1 w-full border border-black/10 px-2 py-1.5 text-sm">
                  <option value="">Select garment</option>
                  {(garments || []).map((g: any) => (
                    <option key={g.id} value={g.id}>
                      {g.tag_code || g.id.slice(0, 8)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-ink/50">Condition</label>
                <select name="tag" required className="mt-1 w-full border border-black/10 px-2 py-1.5 text-sm">
                  {conditionTags.map((t) => (
                    <option key={t} value={t}>
                      {t.replace("_", " ")}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-ink/50">Note</label>
                <textarea name="note" rows={2} className="mt-1 w-full border border-black/10 px-2 py-1.5 text-sm" />
              </div>
              <button type="submit" className="w-full rounded-md bg-slate-900 py-1.5 text-sm font-medium text-white">
                Save Condition
              </button>
            </form>
          </details>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b-2 border-black/10 text-left text-[11px] uppercase tracking-wide text-ink/50">
              <th className="py-2">Garment</th>
              <th className="py-2">Condition</th>
              <th className="py-2">Note</th>
              <th className="py-2">Recorded By</th>
              <th className="py-2">Date</th>
            </tr>
          </thead>
          <tbody>
            {(conditions || []).map((c: any) => (
              <tr key={c.id} className="border-b border-black/5">
                <td className="py-2 font-medium">{garmentLabel.get(c.garment_id) || "-"}</td>
                <td className="py-2 text-ink/70">
                  <span
                    className={
                      "px-2 py-1 text-[11px] font-semibold uppercase tracking-wide " +
                      (c.tag === "good" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700")
                    }
                  >
                    {String(c.tag).replace("_", " ")}
                  </span>
                </td>
                <td className="py-2 text-ink/70">{c.note || "-"}</td>
                <td className="py-2 text-ink/70">{c.recorded_by ? userName.get(c.recorded_by) : "-"}</td>
                <td className="py-2 text-ink/50">{new Date(c.created_at).toLocaleDateString()}</td>
              </tr>
            ))}
            {(!conditions || conditions.length === 0) && (
              <tr>
                <td colSpan={5} className="py-4 text-center text-ink/30">
                  No condition notes yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <section className="border-2 border-black/10 bg-white p-5">
        <div className="mb-4 flex items-center justify-between border-b-2 border-black/10 pb-3">
          <h2 className="font-archivo text-[13.5px] font-bold text-ink">Processing Events</h2>
          <details className="relative">
            <summary className="cursor-pointer list-none rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white">
              + Log Event
            </summary>
            <form
              action={createGarmentEvent}
              className="absolute right-0 z-10 mt-2 w-80 space-y-3 border-2 border-black/10 bg-white p-4"
            >
              <div>
                <label className="block text-xs font-medium text-ink/50">Garment</label>
                <select name="garment_id" required className="mt-1 w-full border border-black/10 px-2 py-1.5 text-sm">
                  <option value="">Select garment</option>
                  {(garments || []).map((g: any) => (
                    <option key={g.id} value={g.id}>
                      {g.tag_code || g.id.slice(0, 8)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-ink/50">Event type</label>
                <input
                  name="event_type"
                  required
                  placeholder="e.g. received, washed, dried, pressed, packed, delivered"
                  className="mt-1 w-full border border-black/10 px-2 py-1.5 text-sm"
                />
              </div>
              <button type="submit" className="w-full rounded-md bg-slate-900 py-1.5 text-sm font-medium text-white">
                Save Event
              </button>
            </form>
          </details>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b-2 border-black/10 text-left text-[11px] uppercase tracking-wide text-ink/50">
              <th className="py-2">Garment</th>
              <th className="py-2">Event</th>
              <th className="py-2">Date</th>
            </tr>
          </thead>
          <tbody>
            {(events || []).map((e: any) => (
              <tr key={e.id} className="border-b border-black/5">
                <td className="py-2 font-medium">{garmentLabel.get(e.garment_id) || "-"}</td>
                <td className="py-2 text-ink/70">{e.event_type}</td>
                <td className="py-2 text-ink/50">{new Date(e.created_at).toLocaleDateString()}</td>
              </tr>
            ))}
            {(!events || events.length === 0) && (
              <tr>
                <td colSpan={3} className="py-4 text-center text-ink/30">
                  No events logged yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
