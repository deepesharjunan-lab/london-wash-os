import { createClient } from "@/lib/supabase/server";
import { updateBranch, updateOrganization, addTaxRule, endTaxRule } from "./actions";

export default async function SettingsPage() {
  const supabase = createClient();

  const { data: auth } = await supabase.auth.getUser();
  const { data: me } = auth?.user
    ? await supabase.from("user").select("branch_id").eq("auth_user_id", auth.user.id).single()
    : { data: null };

  const { data: branch } = me
    ? await supabase.from("branch").select("*").eq("id", me.branch_id).single()
    : { data: null };

  const { data: organization } = branch
    ? await supabase.from("organization").select("*").eq("id", branch.organization_id).single()
    : { data: null };

  const { data: categories } = await supabase
    .from("service_category")
    .select("id, name")
    .is("deleted_at", null)
    .order("sort_order");

  const { data: taxRules } = await supabase
    .from("tax_rule")
    .select(
      "id, service_category_id, sac_code, cgst_percent, sgst_percent, igst_percent, effective_from, effective_to"
    )
    .order("effective_from", { ascending: false });

  const categoryName = new Map((categories ?? []).map((c: any) => [c.id, c.name]));

  return (
    <div className="space-y-6">
      <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-accent">Settings</div>
      <h1 className="mb-6 font-archivo text-2xl font-extrabold text-ink">Branch, Organization &amp; Tax</h1>

      <div className="border-2 border-black/10 bg-white">
        <div className="border-b-2 border-black/10 px-5 py-3 font-archivo text-[13.5px] font-bold text-ink">
          Branch Details
        </div>
        {branch ? (
          <form
            action={updateBranch}
            className="grid grid-cols-1 gap-3 px-5 py-4 sm:grid-cols-2 lg:grid-cols-3"
          >
            <input type="hidden" name="branch_id" value={branch.id} />
            <label className="flex flex-col gap-1 text-[12px] text-ink/60">
              Branch name
              <input
                name="name"
                defaultValue={branch.name}
                required
                className="border border-black/10 px-3 py-2 text-[13px] text-ink"
              />
            </label>
            <label className="flex flex-col gap-1 text-[12px] text-ink/60">
              Branch code
              <input
                name="code"
                defaultValue={branch.code}
                required
                className="border border-black/10 px-3 py-2 text-[13px] text-ink"
              />
            </label>
            <label className="flex flex-col gap-1 text-[12px] text-ink/60">
              Phone
              <input
                name="phone"
                defaultValue={branch.phone ?? ""}
                className="border border-black/10 px-3 py-2 text-[13px] text-ink"
              />
            </label>
            <label className="flex flex-col gap-1 text-[12px] text-ink/60 lg:col-span-2">
              Address
              <input
                name="address"
                defaultValue={branch.address ?? ""}
                className="border border-black/10 px-3 py-2 text-[13px] text-ink"
              />
            </label>
            <label className="flex flex-col gap-1 text-[12px] text-ink/60">
              City
              <input
                name="city"
                defaultValue={branch.city ?? ""}
                className="border border-black/10 px-3 py-2 text-[13px] text-ink"
              />
            </label>
            <label className="flex flex-col gap-1 text-[12px] text-ink/60">
              State
              <input
                name="state"
                defaultValue={branch.state ?? ""}
                className="border border-black/10 px-3 py-2 text-[13px] text-ink"
              />
            </label>
            <div className="flex items-end lg:col-span-3">
              <button
                type="submit"
                className="rounded-md bg-accent px-4 py-2 text-[13px] font-semibold text-white hover:brightness-110"
              >
                Save branch
              </button>
            </div>
          </form>
        ) : (
          <div className="px-5 py-8 text-center text-ink/40">No branch found.</div>
        )}
      </div>

      <div className="border-2 border-black/10 bg-white">
        <div className="border-b-2 border-black/10 px-5 py-3 font-archivo text-[13.5px] font-bold text-ink">
          Organization Details
        </div>
        {organization ? (
          <form
            action={updateOrganization}
            className="grid grid-cols-1 gap-3 px-5 py-4 sm:grid-cols-2 lg:grid-cols-3"
          >
            <input type="hidden" name="organization_id" value={organization.id} />
            <label className="flex flex-col gap-1 text-[12px] text-ink/60">
              Display name
              <input
                name="name"
                defaultValue={organization.name}
                required
                className="border border-black/10 px-3 py-2 text-[13px] text-ink"
              />
            </label>
            <label className="flex flex-col gap-1 text-[12px] text-ink/60">
              Legal name
              <input
                name="legal_name"
                defaultValue={organization.legal_name ?? ""}
                className="border border-black/10 px-3 py-2 text-[13px] text-ink"
              />
            </label>
            <label className="flex flex-col gap-1 text-[12px] text-ink/60">
              GSTIN
              <input
                name="gstin"
                defaultValue={organization.gstin ?? ""}
                placeholder="e.g. 32AAAAA0000A1Z5"
                className="border border-black/10 px-3 py-2 text-[13px] text-ink"
              />
            </label>
            <div className="flex items-end">
              <button
                type="submit"
                className="rounded-md bg-accent px-4 py-2 text-[13px] font-semibold text-white hover:brightness-110"
              >
                Save organization
              </button>
            </div>
          </form>
        ) : (
          <div className="px-5 py-8 text-center text-ink/40">No organization found.</div>
        )}
      </div>

      <div className="border-2 border-black/10 bg-white">
        <div className="border-b-2 border-black/10 px-5 py-3 font-archivo text-[13.5px] font-bold text-ink">
          GST / Tax Rules
        </div>
        <details className="border-b-2 border-black/10">
          <summary className="cursor-pointer select-none px-5 py-3 text-[13px] font-semibold text-accent">
            + Add Tax Rule
          </summary>
          <form
            action={addTaxRule}
            className="grid grid-cols-1 gap-3 px-5 py-4 sm:grid-cols-2 lg:grid-cols-6"
          >
            <select
              name="service_category_id"
              required
              className="border border-black/10 px-3 py-2 text-[13px] text-ink"
              defaultValue=""
            >
              <option value="">Service category</option>
              {(categories ?? []).map((c: any) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <input
              name="sac_code"
              placeholder="SAC code"
              className="border border-black/10 px-3 py-2 text-[13px]"
            />
            <input
              name="cgst_percent"
              type="number"
              step="0.01"
              placeholder="CGST %"
              className="border border-black/10 px-3 py-2 text-[13px]"
            />
            <input
              name="sgst_percent"
              type="number"
              step="0.01"
              placeholder="SGST %"
              className="border border-black/10 px-3 py-2 text-[13px]"
            />
            <input
              name="igst_percent"
              type="number"
              step="0.01"
              placeholder="IGST %"
              className="border border-black/10 px-3 py-2 text-[13px]"
            />
            <input
              name="effective_from"
              type="date"
              className="border border-black/10 px-3 py-2 text-[13px]"
            />
            <button
              type="submit"
              className="rounded-md bg-accent px-4 py-2 text-[13px] font-semibold text-white hover:brightness-110 sm:col-span-2 lg:col-span-1"
            >
              Add
            </button>
          </form>
        </details>
        <table className="w-full text-left text-[13px]">
          <thead className="text-[11px] uppercase tracking-wide text-ink/50">
            <tr className="border-b-2 border-black/10">
              <th className="px-5 py-3 font-medium">Category</th>
              <th className="px-5 py-3 font-medium">SAC</th>
              <th className="px-5 py-3 font-medium">CGST%</th>
              <th className="px-5 py-3 font-medium">SGST%</th>
              <th className="px-5 py-3 font-medium">IGST%</th>
              <th className="px-5 py-3 font-medium">From</th>
              <th className="px-5 py-3 font-medium">To</th>
              <th className="px-5 py-3 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {(!taxRules || taxRules.length === 0) && (
              <tr>
                <td colSpan={8} className="px-5 py-8 text-center text-ink/40">
                  No tax rules yet. Add one above.
                </td>
              </tr>
            )}
            {(taxRules ?? []).map((t: any) => (
              <tr key={t.id} className="border-t border-black/5">
                <td className="px-5 py-3 font-medium text-ink">
                  {categoryName.get(t.service_category_id) || "—"}
                </td>
                <td className="px-5 py-3 text-ink/70">{t.sac_code || "—"}</td>
                <td className="px-5 py-3 text-ink/70">{t.cgst_percent ?? "—"}</td>
                <td className="px-5 py-3 text-ink/70">{t.sgst_percent ?? "—"}</td>
                <td className="px-5 py-3 text-ink/70">{t.igst_percent ?? "—"}</td>
                <td className="px-5 py-3 text-ink/70">{t.effective_from || "—"}</td>
                <td className="px-5 py-3 text-ink/70">{t.effective_to || "—"}</td>
                <td className="px-5 py-3 text-right">
                  {!t.effective_to && (
                    <form action={endTaxRule}>
                      <input type="hidden" name="id" value={t.id} />
                      <button
                        type="submit"
                        className="rounded-md border border-black/10 px-3 py-1.5 text-[12px] font-semibold text-ink hover:bg-black/[0.03]"
                      >
                        End
                      </button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
