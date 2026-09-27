import { redirect } from "next/navigation";
import { requireMember } from "@/lib/customer/session";
import { loadMember } from "@/lib/customer/member";
import { saveBirthdayAction, signOutAction } from "../actions";
import { AppShell, Card, Notice, btn, btnGhost, input } from "../ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Profile · The London Wash Club" };

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export default async function MemberProfilePage({ searchParams }: { searchParams: { saved?: string; error?: string } }) {
  const { customerId, db } = requireMember();
  const m = await loadMember(db, customerId);
  if (!m) redirect("/my/login");
  const [addrRes, familyRes] = await Promise.all([
    db.from("customer_address").select("id, label, address_line").eq("customer_id", customerId),
    m.customer.family_account_id
      ? db.from("customer").select("id, full_name").eq("family_account_id", m.customer.family_account_id).neq("id", customerId)
      : Promise.resolve({ data: [] }),
  ]);
  const addresses = (addrRes.data ?? []) as { id: string; label: string | null; address_line: string }[];
  const family = (familyRes.data ?? []) as { id: string; full_name: string }[];
  const referralCode = (m.acct?.member_no ?? customerId.slice(0, 8)).replace(/\s/g, "").replace(/^LWC/, "LW");
  const bday = m.customer.birth_date;
  const waText = encodeURIComponent(`I use The London Wash for our laundry and dry cleaning. Mention my code ${referralCode} when you book.`);
  const initials = m.customer.full_name.split(" ").filter(Boolean).slice(0, 2).map((p) => p[0]).join("").toUpperCase();

  return (
    <AppShell current="/my/profile" title="Profile">
      {searchParams.saved && <Notice tone="ok">Saved.</Notice>}
      {searchParams.error && <Notice tone="danger">{searchParams.error}</Notice>}

      <Card className="flex items-center gap-4 p-4">
        <span className="grid h-14 w-14 place-items-center rounded-full bg-beige text-[18px] font-bold">{initials}</span>
        <span className="min-w-0">
          <b className="block text-[17px]">{m.customer.full_name}</b>
          <span className="text-[13px] text-ink-2">+91 {m.customer.phone}</span>
          <span className="mt-1 block text-[12px] font-bold uppercase tracking-[0.14em] text-brass">{m.tier.name}</span>
        </span>
      </Card>

      <section className="flex flex-col gap-2.5">
        <h2 className="text-[15px] font-semibold">Birthday</h2>
        <Card className="p-4">
          {bday ? (
            <p className="text-[14px]">
              {Number(bday.slice(8, 10))} {MONTHS[Number(bday.slice(5, 7)) - 1]} · Your Birthday Bonus of {m.tier.birthday_points} points is added during your birthday month.
            </p>
          ) : (
            <form action={saveBirthdayAction} className="flex flex-col gap-3">
              <p className="text-[13.5px] text-ink-2">Add your birthday and we&apos;ll add {m.tier.birthday_points} bonus points every year in your birthday month. It&apos;s optional.</p>
              <div className="grid grid-cols-2 gap-2">
                <select name="day" className={input} aria-label="Day" defaultValue="">
                  <option value="" disabled>Day</option>
                  {Array.from({ length: 31 }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}</option>)}
                </select>
                <select name="month" className={input} aria-label="Month" defaultValue="">
                  <option value="" disabled>Month</option>
                  {MONTHS.map((mo, i) => <option key={mo} value={i + 1}>{mo}</option>)}
                </select>
              </div>
              <button type="submit" className={btnGhost + " self-start"}>Save birthday</button>
            </form>
          )}
        </Card>
      </section>

      <section className="flex flex-col gap-2.5">
        <h2 className="text-[15px] font-semibold">Refer a friend</h2>
        <Card className="flex flex-col gap-3 p-4">
          <p className="text-[13.5px] text-ink-2">
            When a friend you refer completes their first paid order, you get {m.cfg.bonus_referral_points} bonus points. Ask them to mention your code when they first book.
          </p>
          <div className="flex items-center justify-between rounded-xl border border-dashed border-hair-2 px-4 py-3">
            <span className="font-mono text-[17px] tracking-[0.14em]">{referralCode}</span>
          </div>
          <a className={btn} href={`https://wa.me/?text=${waText}`} target="_blank" rel="noopener noreferrer">
            Share on WhatsApp
          </a>
        </Card>
      </section>

      <section className="flex flex-col gap-2.5">
        <h2 className="text-[15px] font-semibold">London Wash Family</h2>
        <Card className="p-4 text-[13.5px]">
          {family.length ? (
            <>
              <p className="mb-2 text-ink-2">Orders for everyone in your family count toward your membership.</p>
              <ul className="list-disc pl-5">
                {family.map((f) => <li key={f.id}>{f.full_name}</li>)}
              </ul>
            </>
          ) : (
            <p className="text-ink-2">Ask us at the store to link your family members, so every order counts toward one membership.</p>
          )}
        </Card>
      </section>

      <section className="flex flex-col gap-2.5">
        <h2 className="text-[15px] font-semibold">Saved addresses</h2>
        <Card>
          {addresses.length ? (
            <ul className="divide-y divide-hair">
              {addresses.map((a) => (
                <li key={a.id} className="px-4 py-3 text-[13.5px]">
                  <b className="block">{a.label ?? "Address"}</b>
                  <span className="text-ink-2">{a.address_line}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-4 py-3 text-[13.5px] text-ink-2">Addresses you add when booking a pickup are saved here.</p>
          )}
        </Card>
      </section>

      <section className="flex flex-col gap-2.5">
        <h2 className="text-[15px] font-semibold">Help</h2>
        <Card className="p-4 text-[13.5px] text-ink-2">
          For anything about an order, message us on WhatsApp or call the store. Please have your order number ready.
        </Card>
      </section>

      <form action={signOutAction}>
        <button type="submit" className={btnGhost + " w-full"}>Sign out</button>
      </form>
    </AppShell>
  );
}
