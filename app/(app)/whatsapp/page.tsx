import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { markUnreadAction, setBotAction, setClosedAction } from "./actions";
import { Composer, LiveRefresh, MediaView, ScrollToEnd, SoundToggle } from "./ui";
import { MEDIA_LABEL } from "@/lib/whatsapp/client";

// WhatsApp inbox: every conversation on The London Wash WhatsApp number, with
// the bot's replies and the team's. Staff reply here; while they do, the bot
// stays quiet (whatsapp_contact.handoff_until). The WhatsApp tables are
// service-role only, so this page checks for a console sign-in and then reads
// them with the admin client.

export const dynamic = "force-dynamic";

const WINDOW_MS = 24 * 3600000;
const LIST_LIMIT = 80;
const MESSAGE_LIMIT = 300;

type Contact = {
  wa_id: string;
  profile_name: string | null;
  customer_id: string | null;
  last_message_at: string | null;
  last_preview: string | null;
  last_direction: string | null;
  unread_count: number;
  handoff_until: string | null;
  closed_at: string | null;
  closed_by_user_id: string | null;
  last_inbound_at: string | null;
  customer: { full_name: string | null; phone: string | null } | { full_name: string | null; phone: string | null }[] | null;
};
type Message = {
  id: string;
  direction: "in" | "out";
  msg_type: string | null;
  body: string | null;
  status: string | null;
  sent_by_user_id: string | null;
  created_at: string;
  media_id: string | null;
  media_mime: string | null;
  media_name: string | null;
};

const LABELS = new Set(Object.values(MEDIA_LABEL));
/** The caption part of a file message's text (drops the "📷 Photo" label and the file name). */
function captionOf(m: Message) {
  const parts = (m.body ?? "").split(" · ");
  if (LABELS.has(parts[0])) parts.shift();
  if (m.media_name && parts[0] === m.media_name) parts.shift();
  return parts.join(" · ").trim();
}

const CONTACT_COLS =
  "wa_id, profile_name, customer_id, last_message_at, last_preview, last_direction, unread_count, handoff_until, last_inbound_at, closed_at, closed_by_user_id, customer:customer_id(full_name, phone)";
const FILTERS = ["open", "unread", "staff", "closed"] as const;
type Filter = (typeof FILTERS)[number];

const one = <T,>(x: T | T[] | null): T | null => (Array.isArray(x) ? x[0] ?? null : x);
const clean = (s: string) => s.replace(/[%,()*]/g, "").trim().slice(0, 60);
const phone = (wa: string) => (wa.length === 12 && wa.startsWith("91") ? `+91 ${wa.slice(2, 7)} ${wa.slice(7)}` : `+${wa}`);
const nameOf = (c: Contact) => one(c.customer)?.full_name || c.profile_name || phone(c.wa_id);
const staffHandling = (c: Contact) => !!c.handoff_until && new Date(c.handoff_until).getTime() > Date.now();

const tz = { timeZone: "Asia/Kolkata" } as const;
const time = (iso: string) => new Date(iso).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", ...tz });
const day = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", ...tz });
function listWhen(iso: string | null) {
  if (!iso) return "";
  return day(iso) === day(new Date().toISOString()) ? time(iso) : new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", ...tz });
}

const TICKS: Record<string, string> = { sent: "✓", delivered: "✓✓", read: "✓✓ read", failed: "not delivered" };
const ORDER_STATUS: Record<string, string> = {
  draft: "Draft",
  confirmed: "Received",
  in_production: "Being cleaned",
  ready: "Ready",
  out_for_delivery: "Out for delivery",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

export default async function WhatsAppInboxPage({ searchParams }: { searchParams: { c?: string; f?: string; q?: string } }) {
  const { data: auth } = await createClient().auth.getUser();
  if (!auth?.user) return <p className="text-sm text-ink/60">Sign in to see the WhatsApp inbox.</p>;

  const db = createAdminClient() as any;
  const filter: Filter = (FILTERS as readonly string[]).includes(searchParams.f ?? "") ? (searchParams.f as Filter) : "open";
  const q = clean(searchParams.q ?? "");
  const selectedId = (searchParams.c ?? "").replace(/\D/g, "").slice(0, 20) || null;

  const href = (p: { c?: string | null; f?: string; q?: string }) => {
    const sp = new URLSearchParams();
    if (p.f && p.f !== "open") sp.set("f", p.f);
    if (p.q) sp.set("q", p.q);
    if (p.c) sp.set("c", p.c);
    const s = sp.toString();
    return `/whatsapp${s ? `?${s}` : ""}`;
  };

  // Conversation list.
  let list = db.from("whatsapp_contact").select(CONTACT_COLS).order("last_message_at", { ascending: false, nullsFirst: false }).limit(LIST_LIMIT);
  // Search looks through every chat, closed ones included; otherwise "Open" hides closed chats.
  if (filter === "open" && !q) list = list.is("closed_at", null);
  if (filter === "closed") list = list.not("closed_at", "is", null);
  if (filter === "unread") list = list.gt("unread_count", 0);
  if (filter === "staff") list = list.gt("handoff_until", new Date().toISOString()).is("closed_at", null);
  const loadList = async () => {
    if (q) {
      const digits = q.replace(/\D/g, "");
      const { data: matches } = await db.from("customer").select("id").ilike("full_name", `%${q}%`).limit(50);
      const ids = ((matches ?? []) as { id: string }[]).map((m) => m.id);
      const ors = [`profile_name.ilike.%${q}%`];
      if (digits.length >= 3) ors.push(`wa_id.ilike.%${digits}%`);
      if (ids.length) ors.push(`customer_id.in.(${ids.join(",")})`);
      list = list.or(ors.join(","));
    }
    const { data } = await list;
    return (data ?? []) as Contact[];
  };

  const nowIso = new Date().toISOString();
  const loadCounts = () =>
    Promise.all([
      db.from("whatsapp_contact").select("wa_id", { count: "exact", head: true }).is("closed_at", null),
      db.from("whatsapp_contact").select("wa_id", { count: "exact", head: true }).gt("unread_count", 0),
      db.from("whatsapp_contact").select("wa_id", { count: "exact", head: true }).gt("handoff_until", nowIso).is("closed_at", null),
    ]);

  // Open conversation: the chat and its messages load together, then names and orders together.
  type OrderRow = { id: string; order_number: string; status: string; created_at: string };
  const loadSelected = async (): Promise<{ selected: Contact | null; messages: Message[]; orders: OrderRow[]; staffNames: Map<string, string> }> => {
    const staffNames = new Map<string, string>();
    if (!selectedId) return { selected: null, messages: [], orders: [], staffNames };
    const [{ data: c }, { data: m }] = await Promise.all([
      db.from("whatsapp_contact").select(CONTACT_COLS).eq("wa_id", selectedId).maybeSingle(),
      db
        .from("whatsapp_message")
        .select("id, direction, msg_type, body, status, sent_by_user_id, created_at, media_id, media_mime, media_name")
        .eq("wa_id", selectedId)
        .order("created_at", { ascending: false })
        .limit(MESSAGE_LIMIT),
    ]);
    const selected = (c as Contact | null) ?? null;
    if (!selected) return { selected: null, messages: [], orders: [], staffNames };
    const messages = ((m ?? []) as Message[]).reverse();
    const userIds = [...new Set([...messages.map((x) => x.sent_by_user_id), selected.closed_by_user_id].filter(Boolean) as string[])];
    const [users, o] = await Promise.all([
      userIds.length ? db.from("user").select("id, full_name").in("id", userIds) : Promise.resolve({ data: [] }),
      selected.customer_id
        ? db.from("order").select("id, order_number, status, created_at").eq("customer_id", selected.customer_id).neq("status", "draft").order("created_at", { ascending: false }).limit(4)
        : Promise.resolve({ data: [] }),
      // Opening a chat marks it read (the sidebar badge drops straight away).
      selected.unread_count > 0
        ? db.from("whatsapp_contact").update({ unread_count: 0, staff_read_at: nowIso }).eq("wa_id", selectedId)
        : Promise.resolve(null),
    ]);
    for (const u of ((users as any).data ?? []) as { id: string; full_name: string }[]) staffNames.set(u.id, u.full_name);
    return { selected, messages, orders: ((o as any).data ?? []) as OrderRow[], staffNames };
  };

  const [contacts, [{ count: openChats }, { count: unreadChats }, { count: staffChats }], { selected, messages, orders, staffNames }] = await Promise.all([
    loadList(),
    loadCounts(),
    loadSelected(),
  ]);
  if (selected && selected.unread_count > 0) {
    const row = contacts.find((x) => x.wa_id === selected.wa_id);
    if (row) row.unread_count = 0;
  }

  const windowEnds = selected?.last_inbound_at ? new Date(selected.last_inbound_at).getTime() + WINDOW_MS : 0;
  const blockedReason = !selected
    ? null
    : !windowEnds || windowEnds < Date.now()
      ? "This customer last messaged more than 24 hours ago. WhatsApp only delivers a normal reply within 24 hours of their last message, so call them or wait for them to write again."
      : null;

  const chip = (active: boolean) =>
    `rounded-full border px-3 py-1 text-[12.5px] font-medium transition ${active ? "border-navy bg-navy text-white" : "border-black/10 bg-white text-ink hover:border-navy/40"}`;

  return (
    <div>
      <LiveRefresh />
      <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-accent">Sales</div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-archivo text-2xl font-extrabold text-ink">WhatsApp Inbox</h1>
        <SoundToggle />
      </div>
      <p className="mb-5 text-sm text-ink/60">
        Customer chats on our WhatsApp number. The bot answers first; when a customer asks for a person, or you reply here, the bot stays quiet for 4 hours. Close a chat when you're done; it reopens if the customer writes again.
      </p>

      <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
        {/* Conversation list */}
        <section className={`border-2 border-black/10 bg-white ${selected ? "hidden lg:block" : ""}`}>
          <div className="border-b border-black/10 p-3">
            <form action="/whatsapp" className="mb-2.5 flex gap-2">
              {filter !== "open" && <input type="hidden" name="f" value={filter} />}
              <input
                name="q"
                defaultValue={q}
                placeholder="Search name or number"
                className="min-w-0 flex-1 border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-accent"
              />
              <button type="submit" className="rounded-md bg-slate-900 px-3.5 py-2 text-sm font-medium text-white">
                Search
              </button>
            </form>
            <div className="flex flex-wrap gap-1.5">
              <Link href={href({ q })} className={chip(filter === "open")}>
                Open {openChats ? <b className="ml-0.5">{openChats}</b> : null}
              </Link>
              <Link href={href({ f: "unread", q })} className={chip(filter === "unread")}>
                Unread {unreadChats ? <b className="ml-0.5">{unreadChats}</b> : null}
              </Link>
              <Link href={href({ f: "staff", q })} className={chip(filter === "staff")}>
                With staff {staffChats ? <b className="ml-0.5">{staffChats}</b> : null}
              </Link>
              <Link href={href({ f: "closed", q })} className={chip(filter === "closed")}>
                Closed
              </Link>
            </div>
          </div>
          <ul className="max-h-[70vh] overflow-y-auto">
            {contacts.map((c) => {
              const active = c.wa_id === selectedId;
              return (
                <li key={c.wa_id}>
                  <Link
                    href={href({ c: c.wa_id, f: filter, q })}
                    className={`block border-b border-black/5 px-4 py-3 transition ${active ? "bg-[#fbf7ef]" : "hover:bg-black/[0.02]"}`}
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <span className={`truncate text-[14px] ${c.unread_count ? "font-bold text-ink" : "font-semibold text-ink/85"}`}>{nameOf(c)}</span>
                      <span className="shrink-0 text-[11.5px] text-ink/45">{listWhen(c.last_message_at)}</span>
                    </div>
                    <div className="mt-0.5 flex items-center gap-2">
                      <span className={`min-w-0 flex-1 truncate text-[12.5px] ${c.unread_count ? "text-ink/80" : "text-ink/50"}`}>
                        {c.last_direction === "out" ? "You: " : ""}
                        {c.last_preview ?? ""}
                      </span>
                      {c.closed_at && <span className="shrink-0 rounded-full bg-black/5 px-2 py-0.5 text-[10.5px] font-semibold text-ink/55">Closed</span>}
                      {staffHandling(c) && <span className="shrink-0 rounded-full bg-[#fdf0dc] px-2 py-0.5 text-[10.5px] font-semibold text-[#8a5a12]">Staff</span>}
                      {c.unread_count > 0 && (
                        <span className="grid h-5 min-w-5 shrink-0 place-items-center rounded-full bg-[#1f7a4d] px-1.5 text-[11px] font-bold text-white">{c.unread_count}</span>
                      )}
                    </div>
                  </Link>
                </li>
              );
            })}
            {!contacts.length && (
              <li className="px-4 py-10 text-center text-sm text-ink/40">
                {q
                  ? `No chats found for “${q}”.`
                  : filter === "unread"
                    ? "No unread chats."
                    : filter === "staff"
                      ? "No chats waiting for staff."
                      : filter === "closed"
                        ? "No closed chats yet."
                        : "No open chats. Closed chats are under Closed."}
              </li>
            )}
          </ul>
        </section>

        {/* Conversation */}
        {selected ? (
          <section className="flex min-h-[70vh] flex-col border-2 border-black/10 bg-white">
            <header className="flex flex-wrap items-start justify-between gap-3 border-b border-black/10 px-4 py-3">
              <div className="min-w-0">
                <Link href={href({ f: filter, q })} className="mb-1 inline-block text-[12.5px] text-accent hover:underline lg:hidden">
                  ← All chats
                </Link>
                <h2 className="truncate text-[17px] font-bold text-ink">{nameOf(selected)}</h2>
                <div className="text-[13px] text-ink/60">
                  {phone(selected.wa_id)}
                  {selected.profile_name && one(selected.customer)?.full_name && selected.profile_name !== one(selected.customer)?.full_name
                    ? ` · WhatsApp name “${selected.profile_name}”`
                    : ""}
                  {selected.customer_id ? (
                    <>
                      {" · "}
                      <Link href={`/customers/${selected.customer_id}`} className="text-accent hover:underline">
                        Customer profile
                      </Link>
                    </>
                  ) : (
                    " · not matched to a customer"
                  )}
                </div>
                {orders.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {orders.map((o) => (
                      <Link key={o.id} href={`/orders/${o.id}`} className="rounded-full border border-black/10 px-2.5 py-0.5 text-[12px] text-ink/75 hover:border-navy/40">
                        {o.order_number} · {ORDER_STATUS[o.status] ?? o.status}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1.5">
                {selected.closed_at ? (
                  <>
                    <span className="rounded-full bg-black/5 px-2.5 py-1 text-[12px] font-semibold text-ink/60">
                      Closed{selected.closed_by_user_id && staffNames.get(selected.closed_by_user_id) ? ` by ${staffNames.get(selected.closed_by_user_id)}` : ""} ·{" "}
                      {listWhen(selected.closed_at)}
                    </span>
                    <form action={setClosedAction}>
                      <input type="hidden" name="wa_id" value={selected.wa_id} />
                      <input type="hidden" name="mode" value="reopen" />
                      <button type="submit" className="rounded-md border border-black/10 bg-white px-3 py-1.5 text-[12.5px] font-medium text-ink hover:border-navy/40">
                        Reopen chat
                      </button>
                    </form>
                  </>
                ) : (
                  <form action={setClosedAction}>
                    <input type="hidden" name="wa_id" value={selected.wa_id} />
                    <input type="hidden" name="mode" value="close" />
                    <button
                      type="submit"
                      title="Moves the chat to Closed and hands it back to the bot. It reopens by itself if the customer writes again."
                      className="rounded-md bg-slate-900 px-3.5 py-1.5 text-[12.5px] font-semibold text-white hover:bg-slate-800"
                    >
                      ✓ Close chat
                    </button>
                  </form>
                )}
                {selected.closed_at ? null : staffHandling(selected) ? (
                  <>
                    <span className="rounded-full bg-[#fdf0dc] px-2.5 py-1 text-[12px] font-semibold text-[#8a5a12]">
                      Bot paused until {time(selected.handoff_until!)}
                    </span>
                    <form action={setBotAction}>
                      <input type="hidden" name="wa_id" value={selected.wa_id} />
                      <input type="hidden" name="mode" value="resume" />
                      <button type="submit" className="rounded-md border border-black/10 bg-white px-3 py-1.5 text-[12.5px] font-medium text-ink hover:border-navy/40">
                        Hand back to bot
                      </button>
                    </form>
                  </>
                ) : (
                  <>
                    <span className="rounded-full bg-[#e2eee7] px-2.5 py-1 text-[12px] font-semibold text-[#2c6a4e]">Bot is answering</span>
                    <form action={setBotAction}>
                      <input type="hidden" name="wa_id" value={selected.wa_id} />
                      <input type="hidden" name="mode" value="pause" />
                      <button type="submit" className="rounded-md border border-black/10 bg-white px-3 py-1.5 text-[12.5px] font-medium text-ink hover:border-navy/40">
                        Pause bot, I'll reply
                      </button>
                    </form>
                  </>
                )}
                <form action={markUnreadAction}>
                  <input type="hidden" name="wa_id" value={selected.wa_id} />
                  <button type="submit" className="text-[12px] text-ink/50 hover:text-ink hover:underline">
                    Mark as unread
                  </button>
                </form>
              </div>
            </header>

            <div className="flex-1 space-y-2 overflow-y-auto bg-[#f4efe6] px-3 py-4 sm:px-5" style={{ maxHeight: "60vh" }}>
              {messages.length === MESSAGE_LIMIT && <p className="text-center text-[12px] text-ink/45">Showing the latest {MESSAGE_LIMIT} messages.</p>}
              {messages.map((m, i) => {
                const newDay = i === 0 || day(messages[i - 1].created_at) !== day(m.created_at);
                const out = m.direction === "out";
                const staff = out && m.sent_by_user_id;
                const isMedia = !out && m.body?.startsWith("[") && m.body.endsWith("]");
                return (
                  <div key={m.id}>
                    {newDay && (
                      <div className="my-3 text-center">
                        <span className="rounded-full bg-white/70 px-3 py-1 text-[11.5px] font-medium text-ink/55">{day(m.created_at)}</span>
                      </div>
                    )}
                    <div className={`flex ${out ? "justify-end" : "justify-start"}`}>
                      <div
                        className={`max-w-[80%] rounded-lg px-3 py-2 text-[13.5px] shadow-sm ${
                          staff ? "bg-[#d9f2e3] text-ink" : out ? "bg-white/80 text-ink/80" : "bg-white text-ink"
                        }`}
                      >
                        {out && (
                          <div className={`mb-0.5 text-[11px] font-semibold ${staff ? "text-[#1f7a4d]" : "text-ink/45"}`}>
                            {staff ? staffNames.get(m.sent_by_user_id!) ?? "Staff" : m.msg_type === "template" ? "Automatic message" : "Bot"}
                          </div>
                        )}
                        {m.media_id ? (
                          <div className="space-y-1.5">
                            <MediaView id={m.media_id} kind={m.msg_type ?? "document"} mime={m.media_mime} name={m.media_name} />
                            {captionOf(m) && <span className="block whitespace-pre-wrap break-words">{captionOf(m)}</span>}
                          </div>
                        ) : isMedia ? (
                          <span className="italic text-ink/55">
                            {m.body!.slice(1, -1)} received before file viewing was added, so it can't be shown here.
                          </span>
                        ) : (
                          <span className="whitespace-pre-wrap break-words">{m.body}</span>
                        )}
                        <div className="mt-1 text-right text-[10.5px] text-ink/45">
                          {time(m.created_at)}
                          {out && m.status ? <span className={m.status === "failed" ? "ml-1.5 text-[#9c3326]" : "ml-1.5"}>{TICKS[m.status] ?? m.status}</span> : null}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
              {!messages.length && <p className="py-10 text-center text-sm text-ink/40">No messages in this chat yet.</p>}
              <ScrollToEnd marker={messages[messages.length - 1]?.id ?? ""} />
            </div>

            {!blockedReason && windowEnds - Date.now() < 3 * 3600000 && (
              <p className="border-t border-black/10 bg-white px-4 py-1.5 text-[12px] text-[#8a5a12]">Reply window closes at {time(new Date(windowEnds).toISOString())}.</p>
            )}
            <Composer waId={selected.wa_id} blockedReason={blockedReason} />
          </section>
        ) : (
          <section className="hidden min-h-[50vh] place-items-center border-2 border-dashed border-black/10 bg-white/50 p-8 text-center text-sm text-ink/45 lg:grid">
            Choose a chat on the left to read it and reply.
          </section>
        )}
      </div>
    </div>
  );
}
