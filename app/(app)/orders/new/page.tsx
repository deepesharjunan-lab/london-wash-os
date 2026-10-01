import { createClient } from "@/lib/supabase/server";
import OrderForm from "./OrderForm";

export default async function NewOrderPage({
  searchParams,
}: {
  searchParams: { customer?: string };
}) {
  const supabase = createClient();

  const [{ data: customers }, { data: profiles }, { data: entries }, { data: subs }] = await Promise.all([
    supabase.from("customer").select("id, full_name, phone").order("full_name").limit(500),
    supabase
      .from("price_list_profile")
      .select("id, name, is_default")
      .order("is_default", { ascending: false })
      .order("name"),
    supabase
      .from("price_list_entry")
      .select(
        "id, price_list_profile_id, service_id, item_id, unit, price_minor, service:service_id(name, uses_sub_categories), item:item_id(name, sub_category_id, priority)"
      )
      .eq("is_active", true),
    supabase.from("item_sub_category").select("id, name").eq("is_active", true).order("sort_order").order("name"),
  ]);

  const priceEntries = (entries ?? []).map((e: any) => ({
    id: e.id,
    price_list_profile_id: e.price_list_profile_id,
    service_id: e.service_id,
    service_name: e.service?.name ?? "Service",
    item_id: e.item_id,
    item_name: e.item?.name ?? null,
    item_sub_category_id: e.item?.sub_category_id ?? null,
    item_priority: Number(e.item?.priority ?? 1),
    service_uses_sub: !!e.service?.uses_sub_categories,
    unit: e.unit,
    price_minor: Number(e.price_minor),
  }));

  return (
    <div>
      <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-accent">Orders</div>
      <h1 className="mb-6 font-archivo text-2xl font-extrabold text-ink">New order</h1>

      {(profiles ?? []).length === 0 || priceEntries.length === 0 ? (
        <div className="border-2 border-black/10 bg-white p-6 text-sm text-ink/60">
          You need at least one price list with prices set before you can create an order.{" "}
          <a href="/services" className="font-semibold text-accent hover:underline">
            Set up services &amp; prices
          </a>
          .
        </div>
      ) : (
        <OrderForm
          customers={customers ?? []}
          priceListProfiles={profiles ?? []}
          priceEntries={priceEntries}
          subCategories={(subs ?? []) as { id: string; name: string }[]}
          defaultCustomerId={searchParams.customer}
        />
      )}
    </div>
  );
}
