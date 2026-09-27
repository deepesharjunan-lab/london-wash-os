import { requireMember } from "@/lib/customer/session";
import { bookPickupAction } from "../actions";
import { AppShell, Card, Notice, btn, input } from "../ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Book a pickup · The London Wash Club" };

const SLOTS: [string, string][] = [["9-11", "9–11 am"], ["11-13", "11 am–1 pm"], ["14-16", "2–4 pm"], ["16-18", "4–6 pm"], ["18-20", "6–8 pm"]];

export default async function MemberBookPage({ searchParams }: { searchParams: { error?: string } }) {
  const { customerId, db } = requireMember();
  const [addrRes, svcRes] = await Promise.all([
    db.from("customer_address").select("id, label, address_line, is_default").eq("customer_id", customerId).order("is_default", { ascending: false }),
    db.from("service").select("id, name").is("deleted_at", null).eq("is_active", true).order("name"),
  ]);
  const addresses = (addrRes.data ?? []) as { id: string; label: string | null; address_line: string; is_default: boolean }[];
  const services = (svcRes.data ?? []) as { id: string; name: string }[];

  // Next 7 days in India time.
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(Date.now() + (i + 1) * 864e5);
    const iso = d.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
    return {
      iso,
      wd: d.toLocaleDateString("en-IN", { weekday: "short", timeZone: "Asia/Kolkata" }),
      day: d.toLocaleDateString("en-IN", { day: "numeric", timeZone: "Asia/Kolkata" }),
      mon: d.toLocaleDateString("en-IN", { month: "short", timeZone: "Asia/Kolkata" }),
    };
  });

  const chip =
    "flex cursor-pointer flex-col items-center gap-0.5 rounded-[14px] border border-hair bg-white px-3 py-2.5 text-center has-[:checked]:border-navy has-[:checked]:bg-navy has-[:checked]:text-[#f8f5ef] has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brass";

  return (
    <AppShell current="/my" title="Book a pickup" back="/my">
      {searchParams.error && <Notice tone="danger">{searchParams.error}</Notice>}
      <form action={bookPickupAction} className="flex flex-col gap-6">
        <fieldset className="flex flex-col gap-2.5">
          <legend className="mb-2 text-[15px] font-semibold">What needs care?</legend>
          <div className="flex flex-wrap gap-2">
            {services.map((s) => (
              <label key={s.id} className="cursor-pointer rounded-full border border-hair-2 bg-white px-3.5 py-2 text-[13.5px] has-[:checked]:border-navy has-[:checked]:bg-navy has-[:checked]:text-[#f8f5ef]">
                <input type="checkbox" name="services" value={s.name} className="sr-only" /> {s.name}
              </label>
            ))}
          </div>
          <p className="text-[12.5px] text-ink-3">Not sure? Skip this. We&apos;ll check every item when we collect and confirm the price before we start.</p>
        </fieldset>

        <fieldset className="flex flex-col gap-2.5">
          <legend className="mb-2 text-[15px] font-semibold">Pickup address</legend>
          {addresses.map((a, i) => (
            <label key={a.id} className="flex cursor-pointer gap-3 rounded-[14px] border border-hair bg-white p-3.5 has-[:checked]:border-navy has-[:checked]:shadow-[inset_0_0_0_1px_#15213a]">
              <input type="radio" name="address_id" value={a.id} defaultChecked={i === 0} className="mt-1" />
              <span>
                <b className="block text-[14px]">{a.label ?? "Address"}</b>
                <span className="text-[13px] text-ink-2">{a.address_line}</span>
              </span>
            </label>
          ))}
          <label className="flex cursor-pointer gap-3 rounded-[14px] border border-hair bg-white p-3.5 has-[:checked]:border-navy">
            <input type="radio" name="address_id" value="new" defaultChecked={addresses.length === 0} className="mt-1" />
            <span className="flex flex-1 flex-col gap-2">
              <b className="text-[14px]">{addresses.length ? "A different address" : "Your address"}</b>
              <textarea name="new_address" className={input + " min-h-[72px] py-3"} placeholder="House / flat, street, area, city, PIN" maxLength={300} />
            </span>
          </label>
        </fieldset>

        <fieldset className="flex flex-col gap-2.5">
          <legend className="mb-2 text-[15px] font-semibold">Day</legend>
          <div className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1">
            {days.map((d, i) => (
              <label key={d.iso} className={chip + " w-[62px] shrink-0"}>
                <input type="radio" name="date" value={d.iso} defaultChecked={i === 0} className="sr-only" required />
                <span className="text-[11px] font-semibold uppercase tracking-wide opacity-75">{d.wd}</span>
                <span className="text-[19px] font-bold">{d.day}</span>
                <span className="text-[10px] uppercase opacity-75">{d.mon}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="flex flex-col gap-2.5">
          <legend className="mb-2 text-[15px] font-semibold">Time</legend>
          <div className="grid grid-cols-2 gap-2">
            {SLOTS.map(([v, l], i) => (
              <label key={v} className={chip + " items-start text-left"}>
                <input type="radio" name="slot" value={v} defaultChecked={i === 0} className="sr-only" required />
                <span className="text-[14px] font-semibold">{l}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <label className="flex flex-col gap-1.5">
          <span className="text-[15px] font-semibold">Instructions for our team (optional)</span>
          <textarea name="notes" className={input + " min-h-[80px] py-3"} maxLength={500} placeholder="Gate code, delicate items, stains to look at" />
        </label>

        <Card className="p-4 text-[13px] text-ink-2">
          Points for this order are added once we confirm your items, and become available when your order is delivered.
        </Card>

        <button type="submit" className={btn + " w-full"}>Book pickup</button>
      </form>
    </AppShell>
  );
}
