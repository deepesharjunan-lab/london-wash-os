import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { loadStages, normaliseTag, type Stage } from "@/lib/staff/flow";
import { ROLE_LABEL } from "@/lib/staff/roles";
import { createGarmentCondition } from "./actions";

// Garment tracking: where every tagged garment is right now, and its full
// history. Garments are created with the order and move through the stages
// when staff scan their tags in the staff app; this page only reads that.

export const dynamic = "force-dynamic";

const CONDITIONS = ["good", "stained", "damaged", "missing_button", "torn", "faded"];
const WORK_STAGES = new Set(["received", "washing", "ironing", "packing"]);
const DELAY_HOURS = 24;
const LIST_LIMIT = 150;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const one = (x: any) => (Array.isArray(x) ? x[0] ?? null : x ?? null);
const clean = (s: string) => s.replace(/[%,()*]/g, "").trim().slice(0, 60);

const COLS =
  "id, tag_code, current_stage_id, stage_state, stage_started_at, stage_employee_id, created_at, item:item_id(name), order_item:order_item_id(notes, service:service_id(name), item:item_id(name), order:order_id(id, order_number, status, customer:customer_id(full_name, phone)))";

function since(iso: string | null | undefined) {
  if (!iso) return "";
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `${h} h ${mins % 60} min`;
  return `${Math.floor(h / 24)} d ${h % 24} h`;
}
const when = (iso: string) =>
  new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });

async function nameMap(db: any, table: "employee" | "user", ids: (string | null | undefined)[]) {
  const list = [...new Set(ids.filter(Boolean) as string[])];
  if (!list.length) return new Map<string, string>();
  const { data } = await db.from(table).select("id, full_name").in("id", list);
  return new Map<string, string>(((data ?? []) as any[]).map((r) => [r.id, r.full_name]));
}

/** Garment ids matching a tag number, order number, or customer name/phone. */
async function searchGarments(db: any, q: string): Promise<string[]> {
  const found = new Set<string>();
  const digits = q.replace(/\D/g, "");
  if (digits) {
    const { data } = await db.from("garment").select("id").in("tag_code", [...new Set([digits, normaliseTag(digits)])]).limit(50);
    ((data ?? []) as any[]).forEach((g) => found.add(g.id));
  }
  const orderIds = new Set<string>();
  const { data: byNumber } = await db.from("order").select("id").ilike("order_number", `%${q}%`).limit(50);
  ((byNumber ?? []) as any[]).forEach((o) => orderIds.add(o.id));
  const { data: customers } = await db
    .from("customer")
    .select("id")
    .or(`full_name.ilike.%${q}%,phone.ilike.%${digits || q}%`)
    .limit(50);
  const customerIds = ((customers ?? []) as any[]).map((c) => c.id);
  if (customerIds.length) {
    const { data } = await db.from("order").select("id").in("customer_id", customerIds).order("created_at", { ascending: false }).limit(100);
    ((data ?? []) as any[]).forEach((o) => orderIds.add(o.id));
  }
  if (orderIds.size) {
    const { data: items } = await db.from("order_item").select("id").in("order_id", [...orderIds]);
    const itemIds = ((items ?? []) as any[]).map((i) => i.id);
    if (itemIds.length) {
      const { data } = await db.from("garment").select("id").in("order_item_id", itemIds).limit(300);
      ((data ?? []) as any[]).forEach((g) => found.add(g.id));
    }
  }
  return [...found];
}

type View = {
  id: string;
  tag: string;
  item: string;
  service: string;
  notes: string | null;
  orderId: string | null;
  orderNo: string;
  customer: string;
  phone: string;
  stage: Stage | null;
  inProgress: boolean;
  startedAt: string | null;
  employeeId: string | null;
  createdAt: string;
};

function toView(g: any, stages: Stage[]): View {
  const oi = one(g.order_item);
  const o = one(oi?.order);
  const c = one(o?.customer);
  return {
    id: g.id,
    tag: g.tag_code || g.id.slice(0, 8),
    item: one(g.item)?.name ?? one(oi?.item)?.name ?? "Garment",
    service: one(oi?.service)?.name ?? "",
    notes: oi?.notes ?? null,
    orderId: o?.id ?? null,
    orderNo: o?.order_number ?? "—",
    customer: c?.full_name ?? "—",
    phone: c?.phone ?? "",
    stage: stages.find((s) => s.id === g.current_stage_id) ?? null,
    inProgress: g.stage_state === "in_progress",
    startedAt: g.stage_started_at,
    employeeId: g.stage_employee_id,
    createdAt: g.created_at,
  };
}

export default async function GarmentsPage({ searchParams }: { searchParams: { q?: string; stage?: string; g?: string } }) {
  const db = createClient() as any;
  const stages = await loadStages(db);
  const delivered = stages.find((s) => s.code === "delivered") ?? null;
  const q = clean(searchParams.q ?? "");
  const stageFilter = stages.find((s) => s.code === searchParams.stage) ?? null;
  const selectedId = searchParams.g && UUID.test(searchParams.g) ? searchParams.g : null;

  const href = (p: { q?: string; stage?: string; g?: string }) => {
    const sp = new URLSearchParams();
    if (p.q) sp.set("q", p.q);
    if (p.stage) sp.set("stage", p.stage);
    if (p.g) sp.set("g", p.g);
    const s = sp.toString();
    return `/garments${s ? `?${s}` : ""}`;
  };

  // How many garments sit at each stage right now.
  const counts = await Promise.all(
    stages.map(async (s) => {
      const { count } = await db.from("garment").select("id", { count: "exact", head: true }).eq("current_stage_id", s.id);
      return count ?? 0;
    })
  );
  const activeTotal = stages.reduce((sum, s, i) => (s.code === "delivered" ? sum : sum + counts[i]), 0);

  // The list: search results, one stage, or everything not yet delivered.
  const ids = q ? await searchGarments(db, q) : null;
  let rows: View[] = [];
  if (!ids || ids.length) {
    let query = db.from("garment").select(COLS).order("created_at", { ascending: false }).limit(LIST_LIMIT);
    if (ids) query = query.in("id", ids.slice(0, 300));
    if (stageFilter) query = query.eq("current_stage_id", stageFilter.id);
    else if (!ids && delivered) query = query.or(`current_stage_id.is.null,current_stage_id.neq.${delivered.id}`);
    const { data } = await query;
    rows = ((data ?? []) as any[]).map((g) => toView(g, stages));
  }

  // When each garment arrived at its current stage: when work started, else its last move.
  const lastMove = new Map<string, string>();
  if (rows.length) {
    const { data } = await db
      .from("garment_event")
      .select("garment_id, created_at")
      .in("garment_id", rows.map((r) => r.id))
      .order("created_at", { ascending: false })
      .limit(1000);
    for (const e of (data ?? []) as any[]) if (!lastMove.has(e.garment_id)) lastMove.set(e.garment_id, e.created_at);
  }
  const atStageSince = (r: View) => (r.inProgress && r.startedAt ? r.startedAt : lastMove.get(r.id) ?? r.createdAt);
  const isDelayed = (r: View) =>
    !!r.stage && WORK_STAGES.has(r.stage.code) && Date.now() - new Date(atStageSince(r)).getTime() > DELAY_HOURS * 3600000;

  // Selected garment: full timeline and condition notes.
  let selected: View | null = null;
  let events: any[] = [];
  let conditions: any[] = [];
  if (selectedId) {
    const [{ data: g }, { data: ev }, { data: cond }] = await Promise.all([
      db.from("garment").select(COLS).eq("id", selectedId).maybeSingle(),
      db
        .from("garment_event")
        .select("id, event_type, from_stage_id, to_stage_id, actor_employee_id, actor_user_id, metadata, created_at")
        .eq("garment_id", selectedId)
        .order("created_at"),
      db.from("garment_condition").select("id, tag, note, recorded_by, created_at").eq("garment_id", selectedId).order("created_at", { ascending: false }),
    ]);
    if (g) {
      selected = toView(g, stages);
      events = (ev ?? []) as any[];
      conditions = (cond ?? []) as any[];
    }
  }

  const [employees, users] = await Promise.all([
    nameMap(db, "employee", [...rows.map((r) => r.employeeId), selected?.employeeId, ...events.map((e) => e.actor_employee_id)]),
    nameMap(db, "user", [...events.map((e) => e.actor_user_id), ...conditions.map((c) => c.recorded_by)]),
  ]);
  const stageName = (id: string | null) => stages.find((s) => s.id === id)?.name ?? "—";
  const who = (e: any) => employees.get(e.actor_employee_id) ?? users.get(e.actor_user_id) ?? e.metadata?.by ?? "System";
  const describe = (e: any) => {
    const mins = e.metadata?.minutes;
    switch (e.event_type) {
      case "stage_started":
        return `Started ${stageName(e.from_stage_id)}`;
      case "stage_finished":
        return `Finished ${stageName(e.from_stage_id)} → ${stageName(e.to_stage_id)}${mins != null ? ` · took ${mins} min` : ""}`;
      case "stage_skipped":
        return `Skipped ${stageName(e.from_stage_id)} → ${stageName(e.to_stage_id)}`;
      case "stage_change":
        return `Moved to ${stageName(e.to_stage_id)}`;
      default:
        return String(e.event_type).replace(/_/g, " ");
    }
  };

  const status = (r: View) => {
    if (!r.stage) return { label: "No stage", detail: "", tone: "bg-black/5 text-ink/60" };
    const t = since(atStageSince(r));
    if (r.stage.code === "delivered") return { label: "Delivered", detail: "", tone: "bg-[#e2eee7] text-[#2c6a4e]" };
    if (r.inProgress)
      return { label: `${r.stage.name} · in progress`, detail: `${employees.get(r.employeeId ?? "") ?? "Staff"} · ${t}`, tone: "bg-[#fdf0dc] text-[#8a5a12]" };
    const team = r.stage.app_role ? ROLE_LABEL[r.stage.app_role] : "";
    return {
      label: r.stage.code === "ready" ? "Ready" : `${r.stage.name} · waiting`,
      detail: r.stage.code === "ready" ? `ready for ${t}` : `${team ? `for ${team} · ` : ""}${t}`,
      tone: r.stage.code === "ready" ? "bg-[#e2eee7] text-[#2c6a4e]" : "bg-[#e8eef5] text-[#2c4a6a]",
    };
  };

  const chip = (active: boolean) =>
    `rounded-full border px-3.5 py-1.5 text-[13px] font-medium transition ${
      active ? "border-navy bg-navy text-white" : "border-black/10 bg-white text-ink hover:border-navy/40"
    }`;

  return (
    <div>
      <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-accent">Production</div>
      <h1 className="mb-2 font-archivo text-2xl font-extrabold text-ink">Garment Tracking</h1>
      <p className="mb-5 text-sm text-ink/60">
        Where every tagged garment is right now. Garments move through the stages when staff scan their tags in the staff app.
      </p>

      <form action="/garments" className="mb-4 flex flex-wrap gap-2">
        <input
          name="q"
          defaultValue={q}
          placeholder="Search tag number, order number, customer name or phone"
          className="min-w-[260px] flex-1 border border-black/10 bg-white px-3 py-2.5 text-sm outline-none focus:border-accent"
        />
        {stageFilter && <input type="hidden" name="stage" value={stageFilter.code} />}
        <button type="submit" className="rounded-md bg-slate-900 px-5 py-2 text-sm font-medium text-white">
          Search
        </button>
        {(q || stageFilter) && (
          <Link href="/garments" className="rounded-md border border-black/10 bg-white px-4 py-2 text-sm text-ink/70">
            Clear
          </Link>
        )}
      </form>

      <div className="mb-5 flex flex-wrap gap-2">
        <Link href={href({ q })} className={chip(!stageFilter)}>
          {q ? "All matches" : "All in progress"} {!q && <b className="ml-1">{activeTotal}</b>}
        </Link>
        {stages.map((s, i) => (
          <Link key={s.id} href={href({ q, stage: s.code })} className={chip(stageFilter?.id === s.id)}>
            {s.name} <b className="ml-1">{counts[i]}</b>
          </Link>
        ))}
      </div>

      <div className={`grid gap-4 ${selected ? "xl:grid-cols-[1fr_400px]" : ""}`}>
        <section className="overflow-x-auto border-2 border-black/10 bg-white">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b-2 border-black/10 text-left text-[11px] uppercase tracking-wide text-ink/50">
                <th className="px-4 py-2.5">Tag</th>
                <th className="px-4 py-2.5">Order · customer</th>
                <th className="px-4 py-2.5">Item</th>
                <th className="px-4 py-2.5">Where it is now</th>
                <th className="px-4 py-2.5"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const st = status(r);
                const delayed = isDelayed(r);
                return (
                  <tr key={r.id} className={`border-b border-black/5 last:border-0 ${selected?.id === r.id ? "bg-[#fbf7ef]" : ""}`}>
                    <td className="px-4 py-3 font-mono text-[13px] font-semibold text-ink">{r.tag}</td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-ink">{r.orderNo}</div>
                      <div className="text-[12.5px] text-ink/55">{r.customer}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-ink">{r.item}</div>
                      <div className="text-[12.5px] text-ink/55">{r.service}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-block rounded-full px-2.5 py-1 text-[12px] font-semibold ${st.tone}`}>{st.label}</span>
                      {delayed && (
                        <span className="ml-1.5 inline-block rounded-full bg-[#f6e4df] px-2.5 py-1 text-[12px] font-semibold text-[#9c3326]">Delayed</span>
                      )}
                      {st.detail && <div className="mt-1 text-[12px] text-ink/55">{st.detail}</div>}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link href={href({ q, stage: stageFilter?.code, g: r.id })} className="whitespace-nowrap text-[13px] font-medium text-accent hover:underline">
                        Timeline →
                      </Link>
                    </td>
                  </tr>
                );
              })}
              {!rows.length && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-ink/40">
                    {q ? `No garments found for “${q}”.` : stageFilter ? `No garments at ${stageFilter.name}.` : "No garments in progress right now."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          {rows.length === LIST_LIMIT && (
            <p className="border-t border-black/5 px-4 py-2.5 text-[12.5px] text-ink/50">Showing the newest {LIST_LIMIT}. Search or pick a stage to narrow it down.</p>
          )}
        </section>

        {selected && (
          <aside className="self-start border-2 border-black/10 bg-white p-5">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-wide text-ink/50">Tag {selected.tag}</div>
                <h2 className="text-[17px] font-bold text-ink">{selected.item}</h2>
                <div className="text-[13px] text-ink/60">
                  {selected.service}
                  {selected.orderId ? (
                    <>
                      {" · "}
                      <Link href={`/orders/${selected.orderId}`} className="text-accent hover:underline">
                        {selected.orderNo}
                      </Link>
                    </>
                  ) : null}
                </div>
                <div className="text-[13px] text-ink/60">
                  {selected.customer}
                  {selected.phone ? ` · ${selected.phone}` : ""}
                </div>
              </div>
              <Link href={href({ q, stage: stageFilter?.code })} aria-label="Close" className="text-[20px] leading-none text-ink/40 hover:text-ink">
                ×
              </Link>
            </div>

            <div className="mb-4">
              {(() => {
                const st = status(selected);
                return (
                  <>
                    <span className={`inline-block rounded-full px-2.5 py-1 text-[12px] font-semibold ${st.tone}`}>{st.label}</span>
                    {isDelayed(selected) && (
                      <span className="ml-1.5 inline-block rounded-full bg-[#f6e4df] px-2.5 py-1 text-[12px] font-semibold text-[#9c3326]">Delayed</span>
                    )}
                    {st.detail && <div className="mt-1 text-[12.5px] text-ink/55">{st.detail}</div>}
                  </>
                );
              })()}
              {selected.notes && <p className="mt-2 rounded-lg bg-[#fbf7ef] px-3 py-2 text-[13px] text-ink/75">Note: {selected.notes}</p>}
            </div>

            <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-ink/50">Timeline</h3>
            <ol className="mb-5 border-l-2 border-black/10 pl-4">
              <li className="relative pb-3">
                <span className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full bg-black/25" />
                <div className="text-[13.5px] text-ink">Tag created with the order</div>
                <div className="text-[12px] text-ink/50">{when(selected.createdAt)}</div>
              </li>
              {events.map((e) => (
                <li key={e.id} className="relative pb-3">
                  <span
                    className={`absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full ${
                      e.event_type === "stage_finished" ? "bg-[#2c6a4e]" : e.event_type === "stage_started" ? "bg-[#c98a1e]" : "bg-navy/50"
                    }`}
                  />
                  <div className="text-[13.5px] text-ink">{describe(e)}</div>
                  <div className="text-[12px] text-ink/50">
                    {who(e)} · {when(e.created_at)}
                  </div>
                </li>
              ))}
              {selected.stage && selected.stage.code !== "delivered" && (
                <li className="relative">
                  <span className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full border-2 border-navy bg-white" />
                  <div className="text-[13.5px] font-medium text-ink">
                    Now: {selected.stage.name} ({selected.inProgress ? "in progress" : "waiting"})
                  </div>
                  <div className="text-[12px] text-ink/50">for {since(atStageSince(selected))}</div>
                </li>
              )}
            </ol>

            <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-ink/50">Condition notes</h3>
            {conditions.length ? (
              <ul className="mb-3 space-y-2">
                {conditions.map((c) => (
                  <li key={c.id} className="text-[13px]">
                    <span
                      className={`mr-1.5 rounded px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${
                        c.tag === "good" ? "bg-[#e2eee7] text-[#2c6a4e]" : "bg-[#fdf0dc] text-[#8a5a12]"
                      }`}
                    >
                      {String(c.tag).replace(/_/g, " ")}
                    </span>
                    {c.note}
                    <div className="text-[12px] text-ink/50">
                      {users.get(c.recorded_by) ?? "Staff"} · {when(c.created_at)}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mb-3 text-[13px] text-ink/45">No condition notes.</p>
            )}
            <form action={createGarmentCondition} className="space-y-2 rounded-lg bg-[#fbf7ef] p-3">
              <input type="hidden" name="garment_id" value={selected.id} />
              <div className="flex gap-2">
                <select name="tag" required className="border border-black/10 bg-white px-2 py-1.5 text-sm">
                  {CONDITIONS.map((t) => (
                    <option key={t} value={t}>
                      {t.replace(/_/g, " ")}
                    </option>
                  ))}
                </select>
                <input name="note" placeholder="Note (optional)" className="min-w-0 flex-1 border border-black/10 bg-white px-2 py-1.5 text-sm" />
              </div>
              <button type="submit" className="w-full rounded-md bg-slate-900 py-1.5 text-sm font-medium text-white">
                Add condition note
              </button>
            </form>
          </aside>
        )}
      </div>
    </div>
  );
}
