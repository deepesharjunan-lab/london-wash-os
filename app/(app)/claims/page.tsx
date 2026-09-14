import { createClient } from "@/lib/supabase/server";
import { createClaim, updateClaimStatus, createCollectionPoint, deleteCollectionPoint } from "./actions";

const statusOptions = ["open", "approved", "rejected", "paid"];

export default async function ClaimsPage() {
  const supabase = createClient();

  const [{ data: claims }, { data: complaints }, { data: garments }, { data: collectionPoints }] =
    await Promise.all([
      supabase.from("claim").select("*").order("created_at", { ascending: false }),
      supabase.from("complaint").select("id, subject"),
      supabase.from("garment").select("id, tag_code"),
      supabase.from("collection_point").select("*").order("created_at", { ascending: false }),
    ]);

  const complaintSubject = new Map((complaints || []).map((c: any) => [c.id, c.subject]));
  const garmentLabel = new Map((garments || []).map((g: any) => [g.id, g.tag_code || g.id.slice(0, 8)]));

  return (
    <div className="space-y-8">
      <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-accent">Operations</div>
      <h1 className="mb-6 font-archivo text-2xl font-extrabold text-ink">Claims &amp; Collection Points</h1>
      <p className="mb-6 -mt-4 text-sm text-ink/60">
        Damage/loss compensation claims and branch collection point directory.
      </p>

      <section className="border-2 border-black/10 bg-white p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-archivo text-lg font-bold text-ink">Claims</h2>
          <details className="relative">
            <summary className="cursor-pointer list-none rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white">
              + New Claim
            </summary>
            <form
              action={createClaim}
              className="absolute right-0 z-10 mt-2 w-80 space-y-3 border-2 border-black/10 bg-white p-4"
            >
              <div>
                <label className="block text-xs font-medium text-slate-500">Complaint</label>
                <select name="complaint_id" required className="mt-1 w-full border border-black/10 px-2 py-1.5 text-sm">
                  <option value="">Select complaint</option>
                  {(complaints || []).map((c: any) => (
                    <option key={c.id} value={c.id}>
                      {c.subject}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500">Garment (optional)</label>
                <select name="garment_id" className="mt-1 w-full border border-black/10 px-2 py-1.5 text-sm">
                  <option value="">Not linked</option>
                  {(garments || []).map((g: any) => (
                    <option key={g.id} value={g.id}>
                      {g.tag_code || g.id.slice(0, 8)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500">Claimed amount (\u20B9)</label>
                <input
                  type="number"
                  name="claimed_amount"
                  step="0.01"
                  placeholder="e.g. 500"
                  className="mt-1 w-full border border-black/10 px-2 py-1.5 text-sm"
                />
              </div>
              <button type="submit" className="w-full rounded-md bg-slate-900 py-1.5 text-sm font-medium text-white">
                Save Claim
              </button>
            </form>
          </details>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b-2 border-black/10 text-left text-[11px] uppercase tracking-wide text-ink/50">
              <th className="py-2">Complaint</th>
              <th className="py-2">Garment</th>
              <th className="py-2">Amount</th>
              <th className="py-2">Status</th>
              <th className="py-2">Update</th>
            </tr>
          </thead>
          <tbody>
            {(claims || []).map((c: any) => (
              <tr key={c.id} className="border-b border-black/5">
                <td className="py-2 font-medium">{c.complaint_id ? complaintSubject.get(c.complaint_id) : "-"}</td>
                <td className="py-2 text-slate-600">{c.garment_id ? garmentLabel.get(c.garment_id) : "-"}</td>
                <td className="py-2 text-slate-600">
                  {c.claimed_amount_minor ? "\u20B9" + (c.claimed_amount_minor / 100).toFixed(2) : "-"}
                </td>
                <td className="py-2 text-slate-600">
                  <span
                    className={
                      "px-2 py-0.5 text-xs font-semibold uppercase tracking-wide " +
                      (c.status === "paid"
                        ? "bg-emerald-100 text-emerald-700"
                        : c.status === "approved"
                        ? "bg-blue-100 text-blue-700"
                        : c.status === "rejected"
                        ? "bg-red-100 text-red-700"
                        : "bg-amber-100 text-amber-700")
                    }
                  >
                    {c.status}
                  </span>
                </td>
                <td className="py-2">
                  <form action={updateClaimStatus} className="flex items-center gap-1">
                    <input type="hidden" name="id" value={c.id} />
                    <select name="status" defaultValue={c.status} className="border border-black/10 px-1 py-1 text-xs">
                      {statusOptions.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                    <button type="submit" className="text-xs font-medium text-blue-600">
                      Save
                    </button>
                  </form>
                </td>
              </tr>
            ))}
            {(!claims || claims.length === 0) && (
              <tr>
                <td colSpan={5} className="py-4 text-center text-slate-400">
                  No claims yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <section className="border-2 border-black/10 bg-white p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-archivo text-lg font-bold text-ink">Collection Points</h2>
          <details className="relative">
            <summary className="cursor-pointer list-none rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white">
              + New Collection Point
            </summary>
            <form
              action={createCollectionPoint}
              className="absolute right-0 z-10 mt-2 w-80 space-y-3 border-2 border-black/10 bg-white p-4"
            >
              <div>
                <label className="block text-xs font-medium text-slate-500">Name</label>
                <input
                  name="name"
                  required
                  placeholder="e.g. Mall Kiosk Drop-off"
                  className="mt-1 w-full border border-black/10 px-2 py-1.5 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500">Address</label>
                <input
                  name="address"
                  className="mt-1 w-full border border-black/10 px-2 py-1.5 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500">Contact phone</label>
                <input
                  name="contact_phone"
                  className="mt-1 w-full border border-black/10 px-2 py-1.5 text-sm"
                />
              </div>
              <button type="submit" className="w-full rounded-md bg-slate-900 py-1.5 text-sm font-medium text-white">
                Create Collection Point
              </button>
            </form>
          </details>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b-2 border-black/10 text-left text-[11px] uppercase tracking-wide text-ink/50">
              <th className="py-2">Name</th>
              <th className="py-2">Address</th>
              <th className="py-2">Phone</th>
              <th className="py-2"></th>
            </tr>
          </thead>
          <tbody>
            {(collectionPoints || []).map((p: any) => (
              <tr key={p.id} className="border-b border-black/5">
                <td className="py-2 font-medium">{p.name}</td>
                <td className="py-2 text-slate-600">{p.address || "-"}</td>
                <td className="py-2 text-slate-600">{p.contact_phone || "-"}</td>
                <td className="py-2">
                  <form action={deleteCollectionPoint}>
                    <input type="hidden" name="id" value={p.id} />
                    <button type="submit" className="text-xs font-medium text-red-600">
                      Remove
                    </button>
                  </form>
                </td>
              </tr>
            ))}
            {(!collectionPoints || collectionPoints.length === 0) && (
              <tr>
                <td colSpan={4} className="py-4 text-center text-slate-400">
                  No collection points yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
