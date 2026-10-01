import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PosScreen, type PosEntry, type PosService } from "./PosScreen";

export const dynamic = "force-dynamic";

/** Every active price, 1000 rows at a time (the API returns at most 1000 per request). */
async function allEntries(supabase: ReturnType<typeof createClient>) {
  const rows: any[] = [];
  for (let from = 0; from < 50000; from += 1000) {
    const { data, error } = await supabase
      .from("price_list_entry")
      .select("id, price_list_profile_id, service_id, item_id, unit, price_minor, item:item_id(name, sub_category_id, priority, pieces, is_active)")
      .eq("is_active", true)
      .order("id")
      .range(from, from + 999);
    if (error || !data?.length) break;
    rows.push(...data);
    if (data.length < 1000) break;
  }
  return { data: rows };
}

export default async function PosNewOrderPage({ searchParams }: { searchParams: { customer?: string } }) {
  const supabase = createClient();
  const [{ data: profiles }, { data: entries }, { data: services }, { data: subs }, { data: preset }] = await Promise.all([
    supabase.from("price_list_profile").select("id, name, is_default").eq("is_active", true).order("is_default", { ascending: false }).order("name"),
    allEntries(supabase),
    supabase.from("service").select("id, name, uses_sub_categories, is_active").is("deleted_at", null).order("name"),
    supabase.from("item_sub_category").select("id, name").eq("is_active", true).order("sort_order").order("name"),
    searchParams.customer
      ? supabase.from("customer").select("id, full_name, phone").eq("id", searchParams.customer).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const activeServices = ((services ?? []) as (PosService & { is_active: boolean })[]).filter((s) => s.is_active);
  const serviceIds = new Set(activeServices.map((s) => s.id));
  const posEntries: PosEntry[] = ((entries ?? []) as any[])
    .map((e) => {
      const item = Array.isArray(e.item) ? e.item[0] : e.item;
      return {
        id: e.id,
        list: e.price_list_profile_id,
        service_id: e.service_id,
        item_id: e.item_id,
        name: item?.name ?? null,
        sub: item?.sub_category_id ?? null,
        priority: Number(item?.priority ?? 1),
        pieces: Math.max(1, Number(item?.pieces ?? 1)),
        unit: e.unit,
        price_minor: Number(e.price_minor),
        hidden: item ? item.is_active === false : false,
      };
    })
    .filter((e) => !e.hidden && serviceIds.has(e.service_id));

  if (!(profiles ?? []).length || !posEntries.length) {
    return (
      <div className="grid h-full place-items-center p-6">
        <div className="max-w-md rounded-2xl bg-white p-8 text-center shadow-sm">
          <h1 className="text-[18px] font-semibold">Nothing to sell yet</h1>
          <p className="mt-2 text-[14px] text-ink-2">Set up a price list with prices first.</p>
          <Link href="/services/prices" className="mt-4 inline-block rounded-full bg-navy px-5 py-2.5 text-[14px] font-semibold text-white">
            Go to Add to Price List
          </Link>
        </div>
      </div>
    );
  }

  return (
    <PosScreen
      priceLists={(profiles ?? []) as { id: string; name: string; is_default: boolean }[]}
      entries={posEntries}
      services={activeServices.map(({ id, name, uses_sub_categories }) => ({ id, name, uses_sub_categories }))}
      subCategories={(subs ?? []) as { id: string; name: string }[]}
      initialCustomer={(preset as { id: string; full_name: string; phone: string | null } | null) ?? null}
    />
  );
}
